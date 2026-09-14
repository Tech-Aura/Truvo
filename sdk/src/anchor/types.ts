/**
 * Truvo SDK Anchor Types
 *
 * Type definitions for the SEP-24 (Interactive Withdrawal) and SEP-12 (KYC)
 * integration with the Truvo reference anchor (`testanchor.stellar.org`).
 *
 * The request/response shapes mirror the anchor's live behavior as
 * documented in `/docs/anchor-integration.md`.
 */

// ============================================================================
// SEP-10: Web Authentication
// ============================================================================

/** Challenge transaction response from `GET /auth`. */
export interface Sep10ChallengeResponse {
  /** Base64-encoded XDR challenge transaction to sign with the user's key. */
  transaction: string;
  /** Network passphrase the transaction was built for. */
  network_passphrase: string;
}

/** JWT response from `POST /auth` after submitting the signed challenge. */
export interface Sep10TokenResponse {
  /** Bearer JWT to include in all authenticated SEP-24/SEP-12 requests. */
  token: string;
}

// ============================================================================
// SEP-24: Interactive Withdrawal
// ============================================================================

/**
 * Withdrawal transaction status values, per the SEP-24 specification.
 *
 * The anchor moves a withdrawal through these states; the frontend can map
 * them to user-facing progress indicators.
 */
export type WithdrawalStatus =
  /** User has not yet completed the interactive flow. */
  | "incomplete"
  /** User must send the Stellar payment to the anchor. */
  | "pending_user_transfer_start"
  /** Anchor has received the user's payment; processing. */
  | "pending_user_transfer_complete"
  /** Anchor is processing the off-chain fiat transfer. */
  | "pending_anchor"
  /** Stellar transaction is being processed. */
  | "pending_stellar"
  /** Waiting for the user to establish a trustline. */
  | "pending_trust"
  /** Waiting for account creation. */
  | "pending_account"
  /** Withdrawal finished successfully. */
  | "completed"
  /** Withdrawal was refunded. */
  | "refunded"
  /** Withdrawal expired. */
  | "expired"
  /** Withdrawal failed. */
  | "error";

/** Response body of `POST /sep24/transactions/withdraw/interactive`. */
export interface WithdrawalInteractiveResponse {
  /** Anchor-assigned transaction ID. Use to poll {@link WithdrawalTransaction.status}. */
  id: string;
  /**
   * Immediate state of the request. Typically
   * `interactive_customer_info_needed` — the user must complete the hosted
   * flow at `url`.
   */
  type: string;
  /** Interactive URL to open in a webview/popup or redirect. */
  url: string;
  /**
   * ISO-8601 timestamp after which the interactive session expires.
   * Optional: some anchors (including the test anchor) omit this field.
   */
  expires_at?: string;
}

/**
 * A single SEP-24 transaction as returned by `GET /sep24/transaction`.
 *
 * Field set is the union of the withdrawal fields documented in
 * `/docs/anchor-integration.md`; optional fields are only present when the
 * anchor includes them for the current status.
 */
export interface WithdrawalTransaction {
  /** Anchor-assigned transaction ID (from {@link WithdrawalInteractiveResponse.id}). */
  id: string;
  /** Always `"withdrawal"` for this flow. */
  kind: string;
  /** Current status (see {@link WithdrawalStatus}). */
  status: WithdrawalStatus;
  /** Anchor-hosted page with more details about this transaction. */
  more_info_url?: string;
  /** ISO-8601 timestamp when the transaction was started. */
  started_at?: string;
  /** ISO-8601 timestamp when the transaction was completed. */
  completed_at?: string;
  /** Amount the user sent, as a decimal string. */
  amount_in?: string;
  /** Amount the user received after fees, as a decimal string. */
  amount_out?: string;
  /** Fee charged by the anchor, as a decimal string. */
  amount_fee?: string;
  /** Asset code of the withdrawal (e.g. `"SRT"`, `"USDC"`, `"native"`). */
  asset_code?: string;
  /** Stellar account the user must send the payment to (withdrawals). */
  withdraw_anchor_account?: string;
  /** Memo the user must attach to the payment (withdrawals). */
  withdraw_memo?: string;
  /** Memo type for {@link WithdrawalTransaction.withdraw_memo}. */
  withdraw_memo_type?: string;
  /** Sender's Stellar account (included by the test anchor). */
  from?: string;
  /** Receiving account configured by the anchor, when present. */
  to?: string;
  /** Whether the transaction was refunded (included by the test anchor). */
  refunded?: boolean;
}

/** Response body of `GET /sep24/transaction`. */
export interface Sep24TransactionResponse {
  transaction: WithdrawalTransaction;
}

// ============================================================================
// SEP-12: KYC / Customer
// ============================================================================

/**
 * Customer KYC status values returned by the anchor's SEP-12 API
 * (`GET /sep12/customer`).
 */
export type KycStatus =
  /** All required KYC fields accepted; customer validated. */
  | "ACCEPTED"
  /** More info required; see `fields` in the response. */
  | "NEEDS_INFO"
  /** KYC under review. */
  | "PROCESSING"
  /** KYC failed permanently. */
  | "REJECTED";

/** Definition of a single SEP-9 KYC field the anchor requires. */
export interface KycField {
  /** Human-readable description of the field. */
  description?: string;
  /** Input type hint (e.g. `"string"`, `"number"`). */
  type?: string;
  /** Per-field acceptance status (only in `provided_fields`). */
  status?: KycStatus | string;
  /** Allowed values for choice-type fields. */
  choices?: string[];
  /** Whether the field may be omitted. */
  optional?: boolean;
}

/** Response body of `GET /sep12/customer`. */
export interface Sep12CustomerResponse {
  /** Customer ID assigned by the anchor (present when known). */
  id?: string;
  /** Current KYC status (see {@link KycStatus}). */
  status: KycStatus;
  /** Required-but-missing fields (present when status is `NEEDS_INFO`). */
  fields?: Record<string, KycField>;
  /** Already-provided fields and their acceptance status. */
  provided_fields?: Record<string, KycField>;
}

// ============================================================================
// On-chain balance (worker wallet)
// ============================================================================

/**
 * A single asset balance held by a Stellar account, as reported by the
 * network (Horizon).
 */
export interface AssetBalance {
  /**
   * Asset code: `"XLM"` for the native asset, otherwise the issued asset
   * code (e.g. `"SRT"`, `"USDC"`).
   */
  assetCode: string;
  /** Issuer public key (G…) for issued assets; absent for native XLM. */
  assetIssuer?: string;
  /** Balance as a decimal string (e.g. `"10000.0000000"`). */
  balance: string;
  /** Raw Horizon asset type (`native`, `credit_alphanum4`, `credit_alphanum12`). */
  assetType: string;
  /** Selling liabilities as a decimal string (committed to offers). */
  sellingLiabilities: string;
  /** Buying liabilities as a decimal string. */
  buyingLiabilities: string;
  /** Whether the issuer has authorized the trustline (issued assets only). */
  authorized?: boolean;
}

/** Result of {@link AnchorClient.getAvailableBalance}. */
export interface AvailableBalance {
  /** The queried account's public key. */
  account: string;
  /**
   * Spendable balance of the requested asset as a decimal string — the
   * raw balance minus selling liabilities. `"0"` when the account holds
   * no balance of the asset ({@link AvailableBalance.found} is `false`).
   */
  available: string;
  /** Whether the account holds any balance of the requested asset. */
  found: boolean;
  /** The requested asset code. */
  assetCode: string;
  /** The requested asset issuer, when specified. */
  assetIssuer?: string;
  /** All balances held by the account (useful for wallet UIs). */
  balances: AssetBalance[];
}

// ============================================================================
// Price oracle (SEP-38) — currency conversion estimates
// ============================================================================

/** A candidate price for one (buy) asset, from the SEP-38 `GET /prices` response. */
export interface OraclePrice {
  /** The buy asset in SEP-38 Asset Identification Format (e.g. `"iso4217:USD"`). */
  asset: string;
  /**
   * Amount of the buy asset per **one** unit of the sell asset, as a
   * decimal string (e.g. `"0.39"` means 1 XLM ≈ 0.39 USD on the test oracle).
   */
  price: string;
  /** Decimal precision the oracle recommends for the price. */
  decimals: number;
}

/** Response of the SEP-38 `GET /prices` endpoint. */
export interface Sep38PricesResponse {
  buy_assets: OraclePrice[];
}

/** Result of {@link AnchorClient.estimateLocalValue}. */
export interface LocalValueEstimate {
  /** Estimated value in the target currency, as a decimal string. **Estimate only.** */
  estimate: string;
  /** Requested amount (echoed from the input). */
  amount: string;
  /** Asset code that was estimated (echoed; `"native"` is surfaced as `"XLM"`). */
  assetCode: string;
  /** Target fiat currency code (echoed, e.g. `"USD"`). */
  targetCurrency: string;
  /**
   * Oracle price used: buy-asset units per one unit of `assetCode`.
   * **Estimate only — not a guaranteed rate.**
   */
  price: string;
  /** Buy asset string the oracle returned (e.g. `"iso4217:USD"`). */
  buyAsset: string;
  /** Sell asset string sent to the oracle (e.g. `"stellar:native"`). */
  sellAsset: string;
  /** Decimal precision of the oracle's price. */
  decimals: number;
  /**
   * Short human-readable summary of the estimate (e.g. `"~3.90 USD"`),
   * rounded to two decimal places.
   */
  display: string;
}

// ============================================================================
// KYC-aware withdrawal state
// ============================================================================

/**
 * Normalized KYC state for the withdrawal flow, so the frontend can render
 * a waiting/redirect state instead of a generic error.
 *
 * - `kyc_required`: the anchor needs more customer info — send the worker
 *   to the anchor's hosted interactive flow (it collects KYC data there).
 * - `kyc_pending`: KYC is under review — show a waiting state.
 * - `kyc_approved`: the customer is validated — the flow can proceed.
 * - `kyc_rejected`: KYC failed permanently — show an error/explainer state.
 * - `unknown`: the anchor returned an unrecognized status.
 */
export type WithdrawalKycState =
  | "kyc_required"
  | "kyc_pending"
  | "kyc_approved"
  | "kyc_rejected"
  | "unknown";

/**
 * Combined SEP-24 withdrawal + SEP-12 customer KYC state, as returned by
 * {@link AnchorClient.getWithdrawalKycStatus} and
 * {@link AnchorClient.getCustomerKycStatus}.
 */
export interface WithdrawalKycStatus {
  /** Normalized KYC state (see {@link WithdrawalKycState}). */
  state: WithdrawalKycState;
  /** Raw SEP-12 status string from the anchor (e.g. `"NEEDS_INFO"`). */
  rawStatus: string;
  /** Customer ID assigned by the anchor, when known. */
  customerId?: string;
  /** Required-but-missing KYC fields (present when state is `kyc_required`). */
  missingFields?: Record<string, KycField>;
  /** Convenience flag: `true` only when `state === "kyc_approved"`. */
  approved: boolean;
  /**
   * `true` when the withdrawal is currently blocked waiting on KYC
   * (the SEP-24 transaction is still `incomplete` and the customer is
   * not approved). The frontend should show a waiting/redirect state.
   */
  blockingWithdrawal: boolean;
  /**
   * Anchor-hosted page for the withdrawal (from the SEP-24 transaction's
   * `more_info_url`). Use as the redirect target when KYC is required.
   */
  moreInfoUrl?: string;
  /** SEP-24 status of the withdrawal at the time of the check. */
  withdrawalStatus?: WithdrawalStatus;
}
