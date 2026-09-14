/**
 * Escrow status display for the Requester view.
 *
 * Renders the tasks the connected user has created as a responsive table
 * with per-status visual styling. Currently fed by mock data
 * (mockTasks.ts); the real SDK call replaces the data source in a later
 * branch — the component's props already match the SDK's Task shape.
 */

import { TaskStatus } from "../../types/task";
import { EscrowTask, MOCK_TASKS } from "./mockTasks";

/** Display metadata per status: label + CSS badge class. */
const STATUS_META: Record<TaskStatus, { label: string; badgeClass: string }> = {
  [TaskStatus.Created]: { label: "Created", badgeClass: "status-created" },
  [TaskStatus.Confirmed]: { label: "Confirmed", badgeClass: "status-confirmed" },
  [TaskStatus.Released]: { label: "Released", badgeClass: "status-released" },
  [TaskStatus.Refunded]: { label: "Refunded", badgeClass: "status-refunded" },
  [TaskStatus.Disputed]: { label: "Disputed", badgeClass: "status-disputed" },
};

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

interface EscrowStatusListProps {
  /**
   * Tasks to display. Defaults to mock data for now; the SDK wiring branch
   * passes real on-chain tasks instead (same shape).
   */
  tasks?: EscrowTask[];
}

export function EscrowStatusList({
  tasks = MOCK_TASKS,
}: EscrowStatusListProps) {
  if (tasks.length === 0) {
    return (
      <div className="escrow-list">
        <h3>Your escrowed tasks</h3>
        <p className="hint">
          No tasks yet — create one with the form above.
        </p>
      </div>
    );
  }

  return (
    <div className="escrow-list">
      <h3>Your escrowed tasks</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Task ID</th>
              <th>Worker</th>
              <th>Amount</th>
              <th>Deadline</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const meta = STATUS_META[task.status];
              return (
                <tr key={task.task_id}>
                  <td title={task.task_id} className="mono">
                    {truncateMiddle(task.task_id)}
                  </td>
                  <td title={task.worker} className="mono">
                    {truncateMiddle(task.worker)}
                  </td>
                  <td>{task.amount} XLM</td>
                  <td>{formatDeadline(task.deadline)}</td>
                  <td>
                    <span className={`status-badge ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="table-note hint">
        Showing mock data — on-chain task fetching is wired in a later branch.
      </p>
    </div>
  );
}
