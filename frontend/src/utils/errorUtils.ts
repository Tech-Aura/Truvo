/**
 * Error classification utilities for the Truvo frontend.
 *
 * Provides helper functions to classify SDK errors and return
 * human-readable messages that distinguish between:
 * - Network errors (retryable)
 * - Contract errors (non-retryable)
 * - Anchor errors (auth, API)
 * - Generic errors
 */

import * as TruvoSDK from "@truvo/sdk";

const {
  TruvoNetworkError,
  TruvoContractError,
  TruvoAnchorAuthError,
  TruvoAnchorApiError,
  TruvoError,
} = TruvoSDK;

export interface ClassifiedError {
  /** Human-readable error message */
  message: string;
  /** Whether the operation can be retried */
  isRetryable: boolean;
  /** Error category for UI styling */
  category: "network" | "contract" | "auth" | "api" | "unknown";
  /** Raw error for debugging */
  rawError: Error;
}

/**
 * Classify an error from SDK operations and return a structured
 * error object with appropriate messaging.
 */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof TruvoNetworkError) {
    return {
      message: `Network issue (will auto-retry): ${err.message}. Please check your connection and try again.`,
      isRetryable: true,
      category: "network",
      rawError: err,
    };
  }

  if (err instanceof TruvoContractError) {
    return {
      message: `Contract rejected: ${err.contractError}. This operation cannot be retried.`,
      isRetryable: false,
      category: "contract",
      rawError: err,
    };
  }

  if (err instanceof TruvoAnchorAuthError) {
    return {
      message: `Anchor authentication required: ${err.message}. Please authenticate with the anchor first.`,
      isRetryable: false,
      category: "auth",
      rawError: err,
    };
  }

  if (err instanceof TruvoAnchorApiError) {
    return {
      message: `Anchor API error (HTTP ${err.httpStatus}): ${err.message}. ${err.httpStatus >= 500 ? "This may be temporary - please try again." : "Please check your input and try again."}`,
      isRetryable: err.httpStatus >= 500,
      category: "api",
      rawError: err,
    };
  }

  if (err instanceof TruvoError) {
    return {
      message: `Truvo error: ${err.message}`,
      isRetryable: false,
      category: "unknown",
      rawError: err,
    };
  }

  if (err instanceof Error) {
    // Check for common Freighter errors
    if (err.message.includes("Freighter") || err.message.includes("signing")) {
      return {
        message: `Wallet signing failed: ${err.message}. Please approve the transaction in Freighter.`,
        isRetryable: false,
        category: "unknown",
        rawError: err,
      };
    }

    return {
      message: err.message || "An unexpected error occurred",
      isRetryable: false,
      category: "unknown",
      rawError: err,
    };
  }

  return {
    message: "An unexpected error occurred",
    isRetryable: false,
    category: "unknown",
    rawError: new Error(String(err)),
  };
}

/**
 * Get CSS class for error category styling
 */
export function getErrorCategoryClass(category: ClassifiedError["category"]): string {
  switch (category) {
    case "network":
      return "error-network";
    case "contract":
      return "error-contract";
    case "auth":
      return "error-auth";
    case "api":
      return "error-api";
    default:
      return "error-unknown";
  }
}
