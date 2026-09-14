/**
 * Truvo SDK Error Types
 *
 * Typed errors that allow SDK consumers to distinguish between:
 *
 * - **Network errors** ({@link TruvoNetworkError}): transient failures such as
 *   RPC timeouts, temporary unavailability, or connection resets. These are
 *   retryable — the SDK retries automatically with exponential backoff, and
 *   consumers may also choose to retry manually.
 *
 * - **Contract errors** ({@link TruvoContractError}): deterministic rejections
 *   from the on-chain contract, such as unauthorized callers, invalid task
 *   states, or duplicate task IDs. These are *not* retryable — retrying the
 *   same call will produce the same rejection.
 *
 * Both extend {@link TruvoError}, which extends the built-in `Error` for
 * standard `instanceof` checks.
 */

// ============================================================================
// Base error
// ============================================================================

/**
 * Base error class for all Truvo SDK errors.
 *
 * Carries an optional `txHash` so consumers can correlate the error with a
 * specific on-chain transaction when one was submitted before the failure.
 */
export class TruvoError extends Error {
  constructor(
    message: string,
    public readonly txHash?: string,
  ) {
    super(message);
    this.name = "TruvoError";
  }
}

// ============================================================================
// Network errors (retryable)
// ============================================================================

/**
 * A transient network-level failure.
 *
 * Thrown when the Soroban RPC server is unreachable, times out, or returns
 * an HTTP 5xx error. The SDK retries these automatically up to
 * `{@link TruvoClientConfig.maxRetries}` times with exponential backoff
 * before surfacing the error.
 *
 * Consumers may inspect `cause` for the original underlying error.
 *
 * @example
 * ```ts
 * try {
 *   await client.createEscrow(input);
 * } catch (err) {
 *   if (err instanceof TruvoNetworkError) {
 *     console.warn("Network issue, retrying...", err.message);
 *   }
 * }
 * ```
 */
export class TruvoNetworkError extends TruvoError {
  override readonly name = "TruvoNetworkError";

  constructor(
    message: string,
    /** The number of retry attempts that were exhausted before failing. */
    public readonly attemptsExhausted: number,
    /** The original error that triggered this failure. */
    public readonly cause?: Error,
    txHash?: string,
  ) {
    super(message, txHash);
    this.name = "TruvoNetworkError";
  }
}

// ============================================================================
// Contract errors (non-retryable)
// ============================================================================

/**
 * A deterministic on-chain contract rejection.
 *
 * Thrown when the Soroban contract explicitly rejects a transaction — for
 * example, because the caller is not authorized, the task is in an invalid
 * state, or a duplicate task ID was submitted. These errors represent
 * *business logic* failures and should **not** be retried.
 *
 * The `contractError` field contains the raw error string returned by the
 * contract, which can be inspected for programmatic handling.
 *
 * @example
 * ```ts
 * try {
 *   await client.confirmTask({ taskId, proofHash });
 * } catch (err) {
 *   if (err instanceof TruvoContractError) {
 *     console.error("Contract rejected:", err.contractError);
 *     // e.g. "task is not in Created status" — don't retry
 *   }
 * }
 * ```
 */
export class TruvoContractError extends TruvoError {
  override readonly name = "TruvoContractError";

  constructor(
    message: string,
    /** The raw error string from the contract execution. */
    public readonly contractError: string,
    txHash?: string,
  ) {
    super(message, txHash);
    this.name = "TruvoContractError";
  }
}
