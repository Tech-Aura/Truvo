/**
 * Truvo SDK Anchor Error Types
 *
 * Typed errors for the SEP-24/SEP-12 anchor integration. These extend the
 * SDK's base {@link TruvoError} so consumers can use `instanceof` checks
 * uniformly across contract and anchor code paths.
 *
 * - **Auth errors** ({@link TruvoAnchorAuthError}): the caller is not
 *   authenticated with the anchor (no SEP-10 JWT). Not retryable — the
 *   consumer must authenticate first.
 *
 * - **API errors** ({@link TruvoAnchorApiError}): the anchor returned a
 *   non-2xx HTTP response. Retryable status codes (5xx) are retried
 *   automatically by the HTTP layer; 4xx errors surface immediately.
 *
 * - **Generic anchor errors** ({@link TruvoAnchorError}): malformed
 *   responses or invalid configuration.
 */

import { TruvoError } from "../errors";

/**
 * Base error class for all anchor (SEP) integration errors.
 */
export class TruvoAnchorError extends TruvoError {
  constructor(message: string) {
    super(message);
    this.name = "TruvoAnchorError";
  }
}

/**
 * The operation requires a SEP-10 authenticated session but none exists.
 *
 * Thrown by {@link AnchorClient} methods that talk to authenticated anchor
 * endpoints when neither `authenticate()` has been called nor a pre-minted
 * `authToken` was supplied in the config. Not retryable.
 */
export class TruvoAnchorAuthError extends TruvoAnchorError {
  constructor(message: string) {
    super(message);
    this.name = "TruvoAnchorAuthError";
  }
}

/**
 * The anchor returned a non-2xx HTTP response.
 *
 * The `httpStatus` field carries the response status code and `apiError`
 * carries the parsed JSON error body (or raw text when the body is not
 * JSON). Transient server errors (HTTP 5xx) are retried automatically with
 * exponential backoff before this error is thrown.
 */
export class TruvoAnchorApiError extends TruvoAnchorError {
  constructor(
    message: string,
    /** HTTP status code returned by the anchor (e.g. 400, 401, 503). */
    public readonly httpStatus: number,
    /** Parsed JSON body of the error response, or the raw text body. */
    public readonly apiError?: unknown,
  ) {
    super(message);
    this.name = "TruvoAnchorApiError";
  }
}
