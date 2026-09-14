/**
 * Truvo SDK
 *
 * TypeScript client for interacting with the Truvo escrow smart contract
 * deployed on Stellar Testnet.
 *
 * @packageDocumentation
 */

export { TaskStatus, type Task, type DisputeOutcome } from "./types";
export {
  TruvoClient,
  type TruvoClientConfig,
  type CreateEscrowInput,
  type ConfirmTaskInput,
  type ReleaseFundsInput,
  type RefundExpiredInput,
  type RaiseDisputeInput,
  type ResolveDisputeInput,
  type TruvoResult,
  type ReleaseFundsResult,
  type RefundExpiredResult,
} from "./client";
export {
  TruvoError,
  TruvoNetworkError,
  TruvoContractError,
} from "./errors";

export {
  AnchorClient,
  type AnchorClientConfig,
  type InitiateWithdrawalInput,
  type InitiateWithdrawalResult,
  DEFAULT_ANCHOR_MAX_RETRIES,
  isTerminalWithdrawalStatus,
  kycStatusToState,
} from "./anchor";
export type {
  WithdrawalStatus,
  WithdrawalInteractiveResponse,
  WithdrawalTransaction,
  Sep24TransactionResponse,
  WithdrawalKycState,
  WithdrawalKycStatus,
} from "./anchor";
export {
  TruvoAnchorError,
  TruvoAnchorAuthError,
  TruvoAnchorApiError,
} from "./anchor";

export const SDK_VERSION = "0.2.0";
