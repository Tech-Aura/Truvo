/**
 * Requester view.
 *
 * Hosts the create-task form and the escrow status list. Now wired to
 * the Truvo SDK — creating a task calls createEscrow on-chain, and the
 * status list fetches real tasks from contract storage.
 */

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../wallet/WalletContext";
import { useTruvoSDK } from "../sdk/TruvoContext";
import { EscrowTask } from "../types/task";
import { CreateTaskForm, CreateTaskFields } from "./requester/CreateTaskForm";
import { EscrowStatusList } from "./requester/EscrowStatusList";

/** localStorage key for tracking created task IDs. */
const TASK_IDS_KEY = "truvo_requester_task_ids";

function loadTaskIds(): string[] {
  try {
    const raw = localStorage.getItem(TASK_IDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTaskIds(ids: string[]) {
  localStorage.setItem(TASK_IDS_KEY, JSON.stringify(ids));
}

export default function Requester() {
  const { isConnected, publicKey } = useWallet();
  const sdk = useTruvoSDK();
  const [tasks, setTasks] = useState<EscrowTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fetch all tracked tasks from on-chain storage. */
  const refreshTasks = useCallback(async () => {
    const taskIds = loadTaskIds();
    if (taskIds.length === 0) {
      setTasks([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const fetched: EscrowTask[] = [];
      for (const id of taskIds) {
        try {
          const task = await sdk.getTask(id);
          fetched.push(task as EscrowTask);
        } catch {
          // Task may have been removed or is not found — skip it
        }
      }
      setTasks(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tasks");
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  // Fetch tasks on mount and when connected
  useEffect(() => {
    if (isConnected) {
      refreshTasks();
    }
  }, [isConnected, refreshTasks]);

  /** Handle create task form submission — calls createEscrow on-chain. */
  const handleCreateTask = useCallback(
    async (fields: CreateTaskFields) => {
      if (!publicKey) return;

      setError(null);
      setIsLoading(true);

      // Generate a 32-byte random task ID (64-char hex)
      const taskId = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const deadlineUnixSeconds = Math.floor(
        new Date(fields.deadline).getTime() / 1000,
      );

      try {
        const result = await sdk.createEscrow({
          payer: publicKey,
          worker: fields.worker.trim(),
          amount: fields.amount.trim(),
          taskId,
          deadline: deadlineUnixSeconds,
        });

        // Track this task ID for future fetches
        const ids = loadTaskIds();
        ids.push(taskId);
        saveTaskIds(ids);

        // Add the new task to the list
        setTasks((prev) => [...prev, result.task as EscrowTask]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create task",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, sdk],
  );

  if (!isConnected) {
    return (
      <section className="view">
        <h2>Requester</h2>
        <p>Create tasks and fund escrows.</p>
        <p className="hint">
          Connect your Freighter wallet (top right) to create a task and see
          your escrows.
        </p>
      </section>
    );
  }

  return (
    <section className="view">
      <h2>Requester</h2>
      <p className="hint">
        Connected as <code>{publicKey}</code>
      </p>
      {error && (
        <div
          className="worker-alert-success"
          style={{
            backgroundColor: "rgba(247, 118, 142, 0.1)",
            borderColor: "rgba(247, 118, 142, 0.35)",
            color: "#f7768e",
          }}
        >
          <div>
            <strong>Error</strong>
            <p>{error}</p>
          </div>
          <button className="btn-dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      <CreateTaskForm onSubmit={handleCreateTask} isSubmitting={isLoading} />
      <EscrowStatusList tasks={tasks} isLoading={isLoading} onRefresh={refreshTasks} />
    </section>
  );
}
