/**
 * Truvo SDK Anchor Client
 *
 * Implements the SEP-10 (Web Authentication) and SEP-24 (Interactive
 * Withdrawal) flows against the Truvo reference anchor
 * (`testanchor.stellar.org`) as documented in `/docs/anchor-integration.md`.
 *
 * All HTTP calls are wrapped with the SDK's exponential-backoff retry for
 * transient failures and throw typed errors on API rejections.
 */

import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { retryWithBackoff } from "../retry";
import { TruvoAnchorApiError, TruvoAnchorAuthError, TruvoAnchorError } from "./errors";
import type {
  KycStatus,
  Sep10ChallengeResponse,
  Sep10TokenResponse,
  Sep12CustomerResponse,
  Sep24TransactionResponse,
  WithdrawalInteractiveResponse,
  WithdrawalKycState,
  WithdrawalKycStatus,
  WithdrawalStatus,
  WithdrawalTransaction,
} from "./types";

// ============================================================================
// Types
// ============================================================================

/** Configuration for the {@link AnchorClient}. */
export interface AnchorClientConfig {
  /** SEP-10 web auth endpoint (e.g. `"https://testanchor.stellar.org/auth"`). */
  authUrl: string;
  /** SEP-24 transfer server base URL (e.g. `"https://testanchor.stellar.org/sep24"`). */
  sep24Url: string;
  /**
   * SEP-12 KYC server base URL (e.g. `"https://testanchor.stellar.org/sep12"`).
   * Required for the KYC-aware helpers ({@link AnchorClient.getCustomerKycStatus},
   * {@link AnchorClient.getWithdrawalKycStatus}).
   */
  sep12Url?: string;
  /** Network passphrase the anchor operates on (defaults to testnet). */
  networkPassphrase?: string;
  /**
   * Optional pre-minted SEP-10 JWT. When supplied, {@link AnchorClient.authenticate}
   * is not required (and is skipped by {@link AnchorClient.ensureAuthenticated}).
   */
  authToken?: string;
  /**
   * Maximum number of retry attempts for transient network errors.
   * Defaults to 3. Set to 0 to disable automatic retries.
   */
  maxRetries?: number;
}

/** Input for {@link AnchorClient.initiateWithdrawal}. */
export interface InitiateWithdrawalInput {
  /** Asset code to withdraw (e.g. `"SRT"`, `"USDC"`, `"native"`). */
  assetCode: string;
  /** Withdrawal amount as a decimal string (e.g. `"5"`). */
  amount: string;
  /** Public key (G…) of the worker's Stellar account to withdraw from. */
  account: string;
  /**
   * Optional `memo` sent to the anchor for informational purposes (SEP-24
   * request field; distinct from the Stellar payment memo the anchor
   * returns in the transaction status).
   */
  memo?: string;
}

/** Result of {@link AnchorClient.initiateWithdrawal}. */
export interface InitiateWithdrawalResult {
  /** Anchor-assigned transaction ID. Use with {@link AnchorClient.getWithdrawalStatus}. */
  transactionId: string;
  /**
   * Interactive URL the frontend must open (webview, popup, or redirect)
   * so the worker can complete KYC and withdrawal details on the anchor's
   * hosted page.
   */
  interactiveUrl: string;
  /** Immediate request state, typically `interactive_customer_info_needed`. */
  type: string;
  /**
   * ISO-8601 timestamp after which the interactive session expires, if the
   * anchor provides one (the test anchor currently omits it).
   */
  expiresAt?: string;
}

// ============================================================================
// AnchorClient
// ============================================================================

/**
 * Client for the anchor's SEP-10 / SEP-24 endpoints.
 *
 * Implements the interactive withdrawal initiation and status polling flows
 * used by the Truvo frontend after escrow funds have been released to the
 * worker.
 *
 * @example
 * ```ts
 * const anchor = new AnchorClient({
 *   authUrl: "https://testanchor.stellar.org/auth",
 *   sep24Url: "https://testanchor.stellar.org/sep24",
 * });
 *
 * await anchor.authenticate(workerKeypair);
 * const wd = await anchor.initiateWithdrawal("SRT", "5", workerPublicKey);
 * // open wd.interactiveUrl in a webview/popup, then poll:
 * const status = await anchor.getWithdrawalStatus(wd.transactionId);
 * ```
 */
export class AnchorClient {
  private readonly authUrl: string;
  private readonly sep24Url: string;
  private readonly sep12Url: string | undefined;
  private readonly networkPassphrase: string;
  private readonly maxRetries: number;

  /** The SEP-10 JWT. Set by {@link authenticate} or via config. */
  private authToken: string | undefined;
  /** Cached keypair used to sign the SEP-10 challenge. */
  private authKeypair: Keypair | undefined;

  constructor(config: AnchorClientConfig) {
    this.authUrl = config.authUrl;
    this.sep24Url = config.sep24Url;
    this.sep12Url = config.sep12Url;
    this.networkPassphrase = config.networkPassphrase ?? Networks.TESTNET;
    this.authToken = config.authToken;
    this.maxRetries = config.maxRetries ?? DEFAULT_ANCHOR_MAX_RETRIES;
  }

  /**
   * Complete the SEP-10 web authentication flow and cache the JWT.
   *
   * Fetches a challenge transaction from `GET {authUrl}`, signs it with
   * `keypair`, and submits the signed challenge to `POST {authUrl}`. The
   * returned JWT is cached and attached automatically to all subsequent
   * authenticated requests.
   *
   * Calling this again re-authenticates and replaces the cached token.
   *
   * @param keypair - Keypair of the account authenticating with the anchor
   *   (typically the worker's keypair).
   * @returns The SEP-10 JWT.
   */
  async authenticate(keypair: Keypair): Promise<string> {
    // 1. Request the challenge transaction.
    const challenge = await this.httpGetJson<Sep10ChallengeResponse>(
      `${this.authUrl}?account=${keypair.publicKey()}`,
      "GET /auth (challenge)",
    );

    // 2. Sign it with the user's key.
    const tx = TransactionBuilder.fromXDR(
      challenge.transaction,
      challenge.network_passphrase ?? this.networkPassphrase,
    );
    // The challenge must be signed only by the client key (the anchor's
    // server key signature is already present on the transaction).
    tx.sign(keypair);

    // 3. Submit the signed challenge.
    const tokenResponse = await this.httpPostJson<Sep10TokenResponse>(
      this.authUrl,
      { transaction: tx.toXDR() },
      "POST /auth (token)",
    );

    this.authToken = tokenResponse.token;
    this.authKeypair = keypair;
    return this.authToken;
  }

  /**
   * The cached SEP-10 JWT, or throw if none is available.
   *
   * @throws {TruvoAnchorAuthError} If no token has been obtained yet.
   */
  private getRequiredToken(): string {
    if (!this.authToken) {
      throw new TruvoAnchorAuthError(
        "Not authenticated with the anchor. Call authenticate() first or supply an authToken.",
      );
    }
    return this.authToken;
  }

  /**
   * Ensure a SEP-10 JWT is available, authenticating with `keypair` if not.
   *
   * @param keypair - Keypair to authenticate with when no token is cached.
   * @throws {TruvoAnchorAuthError} If no token is cached and no keypair is provided.
   */
  async ensureAuthenticated(keypair?: Keypair): Promise<void> {
    if (this.authToken && !this.isTokenExpired(this.authToken)) {
      return;
    }
    if (!keypair) {
      throw new TruvoAnchorAuthError(
        "Not authenticated with the anchor. Call authenticate() first or supply an authToken.",
      );
    }
    await this.authenticate(keypair);
  }

  /**
   * The cached SEP-10 JWT, if one has been obtained via {@link authenticate},
   * the config's `authToken`, or a previous {@link ensureAuthenticated} call.
   */
  get token(): string | undefined {
    return this.authToken;
  }

  /**
   * Initiate an interactive SEP-24 withdrawal.
   *
   * Calls `POST {sep24Url}/transactions/withdraw/interactive` and returns
   * the anchor-hosted interactive URL plus the transaction ID needed to
   * track the withdrawal's status.
   *
   * The frontend should open {@link InitiateWithdrawalResult.interactiveUrl}
   * in a webview/popup (or redirect the worker to it). While the worker
   * completes the anchor's hosted flow, poll
   * {@link AnchorClient.getWithdrawalStatus} with the returned
   * {@link InitiateWithdrawalResult.transactionId} for real-time progress.
   *
   * Requires an authenticated session (see {@link ensureAuthenticated}).
   *
   * @param assetCode - Asset to withdraw (e.g. `"SRT"`, `"USDC"`, `"native"`).
   * @param amount - Amount as a decimal string (e.g. `"5"`).
   * @param account - Public key (G…) of the worker's Stellar account.
   * @param options - Optional extras (`memo`, or a raw request-body override).
   * @returns The transaction ID, interactive URL, type, and expiry.
   * @throws {TruvoAnchorAuthError} If not authenticated.
   * @throws {TruvoAnchorApiError} If the anchor rejects the request.
   */
  async initiateWithdrawal(
    assetCode: string,
    amount: string,
    account: string,
    options?: { memo?: string },
  ): Promise<InitiateWithdrawalResult> {
    await this.ensureAuthenticated();

    const body: Record<string, string> = {
      asset_code: assetCode,
      amount,
      account,
    };
    if (options?.memo !== undefined) {
      body.memo = options.memo;
    }

    const response = await this.httpPostJson<WithdrawalInteractiveResponse>(
      `${this.sep24Url}/transactions/withdraw/interactive`,
      body,
      "POST /sep24/transactions/withdraw/interactive",
      { Authorization: `Bearer ${this.getRequiredToken()}` },
    );

    if (!response.id || !response.url) {
      throw new TruvoAnchorError(
        "Anchor returned a malformed interactive withdrawal response (missing id or url)",
      );
    }

    return {
      transactionId: response.id,
      interactiveUrl: response.url,
      type: response.type,
      expiresAt: response.expires_at,
    };
  }

  /**
   * Fetch the current status of a SEP-24 withdrawal transaction.
   *
   * Calls `GET {sep24Url}/transaction?id={txId}` and returns the anchor's
   * transaction record with a typed {@link WithdrawalStatus}, so the
   * frontend can show the worker real-time progress after they've opened
   * (and ideally completed) the anchor's hosted interactive flow.
   *
   * Typical progression for withdrawals:
   * `incomplete` → `pending_user_transfer_start` → `pending_anchor` →
   * `completed` (or `error` / `expired` / `refunded` on failure).
   *
   * Poll this method on an interval (e.g. every 5–10 s) while the status is
   * non-terminal (see {@link isTerminalWithdrawalStatus}).
   *
   * Requires an authenticated session (see {@link ensureAuthenticated}).
   *
   * @param txId - The transaction ID from {@link initiateWithdrawal}
   *   ({@link InitiateWithdrawalResult.transactionId}).
   * @returns The full withdrawal transaction record, including the typed status.
   * @throws {TruvoAnchorAuthError} If not authenticated.
   * @throws {TruvoAnchorApiError} If the anchor rejects the request (e.g. 404 for an unknown `txId`).
   * @throws {TruvoAnchorError} If the anchor returns a malformed record or an unrecognized status.
   */
  async getWithdrawalStatus(txId: string): Promise<WithdrawalTransaction> {
    await this.ensureAuthenticated();

    const response = await this.httpGetJson<Sep24TransactionResponse>(
      `${this.sep24Url}/transaction?id=${encodeURIComponent(txId)}`,
      "GET /sep24/transaction",
      { Authorization: `Bearer ${this.getRequiredToken()}` },
    );

    const tx = response?.transaction;
    if (!tx || typeof tx.id !== "string" || typeof tx.status !== "string") {
      throw new TruvoAnchorError(
        "Anchor returned a malformed transaction response (missing transaction, id, or status)",
      );
    }

    if (!SEP24_TRANSACTION_STATUSES.has(tx.status)) {
      throw new TruvoAnchorError(
        `Anchor returned an unrecognized SEP-24 transaction status: "${tx.status}" for transaction ${tx.id}`,
      );
    }

    return { ...tx, status: tx.status as WithdrawalStatus };
  }

  /**
   * Fetch the worker's SEP-12 KYC status from the anchor.
   *
   * Calls `GET {sep12Url}/customer?account={account}` and returns the raw
   * customer record together with a normalized {@link WithdrawalKycState}
   * so the frontend can distinguish "needs to complete KYC" from "KYC is
   * under review" from "KYC failed" — rather than showing a generic error.
   *
   * The anchor's own hosted interactive flow collects the actual KYC data;
   * this method only surfaces state (see {@link getWithdrawalKycStatus} for
   * the combined withdrawal + KYC view).
   *
   * Requires `sep12Url` in the client config and an authenticated session.
   *
   * @param account - Public key (G…) of the worker's Stellar account.
   * @returns The customer record with typed `state` and raw anchor status.
   * @throws {TruvoAnchorError} If the client was constructed without `sep12Url`.
   * @throws {TruvoAnchorApiError} If the anchor rejects the request.
   */
  async getCustomerKycStatus(account: string): Promise<WithdrawalKycStatus> {
    await this.ensureAuthenticated();
    const customer = await this.fetchCustomer(account);
    return this.toKycStatus(customer);
  }

  /**
   * Combined SEP-24 withdrawal + SEP-12 KYC state for the withdrawal flow.
   *
   * Detects when the anchor requires KYC before the withdrawal can proceed
   * and surfaces a typed {@link WithdrawalKycState} so the frontend can show
   * the worker an appropriate waiting or redirect state (pointing at the
   * anchor's hosted flow) instead of a generic error:
   *
   * - `kyc_required` → send the worker to {@link WithdrawalKycStatus.moreInfoUrl}
   *   (the anchor collects KYC data in its hosted flow; no custom form needed).
   * - `kyc_pending` → show a "KYC under review" waiting state.
   * - `kyc_approved` → the withdrawal can proceed.
   * - `kyc_rejected` → show a KYC-failed explainer state.
   *
   * Requires `sep12Url` in the client config and an authenticated session.
   *
   * @param txId - The transaction ID from {@link initiateWithdrawal}.
   * @param account - Public key (G…) of the worker's Stellar account.
   * @returns Withdrawal status plus the normalized KYC state.
   * @throws {TruvoAnchorError} If the client was constructed without `sep12Url`.
   * @throws {TruvoAnchorApiError} If the anchor rejects either request.
   */
  async getWithdrawalKycStatus(
    txId: string,
    account: string,
  ): Promise<WithdrawalKycStatus> {
    await this.ensureAuthenticated();

    const [withdrawal, customer] = await Promise.all([
      this.getWithdrawalStatus(txId),
      this.fetchCustomer(account),
    ]);

    const kyc = this.toKycStatus(customer);

    // The withdrawal is blocked when the interactive flow is still
    // incomplete and the customer is not (yet) approved by the anchor.
    const blocked =
      withdrawal.status === "incomplete" && kyc.state !== "kyc_approved";

    return {
      ...kyc,
      blockingWithdrawal: blocked,
      moreInfoUrl: withdrawal.more_info_url,
      withdrawalStatus: withdrawal.status,
    };
  }

  // ------------------------------------------------------------------
  // SEP-12 private helpers
  // ------------------------------------------------------------------

  /**
   * Call `GET {sep12Url}/customer?account={account}` and validate the shape.
   */
  private async fetchCustomer(account: string): Promise<Sep12CustomerResponse> {
    if (!this.sep12Url) {
      throw new TruvoAnchorError(
        "sep12Url is not configured. Pass it in the AnchorClientConfig to use KYC helpers.",
      );
    }

    const customer = await this.httpGetJson<Sep12CustomerResponse>(
      `${this.sep12Url}/customer?account=${encodeURIComponent(account)}`,
      "GET /sep12/customer",
      { Authorization: `Bearer ${this.getRequiredToken()}` },
    );

    if (!customer || typeof customer.status !== "string") {
      throw new TruvoAnchorError(
        "Anchor returned a malformed SEP-12 customer response (missing status)",
      );
    }
    return customer;
  }

  /** Normalize a validated SEP-12 customer response. */
  private toKycStatus(customer: Sep12CustomerResponse): WithdrawalKycStatus {
    const rawStatus = customer.status as KycStatus | string;
    const state = kycStatusToState(rawStatus);
    return {
      state,
      rawStatus,
      customerId: customer.id,
      missingFields: customer.fields,
      approved: state === "kyc_approved",
      blockingWithdrawal: state !== "kyc_approved",
    };
  }

  // ------------------------------------------------------------------
  // HTTP helpers
  // ------------------------------------------------------------------

  /**
   * Decode a URL-safe base64 JWT payload without verifying the signature
   * (verification is the anchor's job; we only need the `exp` claim to
   * detect an expired cached token).
   */
  private isTokenExpired(token: string): boolean {
    const exp = this.decodeJwtExp(token);
    if (exp === undefined) return false; // can't tell — assume valid
    return Date.now() / 1000 >= exp;
  }

  private decodeJwtExp(token: string): number | undefined {
    try {
      const payload = token.split(".")[1];
      if (!payload) return undefined;
      const json = Buffer.from(
        payload.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8");
      const parsed: unknown = JSON.parse(json);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "exp" in parsed &&
        typeof (parsed as { exp?: unknown }).exp === "number"
      ) {
        return (parsed as { exp: number }).exp;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Perform a GET request and parse the JSON response.
   *
   * Transient failures (network errors, HTTP 5xx) are retried with
   * exponential backoff; non-retryable failures throw immediately.
   */
  private async httpGetJson<T>(
    url: string,
    context: string,
    headers?: Record<string, string>,
  ): Promise<T> {
    return retryWithBackoff(
      () => this.httpJson<T>("GET", url, undefined, headers),
      context,
      this.maxRetries,
    );
  }

  /**
   * Perform a POST request with a JSON body and parse the JSON response.
   *
   * Transient failures (network errors, HTTP 5xx) are retried with
   * exponential backoff; non-retryable failures throw immediately.
   */
  private async httpPostJson<T>(
    url: string,
    body: unknown,
    context: string,
    headers?: Record<string, string>,
  ): Promise<T> {
    return retryWithBackoff(
      () => this.httpJson<T>("POST", url, body, headers),
      context,
      this.maxRetries,
    );
  }

  /**
   * Core HTTP helper: perform a request, check status, parse JSON.
   *
   * Non-2xx responses throw {@link TruvoAnchorApiError} with the status
   * code and parsed error body. This function is always invoked inside
   * `retryWithBackoff` so transient failures are retried automatically.
   */
  private async httpJson<T>(
    method: "GET" | "POST",
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      let parsed: unknown;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        parsed = text;
      }
      throw new TruvoAnchorApiError(
        `Anchor request failed (HTTP ${response.status}): ${method} ${url}`,
        response.status,
        parsed,
      );
    }

    if (text.length === 0) {
      throw new TruvoAnchorError(`${method} ${url} returned an empty response body`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new TruvoAnchorError(
        `${method} ${url} returned invalid JSON: ${text.slice(0, 100)}`,
      );
    }
  }
}

/** Default maximum number of retries for anchor HTTP requests. */
export const DEFAULT_ANCHOR_MAX_RETRIES = 3;

/**
 * All withdrawal statuses defined by SEP-24 (see {@link WithdrawalStatus}).
 * Used to validate the anchor's response before surfacing it as a typed status.
 */
const SEP24_TRANSACTION_STATUSES: ReadonlySet<string> = new Set([
  "incomplete",
  "pending_user_transfer_start",
  "pending_user_transfer_complete",
  "pending_anchor",
  "pending_stellar",
  "pending_trust",
  "pending_account",
  "completed",
  "refunded",
  "expired",
  "error",
]);

/**
 * Whether a withdrawal status is terminal (no further polling needed).
 *
 * Terminal statuses: `completed`, `refunded`, `expired`, `error`.
 */
export function isTerminalWithdrawalStatus(status: WithdrawalStatus): boolean {
  return (
    status === "completed" ||
    status === "refunded" ||
    status === "expired" ||
    status === "error"
  );
}

/**
 * Map a raw SEP-12 customer status string to the normalized
 * {@link WithdrawalKycState} used by the withdrawal flow.
 *
 * Unknown statuses map to `"unknown"` rather than throwing, so new anchor
 * statuses degrade gracefully instead of breaking the UI.
 */
export function kycStatusToState(rawStatus: string): WithdrawalKycState {
  switch (rawStatus) {
    case "ACCEPTED":
      return "kyc_approved";
    case "PROCESSING":
      return "kyc_pending";
    case "NEEDS_INFO":
      return "kyc_required";
    case "REJECTED":
      return "kyc_rejected";
    default:
      return "unknown";
  }
}
