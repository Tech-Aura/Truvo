/**
 * Resolve Dispute Modal
 *
 * Allows the arbitrator to choose an outcome for a disputed task:
 * - "Worker" — release escrowed funds to the worker
 * - "Payer"  — refund the escrowed amount to the payer
 *
 * Displays the disputed task details for review before confirming.
 */

import { useState } from "react";
import { EscrowTask } from "../../types/task";
import { classifyError, ClassifiedError } from "../../utils/errorUtils";

function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

interface ResolveModalProps {
  task: EscrowTask;
  onResolve: (taskId: string, outcome: "Worker" | "Payer") => Promise<void>;
  onClose: () => void;
}

export function ResolveModal({ task, onResolve, onClose }: ResolveModalProps) {
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<ClassifiedError | null>(null);

  const handleResolve = async (outcome: "Worker" | "Payer") => {
    setIsResolving(true);
    setError(null);
    try {
      await onResolve(task.task_id, outcome);
    } catch (err) {
      setError(classifyError(err));
      setIsResolving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Resolve Dispute</h3>
            <p className="hint">Review the task details and choose an outcome.</p>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="task-proof-summary">
          <div className="summary-item">
            <span className="hint">Task:</span>
            <code className="mono" title={task.task_id}>
              {truncateMiddle(task.task_id)}
            </code>
          </div>
          <div className="summary-item">
            <span className="hint">Amount:</span>
            <span className="amount-cell">{task.amount} XLM</span>
          </div>
        </div>

        <div className="form-field">
          <label>Payer</label>
          <code className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>
            {task.payer}
          </code>
        </div>

        <div className="form-field">
          <label>Worker</label>
          <code className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>
            {task.worker}
          </code>
        </div>

        {task.proof_hash && (
          <div className="form-field">
            <label>Proof Hash</label>
            <code className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all", color: "#9ece6a" }}>
              {task.proof_hash}
            </code>
          </div>
        )}

        {!task.proof_hash && (
          <div className="form-field">
            <label>Proof Hash</label>
            <span className="hint" style={{ fontStyle: "italic" }}>
              No proof submitted
            </span>
          </div>
        )}

        {error && (
          <div className="field-error" style={{ marginTop: "0.5rem" }}>
            <p>{error.message}</p>
            {error.isRetryable && (
              <p style={{ fontSize: "0.8rem", marginTop: "0.25rem", color: "#e0af68" }}>
                You can try again.
              </p>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button
            className="btn-action"
            style={{
              backgroundColor: "rgba(158, 206, 106, 0.15)",
              color: "#9ece6a",
              border: "1px solid #9ece6a",
              padding: "0.55em 1.2em",
              fontSize: "0.9rem",
            }}
            onClick={() => handleResolve("Worker")}
            disabled={isResolving}
          >
            {isResolving ? "Resolving…" : "Rule in Worker's Favor"}
          </button>
          <button
            className="btn-action"
            style={{
              backgroundColor: "rgba(187, 154, 247, 0.15)",
              color: "#bb9af7",
              border: "1px solid #bb9af7",
              padding: "0.55em 1.2em",
              fontSize: "0.9rem",
            }}
            onClick={() => handleResolve("Payer")}
            disabled={isResolving}
          >
            {isResolving ? "Resolving…" : "Rule in Payer's Favor"}
          </button>
        </div>
      </div>
    </div>
  );
}
