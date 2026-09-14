/**
 * Local mirror of the Truvo SDK's task types (sdk/src/types.ts).
 *
 * The frontend doesn't depend on the SDK package yet; when the SDK wiring
 * branch lands, these types will be re-exported from @truvo/sdk directly
 * and this file can become a re-export shim. Numeric values match the
 * on-chain contract's u32 status codes exactly.
 */

/** Task statuses matching the contract's u32 codes (SDK TaskStatus). */
export enum TaskStatus {
  Created = 0,
  Confirmed = 1,
  Released = 2,
  Refunded = 3,
  Disputed = 4,
}

/** Task shape matching the SDK's Task type. */
export interface EscrowTask {
  task_id: string;
  payer: string;
  worker: string;
  /** Escrowed amount (decimal string on-chain; XLM here for display). */
  amount: string;
  /** Ledger timestamp after which the task can be refunded. */
  deadline: number;
  status: TaskStatus;
  /** 32-byte hex proof hash (empty until the worker confirms). */
  proof_hash: string;
}
