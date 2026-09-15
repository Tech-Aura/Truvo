/**
 * Mock dispute data for the Admin/Arbitrator view.
 *
 * Mirrors the shape of the SDK's Task type (sdk/src/types.ts) but filtered
 * to only include tasks with status === Disputed. Used as placeholder data
 * until the SDK wiring branch replaces it with real on-chain queries.
 */

import { EscrowTask, TaskStatus } from "../../types/task";

/**
 * Returns deterministic mock disputed tasks across all users (not scoped
 * to a single wallet). These represent tasks that have been escalated to
 * the arbitrator for resolution.
 */
export function getMockDisputedTasks(): EscrowTask[] {
  return [
    {
      task_id: "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
      payer: "GAPAYERMOCKADDRESS11111111111111111111111111111111111111111",
      worker: "GBWORKERMOCKADDRESS1111111111111111111111111111111111111111",
      amount: "30",
      deadline: Math.floor(Date.now() / 1000) + 3_600 * 12,
      status: TaskStatus.Disputed,
      proof_hash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    },
    {
      task_id: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      payer: "GAPAYERMOCKADDRESS22222222222222222222222222222222222222222",
      worker: "GBWORKERMOCKADDRESS33333333333333333333333333333333333333333",
      amount: "15.5",
      deadline: Math.floor(Date.now() / 1000) + 86_400 * 3,
      status: TaskStatus.Disputed,
      proof_hash: "",
    },
    {
      task_id: "1111111111111111111111111111111111111111111111111111111111111111",
      payer: "GAPAYERMOCKADDRESS44444444444444444444444444444444444444444",
      worker: "GBWORKERMOCKADDRESS55555555555555555555555555555555555555555",
      amount: "50",
      deadline: Math.floor(Date.now() / 1000) - 86_400,
      status: TaskStatus.Disputed,
      proof_hash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    },
  ];
}
