/**
 * Dispute List for the Admin/Arbitrator view.
 *
 * Displays all tasks currently in "Disputed" status across all users,
 * with enough detail for an arbitrator to make a decision. Includes
 * a resolve action that opens a modal to choose an outcome.
 *
 * Currently fed by mock data (mockDisputes.ts); the SDK wiring branch
 * replaces the data source with real on-chain queries.
 */

import { useState } from "react";
import { EscrowTask } from "../../types/task";
import { ResolveModal } from "./ResolveModal";

function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

interface DisputeListProps {
  /** Disputed tasks to display. Defaults to mock data. */
  tasks: EscrowTask[];
  /** Called when the arbitrator resolves a dispute. */
  onResolve: (taskId: string, outcome: "Worker" | "Payer") => Promise<void>;
}

export function DisputeList({ tasks, onResolve }: DisputeListProps) {
  const [selectedTask, setSelectedTask] = useState<EscrowTask | null>(null);

  if (tasks.length === 0) {
    return (
      <div className="escrow-list">
        <h3>Disputed Tasks</h3>
        <p className="hint">
          No disputes to resolve — all tasks are in good standing.
        </p>
      </div>
    );
  }

  return (
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
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.task_id}>
                <td title={task.task_id} className="mono">
                  {truncateMiddle(task.task_id)}
                </td>
                <td title={task.payer} className="mono">
                  {truncateMiddle(task.payer)}
                </td>
                <td title={task.worker} className="mono">
                  {truncateMiddle(task.worker)}
                </td>
                <td className="amount-cell">{task.amount} XLM</td>
                <td>
                  {task.proof_hash ? (
                    <span
                      title={task.proof_hash}
                      className="mono"
                      style={{ color: "#9ece6a" }}
                    >
                      {truncateMiddle(task.proof_hash, 8, 4)}
                    </span>
                  ) : (
                    <span className="hint" style={{ fontStyle: "italic" }}>
                      None
                    </span>
                  )}
                </td>
                <td>
                  <button
                    className="btn-action primary-sm"
                    onClick={() => setSelectedTask(task)}
                  >
                    Resolve
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedTask && (
        <ResolveModal
          task={selectedTask}
          onResolve={async (taskId, outcome) => {
            await onResolve(taskId, outcome);
            setSelectedTask(null);
          }}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
