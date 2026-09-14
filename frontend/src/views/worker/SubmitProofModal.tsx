/**
 * Submit Proof Modal for Worker view.
 *
 * Allows a worker to submit cryptographic evidence of task completion.
 * Proof data (text/links or uploaded file) is hashed client-side using SHA-256
 * into a 32-byte hex string (BytesN<32>), matching what the Soroban escrow
 * contract expects in confirm_completion.
 */

import { ChangeEvent, useState, useEffect } from "react";
import { EscrowTask } from "../../types/task";
import { computeProofHash, isValidProofHash } from "./proofUtils";

interface SubmitProofModalProps {
  task: EscrowTask;
  onClose: () => void;
  onSubmit: (taskId: string, proofHash: string, proofDescription: string) => void;
}

type ProofInputMode = "text" | "file";

function truncateMiddle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function SubmitProofModal({
  task,
  onClose,
  onSubmit,
}: SubmitProofModalProps) {
  const [mode, setMode] = useState<ProofInputMode>("text");
  const [proofText, setProofText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [computedHash, setComputedHash] = useState("");
  const [isHashing, setIsHashing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute hash whenever proofText changes in "text" mode
  useEffect(() => {
    if (mode !== "text") return;

    if (!proofText.trim()) {
      setComputedHash("");
      setError(null);
      return;
    }

    let isMounted = true;
    setIsHashing(true);
    computeProofHash(proofText.trim())
      .then((hash) => {
        if (isMounted) {
          setComputedHash(hash);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(`Failed to compute hash: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
      .finally(() => {
        if (isMounted) setIsHashing(false);
      });

    return () => {
      isMounted = false;
    };
  }, [proofText, mode]);

  // Handle file selection
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setComputedHash("");
      return;
    }

    setSelectedFile(file);
    setIsHashing(true);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const hash = await computeProofHash(buffer);
      setComputedHash(hash);
    } catch (err) {
      setError(`Failed to hash file: ${err instanceof Error ? err.message : String(err)}`);
      setComputedHash("");
    } finally {
      setIsHashing(false);
    }
  };

  const handleCopyHash = async () => {
    if (!computedHash) return;
    try {
      await navigator.clipboard.writeText(computedHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write fallback
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidProofHash(computedHash)) {
      setError("A valid 32-byte SHA-256 proof hash is required.");
      return;
    }

    setIsSubmitting(true);
    const description =
      mode === "text"
        ? proofText.trim()
        : `File: ${selectedFile?.name ?? "unknown"} (${selectedFile?.size ?? 0} bytes)`;

    onSubmit(task.task_id, computedHash, description);
  };

  const isReady = isValidProofHash(computedHash) && !isHashing && !isSubmitting;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-container proof-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Submit Completion Proof</h3>
            <p className="hint">
              Record cryptographic proof for task{" "}
              <code className="mono">{truncateMiddle(task.task_id)}</code>
            </p>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Educational Callout explaining what Proof means */}
        <div className="proof-explanation-card">
          <div className="explanation-title">
            <span className="info-icon" aria-hidden="true">💡</span>
            <strong>What is a completion proof in Truvo?</strong>
          </div>
          <p>
            A completion proof is cryptographic evidence that you have completed your
            assigned task. Instead of storing heavy deliverables or private files
            on-chain, Truvo hashes your evidence client-side into a unique{" "}
            <strong>32-byte SHA-256 fingerprint</strong>.
          </p>
          <ul className="explanation-list">
            <li>
              <strong>On-Chain:</strong> The 32-byte hash (<code>proof_hash</code>) is
              recorded on the Stellar escrow contract when you confirm completion.
            </li>
            <li>
              <strong>Verification:</strong> The requester receives your deliverable
              off-chain and verifies that its hash matches the on-chain fingerprint
              before releasing your payment.
            </li>
            <li>
              <strong>Privacy & Speed:</strong> Your raw files remain private and
              never consume unnecessary blockchain storage.
            </li>
          </ul>
        </div>

        {/* Task Details Summary */}
        <div className="task-proof-summary">
          <div className="summary-item">
            <span className="summary-label">Payer:</span>
            <span className="mono" title={task.payer}>
              {truncateMiddle(task.payer)}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Escrowed Amount:</span>
            <strong>{task.amount} XLM</strong>
          </div>
          <div className="summary-item">
            <span className="summary-label">Current Status:</span>
            <span className="status-badge status-created">Created</span>
          </div>
        </div>

        {/* Input Mode Selector */}
        <form onSubmit={handleSubmit} className="proof-form">
          <div className="input-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "text"}
              className={`mode-tab ${mode === "text" ? "active" : ""}`}
              onClick={() => {
                setMode("text");
                setError(null);
              }}
            >
              Text / Deliverable Link
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "file"}
              className={`mode-tab ${mode === "file" ? "active" : ""}`}
              onClick={() => {
                setMode("file");
                setError(null);
              }}
            >
              Upload Deliverable File
            </button>
          </div>

          {mode === "text" ? (
            <div className="form-field">
              <label htmlFor="proof-text-input">
                Deliverable URL, PR link, or work summary:
              </label>
              <textarea
                id="proof-text-input"
                rows={3}
                placeholder="e.g. https://github.com/org/repo/pull/42 or summary of completed deliverable"
                value={proofText}
                onChange={(e) => setProofText(e.target.value)}
                autoFocus
              />
              <p className="field-hint">
                Enter your work deliverable link or summary. Its SHA-256 hash will be computed live.
              </p>
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="proof-file-input">
                Select deliverable file (document, archive, image, code):
              </label>
              <input
                id="proof-file-input"
                type="file"
                onChange={handleFileChange}
              />
              {selectedFile && (
                <p className="field-hint">
                  Selected: <strong>{selectedFile.name}</strong> (
                  {(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          )}

          {/* Real-time Proof Hash Display */}
          <div className="hash-preview-box">
            <div className="hash-header">
              <span className="hash-label">
                Computed <code>proof_hash</code> (32 bytes / SHA-256):
              </span>
              {computedHash && (
                <button
                  type="button"
                  className="btn-copy"
                  onClick={handleCopyHash}
                >
                  {copied ? "Copied!" : "Copy Hash"}
                </button>
              )}
            </div>

            {isHashing ? (
              <div className="hash-status-hashing">Computing SHA-256 digest…</div>
            ) : computedHash ? (
              <div className="hash-value mono">{computedHash}</div>
            ) : (
              <div className="hash-placeholder">
                Enter text or upload a file above to generate cryptographic proof hash.
              </div>
            )}

            {computedHash && (
              <p className="hash-valid-note">
                ✓ Valid 32-byte hex hash ready for Soroban <code>confirm_completion</code>
              </p>
            )}
          </div>

          {error && <p className="field-error">{error}</p>}

          {/* Form action buttons */}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!isReady}
            >
              {isSubmitting ? "Submitting…" : "Submit Proof to Escrow"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
