/**
 * Truvo SDK type definitions
 *
 * These types mirror the Soroban escrow contract's on-chain data model.
 * Status numeric values match the constants defined in the Rust contract.
 */

/**
 * Possible statuses of an escrow task, matching the contract's u32 status codes.
 */
export enum TaskStatus {
  Created = 0,
  Confirmed = 1,
  Released = 2,
  Refunded = 3,
  Disputed = 4,
}

/**
 * Outcome of a dispute resolution by the arbitrator.
 * - `Worker`: funds are released to the worker
 * - `Payer`: funds are refunded to the payer
 */
export type DisputeOutcome = "Worker" | "Payer";

/**
 * On-chain task data, mirroring `TaskData` in the Soroban contract.
 *
 * - `payer`: the address that created and funded the task
 * - `worker`: the address assigned to complete the task
 * - `amount`: the escrowed amount (i128 on-chain, string in JS for precision)
 * - `task_id`: 32-byte unique identifier for the task
 * - `deadline`: ledger timestamp after which the task can be refunded
 * - `status`: current task status (see {@link TaskStatus})
 * - `proof_hash`: 32-byte hash of the worker's completion proof
 */
export interface Task {
  payer: string;
  worker: string;
  amount: string;
  task_id: string;
  deadline: number;
  status: TaskStatus;
  proof_hash: string;
}
