/**
 * Worker task list component.
 *
 * Displays tasks assigned to the connected worker's address.
 * Shows task details (task_id, payer, amount, deadline, status), provides
 * filtering and clear visual distinctions between tasks awaiting worker action
 * (Created) versus completed/released tasks, provides the completion-proof
 * submission flow, and provides the withdraw-to-local-currency flow.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { EscrowTask, TaskStatus } from "../../types/task";
import { useTruvoSDK } from "../../sdk/TruvoContext";
import { SubmitProofModal } from "./SubmitProofModal";
import { WithdrawModal } from "./WithdrawModal";
import { classifyError, ClassifiedError } from "../../utils/errorUtils";

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
   * Tasks to display. If not provided, tasks are fetched from on-chain storage
   * using the SDK's getTask method with tracked task IDs.
   */
  tasks?: EscrowTask[];
  /** Connected worker wallet address. */
  workerAddress?: string | null;
}

/** localStorage key for tracking worker task IDs. */
const WORKER_TASK_IDS_KEY = "truvo_worker_task_ids";

function loadWorkerTaskIds(): string[] {
  try {
    const raw = localStorage.getItem(WORKER_TASK_IDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function WorkerTaskList({
  tasks: customTasks,
  workerAddress,
}: WorkerTaskListProps) {
  const sdk = useTruvoSDK();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [taskList, setTaskList] = useState<EscrowTask[]>(customTasks ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ClassifiedError | null>(null);
  const [selectedTaskForProof, setSelectedTaskForProof] =
    useState<EscrowTask | null>(null);
  const [selectedTaskForWithdraw, setSelectedTaskForWithdraw] =
    useState<EscrowTask | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<{
    taskId: string;
    proofHash: string;
  } | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>("0");

  /** Fetch tasks from on-chain storage. */
  const refreshTasks = useCallback(async () => {
    if (!workerAddress) return;

    setIsLoading(true);
    setError(null);
    try {
      const taskIds = loadWorkerTaskIds();
      const fetched: EscrowTask[] = [];

      for (const id of taskIds) {
        try {
          const task = await sdk.getTask(id);
          // Filter to tasks where this worker is assigned
          if (task.worker === workerAddress) {
            fetched.push(task as EscrowTask);
          }
        } catch {
          // Task may have been removed or not found
        }
      }

      setTaskList(fetched);
    } catch (err) {
      setError(classifyError(err));
    } finally {
      setIsLoading(false);
    }
  }, [workerAddress, sdk]);

  /** Fetch wallet balance from Horizon. */
  const refreshBalance = useCallback(async () => {
    if (!workerAddress) return;
    try {
      const balance = await sdk.getWorkerBalance(workerAddress);
      setWalletBalance(balance.available);
    } catch {
      // Balance fetch failed — use fallback from released tasks
      const sum = taskList
        .filter((t) => t.status === TaskStatus.Released)
        .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
      setWalletBalance(sum.toFixed(2));
    }
  }, [workerAddress, sdk, taskList]);

  // Fetch tasks and balance on mount
  useEffect(() => {
    if (workerAddress) {
      refreshTasks();
      refreshBalance();
    }
  }, [workerAddress, refreshTasks, refreshBalance]);

  // Sync if customTasks changes
  useEffect(() => {
    if (customTasks) {
      setTaskList(customTasks);
    }
  }, [customTasks]);

  const awaitingActionCount = useMemo(
    () => taskList.filter((t) => t.status === TaskStatus.Created).length,
    [taskList],
  );

  const completedCount = useMemo(
    () => taskList.filter((t) => t.status === TaskStatus.Released).length,
    [taskList],
  );

  const balanceEstimate = useMemo(() => {
    // Use SDK estimateLocalCurrencyValue for real estimation
    // For now, return a placeholder estimate
    const xlmAmount = parseFloat(walletBalance) || 0;
    return {
      formatted: `~${(xlmAmount * 0.12).toFixed(2)} USD`,
      rate: 0.12,
    };
  }, [walletBalance]);

  const hasReleasedFunds = parseFloat(walletBalance) > 0;

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case "awaiting_action":
        return taskList.filter((t) => t.status === TaskStatus.Created);
      case "completed":
        return taskList.filter((t) => t.status === TaskStatus.Released);
      default:
        return taskList;
    }
  }, [taskList, filter]);

  const handleProofSubmit = useCallback(
    async (taskId: string, proofHash: string, _description: string) => {
      setError(null);
      try {
        // Call confirmTask on-chain via the SDK
        await sdk.confirmTask({ taskId, proofHash });

        // Update local state
        setTaskList((prev) =>
          prev.map((task) =>
            task.task_id === taskId
              ? { ...task, status: TaskStatus.Confirmed, proof_hash: proofHash }
              : task,
          ),
        );

        setSuccessNotice({ taskId, proofHash });
        setSelectedTaskForProof(null);
      } catch (err) {
        setError(classifyError(err));
      }
    },
    [sdk],
  );

  const handleOpenWithdrawForTask = (task: EscrowTask) => {
    setSelectedTaskForWithdraw(task);
    setIsWithdrawModalOpen(true);
  };

  const handleOpenGeneralWithdraw = () => {
    setSelectedTaskForWithdraw(null);
    setIsWithdrawModalOpen(true);
  };

  if (taskList.length === 0) {
    return (
      <div className="worker-task-list">
        <h3>Assigned Tasks</h3>
        <p className="hint">No tasks currently assigned to your address.</p>
      </div>
    );
  }

  return (
    <div className="worker-task-list">
      {/* Worker Earnings & Local Currency Off-Ramp Banner (visible when funds are released) */}
      {hasReleasedFunds && (
        <div className="worker-earnings-card">
          <div className="earnings-info">
            <div className="earnings-header-row">
              <span className="earnings-label">Available Wallet Balance</span>
              <span className="badge-anchor-sep24">SEP-24 Off-Ramp</span>
            </div>
            <div className="earnings-values">
              <span className="earnings-amount">{walletBalance} XLM</span>
              <span className="earnings-estimate">
                ≈ {balanceEstimate.formatted}
              </span>
            </div>
            <p className="earnings-subtext">
              Funds from completed and released escrows are in your Stellar wallet.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary btn-withdraw-action"
            onClick={handleOpenGeneralWithdraw}
          >
            Withdraw to Local Currency
          </button>
        </div>
      )}

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
            All ({taskList.length})
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
          <span className="summary-value">{taskList.length}</span>
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

      {/* Error Notification Banner */}
      {error && (
        <div
          className="worker-alert-success error-alert"
          role="alert"
          style={{
            backgroundColor: "rgba(247, 118, 142, 0.1)",
            borderColor: "rgba(247, 118, 142, 0.35)",
            color: "#f7768e",
          }}
        >
          <div>
            <strong>Error</strong>
            <p>{error.message}</p>
            {error.isRetryable && (
              <p style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "#e0af68" }}>
                This error may be temporary. You can try again.
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-dismiss"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Success Notification Banner */}
      {successNotice && (
        <div className="worker-alert-success" role="status">
          <div>
            <strong>Proof Submitted Successfully!</strong>
            <p>
              Task <code className="mono">{truncateMiddle(successNotice.taskId)}</code>{" "}
              is now <strong>Confirmed</strong>. Proof hash:{" "}
              <code className="mono">{truncateMiddle(successNotice.proofHash, 10, 8)}</code>{" "}
              has been recorded. The requester can now verify the
              proof and release funds.
            </p>
          </div>
          <button
            type="button"
            className="btn-dismiss"
            onClick={() => setSuccessNotice(null)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

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
                        <button
                          type="button"
                          className="btn-action primary-sm"
                          onClick={() => setSelectedTaskForProof(task)}
                          title="Submit completion proof for this task"
                        >
                          Submit Proof
                        </button>
                      )}
                      {task.status === TaskStatus.Confirmed && (
                        <span className="action-pill pill-pending">
                          Awaiting Release
                        </span>
                      )}
                      {task.status === TaskStatus.Released && (
                        <div className="action-released-group">
                          <span className="action-pill pill-completed">
                            Released
                          </span>
                          <button
                            type="button"
                            className="btn-action success-sm"
                            onClick={() => handleOpenWithdrawForTask(task)}
                            title="Withdraw funds for this released task to local currency"
                          >
                            Withdraw
                          </button>
                        </div>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
        <button
          className="btn-action"
          onClick={refreshTasks}
          disabled={isLoading}
          style={{ fontSize: "0.78rem" }}
        >
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
        <p className="table-note hint" style={{ margin: 0 }}>
          {taskList.length} task{taskList.length !== 1 ? "s" : ""} on-chain
        </p>
      </div>

      {/* Completion Proof Submission Modal */}
      {selectedTaskForProof && (
        <SubmitProofModal
          task={selectedTaskForProof}
          onClose={() => setSelectedTaskForProof(null)}
          onSubmit={handleProofSubmit}
        />
      )}

      {/* Withdraw to Local Currency Modal */}
      {isWithdrawModalOpen && (
        <WithdrawModal
          workerAddress={workerAddress || "GBWORKERMOCKADDRESS1111111111111111111111111111111111111111"}
          defaultAmount={selectedTaskForWithdraw?.amount || walletBalance}
          availableBalance={walletBalance}
          onClose={() => {
            setIsWithdrawModalOpen(false);
            setSelectedTaskForWithdraw(null);
          }}

        />
      )}
    </div>
  );
}
