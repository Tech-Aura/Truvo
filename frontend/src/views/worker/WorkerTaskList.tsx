/**
 * Worker task list component.
 *
 * Displays tasks assigned to the connected worker's address.
 * Shows task details (task_id, payer, amount, deadline, status), and provides
 * filtering and clear visual distinctions between tasks awaiting worker action
 * (Created) versus completed/released tasks.
 */

import { useMemo, useState } from "react";
import { EscrowTask, TaskStatus } from "../../types/task";
import { getMockWorkerTasks } from "./mockTasks";

/** Status display metadata matching contract codes. */
const STATUS_META: Record<TaskStatus, { label: string; badgeClass: string }> = {
  [TaskStatus.Created]: { label: "Created", badgeClass: "status-created" },
  [TaskStatus.Confirmed]: { label: "Confirmed", badgeClass: "status-confirmed" },
  [TaskStatus.Released]: { label: "Released", badgeClass: "status-released" },
  [TaskStatus.Refunded]: { label: "Refunded", badgeClass: "status-refunded" },
  [TaskStatus.Disputed]: { label: "Disputed", badgeClass: "status-disputed" },
};

export type TaskFilter = "all" | "awaiting_action" | "completed";

function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatDeadline(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  const formatted = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const diffSeconds = timestampSeconds - Math.floor(Date.now() / 1000);
  const relative =
    diffSeconds > 0
      ? `in ${formatRelative(diffSeconds)}`
      : `${formatRelative(-diffSeconds)} ago`;
  return `${formatted} (${relative})`;
}

function formatRelative(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

interface WorkerTaskListProps {
  /**
   * Tasks to display. If not provided, mock tasks for the workerAddress are used.
   */
  tasks?: EscrowTask[];
  /** Connected worker wallet address. */
  workerAddress?: string | null;
}

export function WorkerTaskList({
  tasks: customTasks,
  workerAddress,
}: WorkerTaskListProps) {
  const [filter, setFilter] = useState<TaskFilter>("all");

  const allTasks = useMemo(() => {
    return customTasks ?? getMockWorkerTasks(workerAddress);
  }, [customTasks, workerAddress]);

  const awaitingActionCount = useMemo(
    () => allTasks.filter((t) => t.status === TaskStatus.Created).length,
    [allTasks],
  );

  const completedCount = useMemo(
    () => allTasks.filter((t) => t.status === TaskStatus.Released).length,
    [allTasks],
  );

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case "awaiting_action":
        return allTasks.filter((t) => t.status === TaskStatus.Created);
      case "completed":
        return allTasks.filter((t) => t.status === TaskStatus.Released);
      default:
        return allTasks;
    }
  }, [allTasks, filter]);

  if (allTasks.length === 0) {
    return (
      <div className="worker-task-list">
        <h3>Assigned Tasks</h3>
        <p className="hint">No tasks currently assigned to your address.</p>
      </div>
    );
  }

  return (
    <div className="worker-task-list">
      <div className="worker-task-header">
        <div>
          <h3>Assigned Tasks</h3>
          <p className="hint">
            Review your assignments, submit completion proofs, and track payments.
          </p>
        </div>

        {/* Filter controls */}
        <div className="task-filters" role="tablist" aria-label="Task filters">
          <button
            type="button"
            className={`filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({allTasks.length})
          </button>
          <button
            type="button"
            className={`filter-btn filter-highlight ${
              filter === "awaiting_action" ? "active" : ""
            }`}
            onClick={() => setFilter("awaiting_action")}
          >
            Awaiting Action ({awaitingActionCount})
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === "completed" ? "active" : ""}`}
            onClick={() => setFilter("completed")}
          >
            Completed / Released ({completedCount})
          </button>
        </div>
      </div>

      {/* Overview Stat Badges */}
      <div className="worker-summary-cards">
        <div className="summary-card">
          <span className="summary-label">Total Assigned</span>
          <span className="summary-value">{allTasks.length}</span>
        </div>
        <div className="summary-card summary-card-attention">
          <span className="summary-label">Awaiting Proof</span>
          <span className="summary-value">{awaitingActionCount}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Released</span>
          <span className="summary-value">{completedCount}</span>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <p className="hint">No tasks match the selected filter.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Payer</th>
                <th>Amount</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => {
                const meta = STATUS_META[task.status];
                const isActionNeeded = task.status === TaskStatus.Created;

                return (
                  <tr
                    key={task.task_id}
                    className={isActionNeeded ? "row-action-needed" : undefined}
                  >
                    <td title={task.task_id} className="mono">
                      {truncateMiddle(task.task_id)}
                    </td>
                    <td title={task.payer} className="mono">
                      {truncateMiddle(task.payer)}
                    </td>
                    <td className="amount-cell">{task.amount} XLM</td>
                    <td>{formatDeadline(task.deadline)}</td>
                    <td>
                      <span className={`status-badge ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      {task.status === TaskStatus.Created && (
                        <span className="action-pill pill-action-needed">
                          Proof Needed
                        </span>
                      )}
                      {task.status === TaskStatus.Confirmed && (
                        <span className="action-pill pill-pending">
                          Awaiting Release
                        </span>
                      )}
                      {task.status === TaskStatus.Released && (
                        <span className="action-pill pill-completed">
                          Released
                        </span>
                      )}
                      {task.status === TaskStatus.Refunded && (
                        <span className="action-pill pill-neutral">
                          Refunded
                        </span>
                      )}
                      {task.status === TaskStatus.Disputed && (
                        <span className="action-pill pill-disputed">
                          In Dispute
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="table-note hint">
        Showing mock data — on-chain task fetching is wired in a later branch.
      </p>
    </div>
  );
}
