/**
 * Validation for the Requester's create-task form.
 *
 * Pure functions (no React) so they can be unit-tested independently and
 * reused when the real SDK wiring lands in a later branch.
 */

/** Match a Stellar G… account ID: starts with G, 56 base32 characters. */
export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

export interface CreateTaskFields {
  worker: string;
  amount: string;
  deadline: string; // ISO date string from <input type="datetime-local">
}

export type CreateTaskFieldErrors = Partial<
  Record<keyof CreateTaskFields, string>
>;

/** Validate a worker address: must be a well-formed Stellar account ID. */
export function validateWorkerAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) {
    return "Worker address is required.";
  }
  if (!STELLAR_ADDRESS_REGEX.test(trimmed)) {
    return "Not a valid Stellar address (expected 56 characters starting with G).";
  }
  return null;
}

/**
 * Validate an amount string: positive decimal number. Returned as a string
 * to preserve exact decimal input for the SDK's i128 amount later.
 */
export function validateAmount(amount: string): string | null {
  const trimmed = amount.trim();
  if (!trimmed) {
    return "Amount is required.";
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return "Amount must be a number.";
  }
  if (parsed <= 0) {
    return "Amount must be greater than zero.";
  }
  // Reject scientific notation or stray characters by checking the shape.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return "Amount must be a plain decimal number (e.g. 10 or 10.5).";
  }
  return null;
}

/**
 * Validate a deadline: must parse as a date and be in the future.
 * The contract stores a u64 ledger timestamp; when the SDK is wired up,
 * the form value will be converted with Math.floor(date.getTime() / 1000).
 */
export function validateDeadline(deadline: string): string | null {
  if (!deadline) {
    return "Deadline is required.";
  }
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return "Deadline is not a valid date/time.";
  }
  if (date.getTime() <= Date.now()) {
    return "Deadline must be in the future.";
  }
  return null;
}

/** Validate the whole form; returns a per-field error map. */
export function validateCreateTaskForm(
  fields: CreateTaskFields,
): CreateTaskFieldErrors {
  const errors: CreateTaskFieldErrors = {};

  const workerError = validateWorkerAddress(fields.worker);
  if (workerError) errors.worker = workerError;

  const amountError = validateAmount(fields.amount);
  if (amountError) errors.amount = amountError;

  const deadlineError = validateDeadline(fields.deadline);
  if (deadlineError) errors.deadline = deadlineError;

  return errors;
}
