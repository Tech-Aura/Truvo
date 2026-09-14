/**
 * Mock task data for the Worker view.
 *
 * Mirrors the shape of the SDK's Task type (sdk/src/types.ts) so that
 * swapping mock data for real SDK queries in a later branch requires
 * no UI component modifications.
 */

import { EscrowTask, TaskStatus } from "../../types/task";

export const DEFAULT_MOCK_WORKER =
  "GBWORKERMOCKADDRESS1111111111111111111111111111111111111111";

/**
 * Returns deterministic mock tasks assigned to the given worker address.
 * If no worker address is provided, falls back to a default mock address.
 */
export function getMockWorkerTasks(workerAddress?: string | null): EscrowTask[] {
  const worker = workerAddress || DEFAULT_MOCK_WORKER;

  return [
    {
      task_id: "3f8a1c2e9b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7",
      payer: "GAPAYERMOCKADDRESS11111111111111111111111111111111111111111",
      worker,
      amount: "25",
      deadline: Math.floor(Date.now() / 1000) + 86_400 * 2, // 2 days out
      status: TaskStatus.Created,
      proof_hash: "",
    },
    {
      task_id: "8c7b6a5d4e3f201918273645a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9",
      payer: "GAPAYERMOCKADDRESS22222222222222222222222222222222222222222",
      worker,
      amount: "15",
      deadline: Math.floor(Date.now() / 1000) + 86_400 * 5, // 5 days out
      status: TaskStatus.Created,
      proof_hash: "",
    },
    {
      task_id: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      payer: "GAPAYERMOCKADDRESS11111111111111111111111111111111111111111",
      worker,
      amount: "40",
      deadline: Math.floor(Date.now() / 1000) + 86_400 * 4, // 4 days out
      status: TaskStatus.Confirmed,
      proof_hash: "9c8b7a6f5e4d3c2b1a098f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c4b3a29",
    },
    {
      task_id: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0",
      payer: "GAPAYERMOCKADDRESS33333333333333333333333333333333333333333",
      worker,
      amount: "50",
      deadline: Math.floor(Date.now() / 1000) - 86_400, // 1 day ago
      status: TaskStatus.Released,
      proof_hash: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
    },
    {
      task_id: "5a4b3c2d1e0f918273645564738291a0b1c2d3e4f5061728394a5b6c7d8e9f01",
      payer: "GAPAYERMOCKADDRESS22222222222222222222222222222222222222222",
      worker,
      amount: "10",
      deadline: Math.floor(Date.now() / 1000) - 86_400 * 3, // 3 days ago
      status: TaskStatus.Refunded,
      proof_hash: "",
    },
    {
      task_id: "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
      payer: "GAPAYERMOCKADDRESS11111111111111111111111111111111111111111",
      worker,
      amount: "30",
      deadline: Math.floor(Date.now() / 1000) + 3_600 * 12, // 12 hours out
      status: TaskStatus.Disputed,
      proof_hash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    },
  ];
}
