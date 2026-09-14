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
