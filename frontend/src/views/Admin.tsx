/**
 * Admin / Arbitrator view.
 *
 * Shows a list of tasks currently in "Disputed" status across all users,
 * with enough detail for an arbitrator to make a decision. Provides a
 * resolve action to choose an outcome in the worker's or payer's favor.
 *
 * Gated so only the arbitrator wallet can interact — a simple "connected
 * wallet must match arbitrator address" check is used (no full permissions
 * system needed yet).
 *
 * Now wired to the Truvo SDK — tasks are fetched from on-chain storage
 * and disputes are resolved via the SDK's resolveDispute method.
 */

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../wallet/WalletContext";
import { useTruvoSDK } from "../sdk/TruvoContext";
import { EscrowTask, TaskStatus } from "../types/task";
import { DisputeList } from "./admin/DisputeList";

/**
 * Placeholder arbitrator address — in production this would come from
 * the contract's stored arbitrator key. For now, it must match the
 * connected wallet for the resolve action to be usable.
 */
const ARBITRATOR_ADDRESS =
  "GARBITRATORMOCKADDRESS00000000000000000000000000000000000000000";

/** localStorage key for tracking all known task IDs (across users). */
const ALL_TASK_IDS_KEY = "truvo_all_task_ids";

function loadAllTaskIds(): string[] {
  try {
    const raw = localStorage.getItem(ALL_TASK_IDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function Admin() {
  const { isConnected, publicKey } = useWallet();
  const sdk = useTruvoSDK();
  const [disputes, setDisputes] = useState<EscrowTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isArbitrator = isConnected && publicKey === ARBITRATOR_ADDRESS;

  /** Fetch all disputed tasks from on-chain storage. */
  const refreshDisputes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const taskIds = loadAllTaskIds();
      const fetched: EscrowTask[] = [];

      for (const id of taskIds) {
        try {
          const task = await sdk.getTask(id);
          if (task.status === TaskStatus.Disputed) {
            fetched.push(task as EscrowTask);
          }
        } catch {
          // Task may have been removed or not found
        }
      }

      setDisputes(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch disputes");
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  // Fetch disputes on mount
  useEffect(() => {
    refreshDisputes();
  }, [refreshDisputes]);

  if (!isConnected) {
    return (
      <section className="view">
        <h2>Admin</h2>
        <p>
          Arbitrator view for resolving disputes. Connect the arbitrator's
          Freighter wallet to manage disputes.
        </p>
        <p className="hint">
          Connect the arbitrator's Freighter wallet (top right) to manage
          disputes.
        </p>
      </section>
    );
  }

  if (!isArbitrator) {
    return (
      <section className="view">
        <h2>Admin</h2>
        <p className="hint">
          Connected as <code>{publicKey}</code>
        </p>
        <div
          className="worker-alert-success"
          style={{
            backgroundColor: "rgba(247, 118, 142, 0.1)",
            borderColor: "rgba(247, 118, 142, 0.35)",
            color: "#f7768e",
          }}
        >
          <div>
            <strong>Not authorized</strong>
            <p>
              The connected wallet does not match the arbitrator address.
              Only the designated arbitrator can resolve disputes.
            </p>
          </div>
        </div>
        <div className="escrow-list">
          <h3>Disputed Tasks</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Payer</th>
                  <th>Worker</th>
                  <th>Amount</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((task) => (
                  <tr key={task.task_id}>
                    <td title={task.task_id} className="mono">
                      {task.task_id.slice(0, 6)}…{task.task_id.slice(-4)}
                    </td>
                    <td title={task.payer} className="mono">
                      {task.payer.slice(0, 6)}…{task.payer.slice(-4)}
                    </td>
                    <td title={task.worker} className="mono">
                      {task.worker.slice(0, 6)}…{task.worker.slice(-4)}
                    </td>
                    <td className="amount-cell">{task.amount} XLM</td>
                    <td>
                      {task.proof_hash ? (
                        <span
                          title={task.proof_hash}
                          className="mono"
                          style={{ color: "#9ece6a" }}
                        >
                          {task.proof_hash.slice(0, 8)}…{task.proof_hash.slice(-4)}
                        </span>
                      ) : (
                        <span className="hint" style={{ fontStyle: "italic" }}>
                          None
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note hint">
            Connect the arbitrator wallet to resolve disputes.
          </p>
        </div>
      </section>
    );
  }

  const handleResolve = useCallback(
    async (taskId: string, outcome: "Worker" | "Payer") => {
      setError(null);
      try {
        await sdk.resolveDispute({ taskId, outcome });
        // Remove the resolved dispute from the list
        setDisputes((prev) => prev.filter((t) => t.task_id !== taskId));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to resolve dispute",
        );
        throw err; // Re-throw so the modal can display the error
      }
    },
    [sdk],
  );

  return (
    <section className="view">
      <h2>Admin</h2>
      <p className="hint">
        Connected as arbitrator <code>{publicKey}</code>
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
      <DisputeList
        tasks={disputes}
        onResolve={handleResolve}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
        <button
          className="btn-action"
          onClick={refreshDisputes}
          disabled={isLoading}
          style={{ fontSize: "0.78rem" }}
        >
          {isLoading ? "Refreshing…" : "Refresh Disputes"}
        </button>
      </div>
    </section>
  );
}
