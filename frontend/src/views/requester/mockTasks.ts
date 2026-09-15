/**
 * Mock task data for the Requester's escrow status display.
 *
 * These objects mirror the shape of the SDK's `Task` type
 * (sdk/src/types.ts) so that swapping mock data for a real SDK call in a
 * later branch is a data-source change only — no UI changes needed.
 *
 * When wired to the SDK, this file goes away and the list comes from
 * on-chain storage keyed by the connected requester's address.
 */

import { EscrowTask, TaskStatus } from "../../types/task";

/** Deterministic mock rows — realistic values, not random, for stable UI. */
export const MOCK_TASKS: EscrowTask[] = [
  {
    task_id: "3f8a1c2e9b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7",
    payer: "GAREQUESTERMOCKADDRESSPAYER11111111111111111111111111111111111",
    worker: "GBWORKERMOCKADDRESS1111111111111111111111111111111111111111",
    amount: "10",
    deadline: Math.floor(Date.now() / 1000) + 86_400 * 3, // 3 days out
    status: TaskStatus.Created,
    proof_hash: "",
  },
  {
    task_id: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    payer: "GAREQUESTERMOCKADDRESSPAYER11111111111111111111111111111111111",
    worker: "GCWORKERMOCKADDRESS2222222222222222222222222222222222222222",
    amount: "25.5",
    deadline: Math.floor(Date.now() / 1000) + 86_400 * 7, // 1 week out
    status: TaskStatus.Confirmed,
    proof_hash: "9c8b7a6f5e4d3c2b1a098f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c4b3a29",
  },
  {
    task_id: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0",
    payer: "GAREQUESTERMOCKADDRESSPAYER11111111111111111111111111111111111",
    worker: "GDWORKERMOCKADDRESS3333333333333333333333333333333333333333",
    amount: "4.2",
    deadline: Math.floor(Date.now() / 1000) - 86_400, // yesterday
    status: TaskStatus.Released,
    proof_hash: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
  },
  {
    task_id: "5a4b3c2d1e0f918273645564738291a0b1c2d3e4f5061728394a5b6c7d8e9f01",
    payer: "GAREQUESTERMOCKADDRESSPAYER11111111111111111111111111111111111",
    worker: "GEWORKERMOCKADDRESS4444444444444444444444444444444444444444",
    amount: "7",
    deadline: Math.floor(Date.now() / 1000) - 86_400 * 2, // 2 days ago
    status: TaskStatus.Refunded,
    proof_hash: "",
  },
  {
    task_id: "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
    payer: "GAREQUESTERMOCKADDRESSPAYER11111111111111111111111111111111111",
    worker: "GFWORKERMOCKADDRESS5555555555555555555555555555555555555555",
    amount: "15.75",
    deadline: Math.floor(Date.now() / 1000) + 3_600, // 1 hour out
    status: TaskStatus.Disputed,
    proof_hash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  },
];
