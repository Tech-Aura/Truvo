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
 * Currently uses placeholder/mock data for the dispute list; the SDK
 * wiring branch replaces this with real on-chain queries.
 */

import { useState } from "react";
import { useWallet } from "../wallet/WalletContext";
import { EscrowTask } from "../types/task";
import { DisputeList } from "./admin/DisputeList";
import { getMockDisputedTasks } from "./admin/mockDisputes";

/**
 * Placeholder arbitrator address — in production this would come from
 * the contract's stored arbitrator key. For now, it must match the
 * connected wallet for the resolve action to be usable.
 */
const ARBITRATOR_ADDRESS =
  "GARBITRATORMOCKADDRESS00000000000000000000000000000000000000000";

export default function Admin() {
  const { isConnected, publicKey } = useWallet();
  const [disputes] = useState<EscrowTask[]>(() => getMockDisputedTasks());

  const isArbitrator = isConnected && publicKey === ARBITRATOR_ADDRESS;

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

  return (
    <section className="view">
      <h2>Admin</h2>
      <p className="hint">
        Connected as arbitrator <code>{publicKey}</code>
      </p>
      <DisputeList
        tasks={disputes}
        onResolve={async (taskId, outcome) => {
          console.log(
            "[placeholder] resolveDispute would be called with:",
            JSON.stringify({ taskId, outcome }, null, 2),
          );
          // SDK wiring: resolveDispute({ taskId, outcome }) goes here
        }}
      />
    </section>
  );
}
