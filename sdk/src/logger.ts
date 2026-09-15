/**
 * Truvo SDK - Structured Logger with Correlation ID
 *
 * Provides end-to-end traceability across the full payment pipeline.
 * Every log line carries a consistent correlation identifier (task_id)
 * so a complete payment journey can be reconstructed from logs alone:
 *
 *   agent x402 request → escrow creation → worker confirmation →
 *   funds release → anchor withdrawal initiation → withdrawal completion
 *
 * Usage:
 * ```ts
 * import { createLogger } from "./logger";
 *
 * const log = createLogger("agent");
 * log.info("x402_request_initiated", { taskId: "abc123", url: "/api/tasks" });
 * log.info("escrow_created", { taskId: "abc123", txHash: "0x..." });
 * ```
 *
 * All log methods accept a stage name and an optional metadata object.
 * The correlation_id (taskId) is threaded through every log line automatically.
 */

// ============================================================================
// Types
// ============================================================================

/** Supported log levels. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** A single structured log entry. */
export interface LogEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Log level. */
  level: LogLevel;
  /** Component that produced the log (e.g. "sdk.x402", "sdk.client", "server", "agent"). */
  component: string;
  /** Pipeline stage name (e.g. "x402_request_initiated", "escrow_created"). */
  stage: string;
  /** Correlation identifier — the task_id threading through the entire pipeline. */
  correlation_id?: string;
  /** Human-readable message. */
  message: string;
  /** Additional structured metadata. */
  meta?: Record<string, unknown>;
}

/** Logger configuration. */
export interface LoggerConfig {
  /** Component name for this logger instance. */
  component: string;
  /** Minimum log level to output. Defaults to "info". */
  minLevel?: LogLevel;
  /** Optional custom output function. Defaults to console output. */
  sink?: (entry: LogEntry) => void;
}

// ============================================================================
// Log Level Ordering
// ============================================================================

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// Structured Logger
// ============================================================================

/**
 * Structured logger with correlation ID support for end-to-end pipeline tracing.
 *
 * Each logger instance is bound to a component name. Log entries are emitted
 * as JSON objects with a consistent schema: timestamp, level, component, stage,
 * correlation_id, message, and optional meta.
 *
 * @example
 * ```ts
 * const log = createLogger("sdk.x402");
 *
 * // Trace an x402 request with its task_id
 * log.info("x402_request_initiated", { taskId: "abc123" }, {
 *   url: "/api/tasks",
 *   method: "POST",
 * });
 *
 * log.info("x402_payment_submitted", { taskId: "abc123" }, {
 *   txHash: "0x...",
 *   amount: "1000000",
 * });
 * ```
 */
export class TruvoLogger {
  private readonly component: string;
  private readonly minLevel: LogLevel;
  private readonly sink: (entry: LogEntry) => void;

  constructor(config: LoggerConfig) {
    this.component = config.component;
    this.minLevel = config.minLevel || "info";
    this.sink = config.sink || defaultSink;
  }

  /**
   * Log at debug level.
   */
  debug(stage: string, taskIdOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.log("debug", stage, taskIdOrMeta, meta);
  }

  /**
   * Log at info level.
   */
  info(stage: string, taskIdOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.log("info", stage, taskIdOrMeta, meta);
  }

  /**
   * Log at warn level.
   */
  warn(stage: string, taskIdOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.log("warn", stage, taskIdOrMeta, meta);
  }

  /**
   * Log at error level.
   */
  error(stage: string, taskIdOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.log("error", stage, taskIdOrMeta, meta);
  }

  /**
   * Create a child logger bound to a specific task_id.
   * All subsequent log calls on the child will automatically include
   * the correlation_id.
   */
  child(taskId: string): ChildLogger {
    return new ChildLogger(this, taskId);
  }

  /** Internal log emission. */
  private log(
    level: LogLevel,
    stage: string,
    taskIdOrMeta?: string | Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.minLevel]) {
      return;
    }

    let correlation_id: string | undefined;
    let entryMeta: Record<string, unknown> | undefined;

    if (typeof taskIdOrMeta === "string") {
      correlation_id = taskIdOrMeta;
      entryMeta = meta;
    } else if (taskIdOrMeta !== undefined) {
      // If the object has a taskId field, extract it as correlation_id
      const obj = taskIdOrMeta;
      if ("taskId" in obj && typeof obj.taskId === "string") {
        correlation_id = obj.taskId;
      } else if ("task_id" in obj && typeof obj.task_id === "string") {
        correlation_id = obj.task_id;
      }
      entryMeta = obj;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      stage,
      correlation_id,
      message: stage,
      meta: entryMeta,
    };

    this.sink(entry);
  }
}

// ============================================================================
// Child Logger (auto-injects correlation_id)
// ============================================================================

/**
 * Logger child instance bound to a specific task_id.
 * Automatically injects the correlation_id into every log entry.
 */
export class ChildLogger {
  private readonly parent: TruvoLogger;
  private readonly taskId: string;

  constructor(parent: TruvoLogger, taskId: string) {
    this.parent = parent;
    this.taskId = taskId;
  }

  debug(stage: string, meta?: Record<string, unknown>): void {
    this.parent.debug(stage, this.taskId, meta);
  }

  info(stage: string, meta?: Record<string, unknown>): void {
    this.parent.info(stage, this.taskId, meta);
  }

  warn(stage: string, meta?: Record<string, unknown>): void {
    this.parent.warn(stage, this.taskId, meta);
  }

  error(stage: string, meta?: Record<string, unknown>): void {
    this.parent.error(stage, this.taskId, meta);
  }
}

// ============================================================================
// Default Sink
// ============================================================================

/**
 * Default log sink — outputs structured JSON to stderr.
 * In development, this is easy to filter with `grep` or pipe to `jq`.
 */
function defaultSink(entry: LogEntry): void {
  // Use stderr for log output so stdout stays clean for program output
  process.stderr.write(JSON.stringify(entry) + "\n");
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new structured logger for a component.
 *
 * @param component - The component name (e.g. "sdk.x402", "sdk.client", "server", "agent").
 * @param options - Optional config overrides (minLevel, custom sink).
 * @returns A configured {@link TruvoLogger}.
 */
export function createLogger(
  component: string,
  options?: Partial<Pick<LoggerConfig, "minLevel" | "sink">>,
): TruvoLogger {
  return new TruvoLogger({
    component,
    ...options,
  });
}

// ============================================================================
// Pipeline Stage Constants
// ============================================================================

/**
 * Canonical stage names for the Truvo payment pipeline.
 * Use these constants to ensure consistent stage naming across all components.
 */
export const Stages = {
  // Agent / x402 flow
  AGENT_TASK_QUEUED: "agent.task_queued",
  AGENT_TASK_PROCESSING: "agent.task_processing",
  AGENT_TASK_COMPLETED: "agent.task_completed",
  AGENT_TASK_FAILED: "agent.task_failed",
  AGENT_BATCH_STARTED: "agent.batch_started",
  AGENT_BATCH_COMPLETED: "agent.batch_completed",
  AGENT_MPP_SESSION_OPENED: "agent.mpp_session_opened",

  // x402 payment flow
  X402_REQUEST_INITIATED: "x402.request_initiated",
  X402_CHALLENGE_RECEIVED: "x402.challenge_received",
  X402_PAYMENT_CONSTRUCTED: "x402.payment_constructed",
  X402_PAYMENT_SUBMITTED: "x402.payment_submitted",
  X402_PAYMENT_SETTLED: "x402.payment_settled",
  X402_PAYMENT_FAILED: "x402.payment_failed",
  X402_RETRY: "x402.retry",

  // MPP session flow
  MPP_SESSION_OPENED: "mpp.session_opened",
  MPP_COMMITMENT_SIGNED: "mpp.commitment_signed",
  MPP_COMMITMENT_VERIFIED: "mpp.commitment_verified",
  MPP_PAYMENT_SERVED: "mpp.payment_served",
  MPP_CHANNEL_CLOSED: "mpp.channel_closed",

  // Escrow / contract flow
  ESCROW_CREATION_INITIATED: "escrow.creation_initiated",
  ESCROW_CREATED: "escrow.created",
  ESCROW_CREATION_FAILED: "escrow.creation_failed",

  // Worker confirmation
  WORKER_CONFIRMATION_INITIATED: "worker.confirmation_initiated",
  WORKER_CONFIRMED: "worker.confirmed",
  WORKER_CONFIRMATION_FAILED: "worker.confirmation_failed",

  // Funds release
  RELEASE_INITIATED: "release.initiated",
  RELEASE_COMPLETED: "release.completed",
  RELEASE_FAILED: "release.failed",

  // Anchor withdrawal
  WITHDRAWAL_INITIATED: "withdrawal.initiated",
  WITHDRAWAL_KYC_SUBMITTED: "withdrawal.kyc_submitted",
  WITHDRAWAL_PENDING: "withdrawal.pending",
  WITHDRAWAL_COMPLETED: "withdrawal.completed",
  WITHDRAWAL_FAILED: "withdrawal.failed",

  // Refund
  REFUND_INITIATED: "refund.initiated",
  REFUND_COMPLETED: "refund.completed",
  REFUND_FAILED: "refund.failed",

  // Dispute
  DISPUTE_RAISED: "dispute.raised",
  DISPUTE_RESOLVED: "dispute.resolved",
  DISPUTE_FAILED: "dispute.failed",
} as const;
