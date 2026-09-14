/**
 * Worker task list component.
 *
 * Displays tasks assigned to the connected worker's address.
 * Shows task details (task_id, payer, amount, deadline, status), provides
 * filtering and clear visual distinctions between tasks awaiting worker action
 * (Created) versus completed/released tasks, provides the completion-proof
 * submission flow, and provides the withdraw-to-local-currency flow.
 */

import { useEffect, useMemo, useState } from "react";
import { EscrowTask, TaskStatus } from "../../types/task";
import { getMockWorkerTasks } from "./mockTasks";
import { SubmitProofModal } from "./SubmitProofModal";
import { WithdrawModal } from "./WithdrawModal";
import { estimateLocalValue } from "./withdrawalUtils";

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
  /**
   * Placeholder balance for worker's wallet in XLM.
   * Defaults to sum of released tasks if not explicitly provided.
   */
  placeholderBalance?: string;
  /**
   * Placeholder submit handler for proof submission. Real SDK call
   * (TruvoClient.confirmTask) replaces this in a later branch.
   */
  onSubmitProofPlaceholder?: (
    taskId: string,
    proofHash: string,
    description: string,
  ) => void;
  /**
   * Placeholder handler for initiating anchor withdrawal. Real SDK call
   * (AnchorClient.initiateWithdrawal) replaces this in a later branch.
   */
  onInitiateWithdrawalPlaceholder?: (
    assetCode: string,
    amount: string,
    account: string,
  ) => { transactionId: string; interactiveUrl: string };
}

export function WorkerTaskList({
  tasks: customTasks,
  workerAddress,
  placeholderBalance: customBalance,
  onSubmitProofPlaceholder = (taskId, proofHash, description) => {
    console.log(
      "[placeholder] TruvoClient.confirmTask would be called with:",
      JSON.stringify(
        {
          taskId,
          proofHash,
          description,
        },
        null,
        2,
      ),
    );
  },
  onInitiateWithdrawalPlaceholder,
}: WorkerTaskListProps) {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [taskList, setTaskList] = useState<EscrowTask[]>(() => {
    return customTasks ?? getMockWorkerTasks(workerAddress);
  });
  const [selectedTaskForProof, setSelectedTaskForProof] =
    useState<EscrowTask | null>(null);
  const [selectedTaskForWithdraw, setSelectedTaskForWithdraw] =
    useState<EscrowTask | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<{
    taskId: string;
    proofHash: string;
  } | null>(null);

  // Sync if customTasks or workerAddress changes
  useEffect(() => {
    setTaskList(customTasks ?? getMockWorkerTasks(workerAddress));
  }, [customTasks, workerAddress]);

  const awaitingActionCount = useMemo(
    () => taskList.filter((t) => t.status === TaskStatus.Created).length,
    [taskList],
  );

  const completedCount = useMemo(
    () => taskList.filter((t) => t.status === TaskStatus.Released).length,
    [taskList],
  );

  // Compute spendable wallet balance from released tasks
  const walletBalance = useMemo(() => {
    if (customBalance !== undefined) return customBalance;
    const sum = taskList
      .filter((t) => t.status === TaskStatus.Released)
      .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
    return sum.toFixed(2);
  }, [taskList, customBalance]);

  const balanceEstimate = useMemo(() => {
    return estimateLocalValue(walletBalance, "NGN");
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

  const handleProofSubmit = (
    taskId: string,
    proofHash: string,
    description: string,
  ) => {
    onSubmitProofPlaceholder(taskId, proofHash, description);

    setTaskList((prev) =>
      prev.map((task) =>
        task.task_id === taskId
          ? { ...task, status: TaskStatus.Confirmed, proof_hash: proofHash }
          : task,
      ),
    );

    setSuccessNotice({ taskId, proofHash });
    setSelectedTaskForProof(null);
  };

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

      {/* Success Notification Banner */}
      {successNotice && (
        <div className="worker-alert-success" role="status">
          <div>
            <strong>Proof Submitted Successfully!</strong>
            <p>
              Task <code className="mono">{truncateMiddle(successNotice.taskId)}</code>{" "}
              is now <strong>Confirmed</strong>. Proof hash:{" "}
              <code className="mono">{truncateMiddle(successNotice.proofHash, 10, 8)}</code>{" "}
              has been recorded (placeholder). The requester can now verify the
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

      <p className="table-note hint">
        Showing mock data — on-chain task fetching and contract execution are wired in a later branch.
      </p>

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
          onInitiateWithdrawalPlaceholder={onInitiateWithdrawalPlaceholder}
        />
      )}
    </div>
  );
}
