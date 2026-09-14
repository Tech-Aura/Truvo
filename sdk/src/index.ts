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
  type TruvoResult,
} from "./client";

export const SDK_VERSION = "0.1.0";
