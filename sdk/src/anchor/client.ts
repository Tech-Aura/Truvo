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
  Sep10ChallengeResponse,
  Sep10TokenResponse,
  WithdrawalInteractiveResponse,
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
  private readonly networkPassphrase: string;
  private readonly maxRetries: number;

  /** The SEP-10 JWT. Set by {@link authenticate} or via config. */
  private authToken: string | undefined;
  /** Cached keypair used to sign the SEP-10 challenge. */
  private authKeypair: Keypair | undefined;

  constructor(config: AnchorClientConfig) {
    this.authUrl = config.authUrl;
    this.sep24Url = config.sep24Url;
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
