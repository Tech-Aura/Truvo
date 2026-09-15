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
  i128ToScVal,
  u64ToScVal,
  hex32ToScVal,
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
  DEFAULT_HORIZON_URL,
  DEFAULT_QUOTE_URL,
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
  AssetBalance,
  AvailableBalance,
  OraclePrice,
  Sep38PricesResponse,
  LocalValueEstimate,
} from "./anchor";
export {
  TruvoAnchorError,
  TruvoAnchorAuthError,
  TruvoAnchorApiError,
} from "./anchor";

export {
  X402Client,
  createX402Client,
  is402Response,
  parsePaymentRequired,
  type X402ClientConfig,
  type PaymentRequired,
  type PaymentPayload,
  type SettlementResponse,
} from "./x402";

export const SDK_VERSION = "0.3.0";
