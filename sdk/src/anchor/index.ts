/**
 * Truvo SDK Anchor Integration
 *
 * SEP-24 (Interactive Withdrawal) and SEP-12 (KYC) support against a
 * Stellar anchor, per `/docs/anchor-integration.md`.
 *
 * @packageDocumentation
 */

export {
  AnchorClient,
  type AnchorClientConfig,
  type InitiateWithdrawalInput,
  type InitiateWithdrawalResult,
  DEFAULT_ANCHOR_MAX_RETRIES,
  isTerminalWithdrawalStatus,
} from "./client";

export {
  TruvoAnchorError,
  TruvoAnchorAuthError,
  TruvoAnchorApiError,
} from "./errors";

export type {
  Sep10ChallengeResponse,
  Sep10TokenResponse,
  WithdrawalStatus,
  WithdrawalInteractiveResponse,
  WithdrawalTransaction,
  Sep24TransactionResponse,
  KycStatus,
  KycField,
  Sep12CustomerResponse,
} from "./types";
