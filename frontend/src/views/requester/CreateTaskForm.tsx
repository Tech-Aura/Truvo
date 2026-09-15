/**
 * Create-task form for the Requester view.
 *
 * Structure + validation only for now: the submit handler logs the input
 * (onSubmitPlaceholder). Wiring to TruvoClient.createEscrow happens in a
 * later branch; validation.ts is written so the SDK branch can reuse it
 * as-is.
 */

import { FormEvent, useState } from "react";
import {
  CreateTaskFieldErrors,
  CreateTaskFields,
  validateCreateTaskForm,
} from "./validation";

export type { CreateTaskFields } from "./validation";

const EMPTY_FIELDS: CreateTaskFields = {
  worker: "",
  amount: "",
  deadline: "",
};

interface CreateTaskFormProps {
  /** Real submit handler — calls createEscrow on-chain. */
  onSubmit?: (fields: CreateTaskFields) => void;
  /** Whether a submission is in progress. */
  isSubmitting?: boolean;
}

export function CreateTaskForm({
  onSubmit,
  isSubmitting = false,
}: CreateTaskFormProps) {
  const [fields, setFields] = useState<CreateTaskFields>(EMPTY_FIELDS);
  const [errors, setErrors] = useState<CreateTaskFieldErrors>({});
  const [submittedNote, setSubmittedNote] = useState<string | null>(null);

  const setField = (name: keyof CreateTaskFields, value: string) => {
    setFields((prev) => ({ ...prev, [name]: value }));
    // Clear the field's error as the user fixes it.
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setSubmittedNote(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationErrors = validateCreateTaskForm(fields);
    setErrors(validationErrors);

    if (Object.values(validationErrors).some(Boolean)) {
      setSubmittedNote(null);
      return;
    }

    onSubmit?.(fields);
    setSubmittedNote("Task submitted — signing with Freighter…");
    setFields(EMPTY_FIELDS);
  };

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <h3>Create a new task</h3>

      <div className="form-field">
        <label htmlFor="worker">Worker's Stellar address</label>
        <input
          id="worker"
          name="worker"
          type="text"
          placeholder="GABCDEFGHIJKLMNOPQRSTUVWXYZ234567…"
          value={fields.worker}
          onChange={(e) => setField("worker", e.target.value)}
          aria-invalid={Boolean(errors.worker)}
        />
        {errors.worker && <p className="field-error">{errors.worker}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="amount">Amount (XLM)</label>
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 10"
          value={fields.amount}
          onChange={(e) => setField("amount", e.target.value)}
          aria-invalid={Boolean(errors.amount)}
        />
        {errors.amount && <p className="field-error">{errors.amount}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="deadline">Deadline</label>
        <input
          id="deadline"
          name="deadline"
          type="datetime-local"
          value={fields.deadline}
          onChange={(e) => setField("deadline", e.target.value)}
          aria-invalid={Boolean(errors.deadline)}
        />
        {errors.deadline && <p className="field-error">{errors.deadline}</p>}
        <p className="field-hint">
          After this time, the escrow can be refunded to you if the task was
          never confirmed.
        </p>
      </div>

      <button type="submit" className="primary" disabled={isSubmitting}>
        {isSubmitting ? "Creating…" : "Create task"}
      </button>

      {submittedNote && <p className="submit-note">{submittedNote}</p>}
    </form>
  );
}
