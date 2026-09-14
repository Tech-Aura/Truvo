/**
 * Retry helpers for Soroban RPC network calls.
 *
 * Provides exponential-backoff retry logic that distinguishes between
 * transient network failures (which should be retried) and deterministic
 * contract rejections (which should fail immediately).
 */

import { TruvoNetworkError } from "./errors";

// ============================================================================
// Configuration
// ============================================================================

/** Default maximum number of retry attempts for transient network errors. */
export const DEFAULT_MAX_RETRIES = 3;

/** Base delay in milliseconds before the first retry. */
const BASE_DELAY_MS = 500;

/** Maximum delay cap in milliseconds to prevent unbounded waits. */
const MAX_DELAY_MS = 10_000;

// ============================================================================
// Retryable error detection
// ============================================================================

/**
 * Determine whether an error represents a transient network failure that
 * is worth retrying, as opposed to a deterministic contract rejection.
 *
 * Retryable conditions:
 * - HTTP 5xx responses from the Soroban RPC server.
 * - Connection resets, DNS failures, or socket timeouts.
 * - Soroban RPC "TIMEOUT" or transient error responses.
 *
 * Non-retryable conditions:
 * - Contract execution failures (on-chain `panic!` / `require_auth` rejects).
 * - HTTP 4xx responses (bad request, unauthorized, etc.).
 * - Input validation errors (malformed hex strings, etc.).
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Network-level failures that are clearly transient.
    if (
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("econnaborted") ||
      msg.includes("enotfound") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("fetch failed")
    ) {
      return true;
    }

    // Soroban RPC may return 5xx which surfaces as HTTP errors.
    if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
      return true;
    }

    // Soroban-specific transient statuses.
    if (msg.includes("rpc error") && !msg.includes("contract")) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Exponential backoff retry
// ============================================================================

/**
 * Execute an async operation with automatic retry and exponential backoff.
 *
 * Only errors classified as retryable by {@link isRetryableError} are
 * retried. All other errors propagate immediately.
 *
 * @param fn      - The async operation to execute.
 * @param context - A human-readable label for logging (e.g. "sendTransaction").
 * @param maxRetries - Maximum number of retry attempts (default: 3).
 * @returns The result of `fn` on success.
 * @throws {TruvoNetworkError} If all retry attempts are exhausted.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // If this isn't a retryable error, or we've exhausted retries, bail.
      if (!isRetryableError(err) || attempt >= maxRetries) {
        throw err;
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms, … capped at 10s.
      const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);

      // Small jitter to avoid thundering-herd on shared RPC endpoints.
      const jitter = Math.random() * 200;

      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
    }
  }

  // Should be unreachable, but TypeScript needs a return path.
  const attemptsExhausted = maxRetries + 1;
  throw new TruvoNetworkError(
    `${context}: all ${attemptsExhausted} attempts failed`,
    attemptsExhausted,
    lastError instanceof Error ? lastError : undefined,
  );
}
