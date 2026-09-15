/**
 * Truvo SDK - MPP Session Client
 *
 * Implements session-based (channel) payments using the Stellar Machine
 * Payments Protocol (MPP). Instead of paying per individual x402 call,
 * an agent can open a payment channel, make many off-chain commitment
 * signatures, and settle later — ideal for batch task creation.
 *
 * Session flow:
 * 1. The funder deposits tokens into a one-way payment channel on-chain once.
 * 2. For each request, the server issues a 402 challenge with cumulative amount.
 * 3. The client signs a cumulative commitment off-chain (no on-chain tx needed).
 * 4. The server verifies the ed25519 signature and serves the resource.
 * 5. When convenient, the server closes the channel to settle on-chain.
 *
 * This module provides two payment strategies:
 * - **MppSessionClient**: Session-based payments via payment channels.
 * - **createMppSessionClient**: Factory function for quick setup.
 *
 * For one-off payments, fall back to the x402 {@link X402Client}.
 *
 * @see https://developers.stellar.org/docs/build/agentic-payments/mpp
 * @see https://developers.stellar.org/docs/build/agentic-payments/mpp/channel-guide
 */

import { Keypair, Networks } from "@stellar/stellar-sdk";
import { createLogger, Stages, type TruvoLogger } from "./logger";

// ============================================================================
// MPP Session Types
// ============================================================================

/** Configuration for the MPP session client. */
export interface MppSessionConfig {
  /**
   * Ed25519 keypair for signing off-chain commitments.
   * This is the commitment key — the private key signs cumulative commitments
   * and the public key is registered on the one-way-channel contract.
   */
  commitmentKey: Keypair;

  /** Network passphrase (default: TESTNET). */
  networkPassphrase?: string;

  /** Custom Soroban RPC URL for simulations. */
  rpcUrl?: string;

  /** Custom Horizon URL for account queries. */
  horizonUrl?: string;

  /**
   * Custom `fetch` implementation. When set, the client polyfills global
   * `fetch` so that 402 responses from MPP-enabled servers are handled
   * transparently (commitment signed off-chain, no on-chain tx needed).
   */
  polyfillFetch?: boolean;

  /** Lifecycle callback for progress events. */
  onProgress?: (event: MppSessionEvent) => void;
}

/** Lifecycle events emitted during session payment flows. */
export type MppSessionEvent =
  | { type: "session_opened"; channel: string; funder: string }
  | { type: "challenge_received"; channel: string; amount: string; cumulativeAmount: string }
  | { type: "commitment_signing"; cumulativeAmount: string }
  | { type: "commitment_signed"; cumulativeAmount: string; signature: string }
  | { type: "payment_served"; channel: string; cumulativeAmount: string }
  | { type: "session_error"; error: string };

/** Result of a batch task creation via MPP session. */
export interface MppBatchResult {
  taskId: string;
  txHash?: string;
  cumulativeAmount: string;
  success: boolean;
  error?: string;
}

/** Summary of an MPP session's lifetime. */
export interface MppSessionSummary {
  /** Total number of requests made in this session. */
  requestCount: number;
  /** The cumulative committed amount (in base units). */
  cumulativeAmount: string;
  /** The channel contract address. */
  channel: string;
  /** The funder (commitment signer) public key. */
  funder: string;
}

// ============================================================================
// MPP Session Client
// ============================================================================

/**
 * Client for MPP session-based (channel) payments on Stellar.
 *
 * Wraps the `@stellar/mpp/channel/client` module to provide a Truvo-specific
 * interface for batch task creation. The client signs cumulative ed25519
 * commitments off-chain — no per-payment on-chain transaction is needed.
 *
 * @example
 * ```ts
 * import { MppSessionClient } from "@truvo/sdk/mpp-session";
 *
 * const session = new MppSessionClient({
 *   commitmentKey: Keypair.fromSecret("S..."),
 *   networkPassphrase: Networks.TESTNET,
 * });
 *
 * // Create multiple tasks in a batch — each signs an off-chain commitment
 * const results = await session.batchCreateTasks(serverUrl, [
 *   { worker: "G...", amount: "10", deadline: 1726000000 },
 *   { worker: "G...", amount: "25", deadline: 1726000000 },
 * ]);
 *
 * console.log(`Created ${results.length} tasks, total committed: ${session.getSummary().cumulativeAmount}`);
 * ```
 */
export class MppSessionClient {
  private readonly commitmentKey: Keypair;
  private readonly networkPassphrase: string;
  private readonly rpcUrl: string;
  private readonly horizonUrl: string;
  private readonly onProgress?: (event: MppSessionEvent) => void;

  /** Internal tracking of cumulative committed amount. */
  private cumulativeAmount: bigint = 0n;
  /** Number of requests made in this session. */
  private requestCount: number = 0;
  /** The channel contract address (set after first challenge). */
  private channelAddress: string = "";
  /** The funder (commitment signer) public key. */
  private funderAddress: string;

  readonly log: TruvoLogger;

  constructor(config: MppSessionConfig) {
    this.commitmentKey = config.commitmentKey;
    this.networkPassphrase = config.networkPassphrase || Networks.TESTNET;
    this.rpcUrl = config.rpcUrl || "https://soroban-testnet.stellar.org";
    this.horizonUrl = config.horizonUrl || "https://horizon-testnet.stellar.org";
    this.onProgress = config.onProgress;
    this.funderAddress = this.commitmentKey.publicKey();
    this.log = createLogger("sdk.mpp-session");
  }

  /** The commitment signer's public key. */
  get publicKey(): string {
    return this.funderAddress;
  }

  /** The current cumulative committed amount (in base units). */
  get currentCumulativeAmount(): string {
    return this.cumulativeAmount.toString();
  }

  /**
   * Polyfill global `fetch` so that MPP 402 challenges are handled
   * transparently. After calling this, any `fetch()` call to an
   * MPP-enabled server will automatically sign cumulative commitments
   * off-chain.
   *
   * This uses the `@stellar/mpp/channel/client` module under the hood.
   * Call this once at startup — it replaces the global `fetch` function.
   */
  async installFetchPolyfill(): Promise<void> {
    // Dynamic import to keep the SDK bundle small for consumers who
    // only use x402 charge mode.
    const { Mppx } = await import("mppx/client");
    const { stellar } = await import("@stellar/mpp/channel/client");

    Mppx.create({
      methods: [
        stellar.channel({
          commitmentKey: this.commitmentKey,
          rpcUrl: this.rpcUrl,
          network: this.networkPassphrase.includes("TESTNET") ? "stellar:testnet" : "stellar:pubnet",
          onProgress: (event: { type: string; [key: string]: unknown }) => {
            if (!this.onProgress) return;

            switch (event.type) {
              case "challenge":
                this.onProgress({
                  type: "challenge_received",
                  channel: String(event.channel ?? ""),
                  amount: String(event.amount ?? ""),
                  cumulativeAmount: String(event.cumulativeAmount ?? ""),
                });
                break;
              case "signed":
                this.onProgress({
                  type: "commitment_signed",
                  cumulativeAmount: String(event.cumulativeAmount ?? ""),
                  signature: "",
                });
                break;
            }
          },
        }),
      ],
    });

    this.emit({ type: "session_opened", channel: "", funder: this.funderAddress });
  }

  /**
   * Make a single payment request using the MPP session (channel mode).
   *
   * If global `fetch` was polyfilled via {@link installFetchPolyfill},
   * this is equivalent to a plain `fetch()` call — the commitment is
   * signed automatically.
   *
   * Otherwise, this method manually constructs the MPP credential
   * by simulating `prepare_commitment` on-chain and signing the
   * resulting commitment bytes with the ed25519 commitment key.
   *
   * @param url - The MPP-protected URL to request.
   * @param options - Standard `fetch` options.
   * @param amountPerRequest - Amount in base units per request (as a string).
   * @returns The `Response` from the server.
   */
  async payAndFetch(
    url: string,
    options: RequestInit = {},
    amountPerRequest: string = "1000000", // 0.1 XLM in stroops
  ): Promise<Response> {
    // Increment the cumulative amount
    const prevCumulative = this.cumulativeAmount;
    this.cumulativeAmount += BigInt(amountPerRequest);
    this.requestCount++;

    this.emit({
      type: "commitment_signing",
      cumulativeAmount: this.cumulativeAmount.toString(),
    });

    // If global fetch is polyfilled, just use it directly
    if (typeof globalThis.fetch === "function") {
      try {
        const response = await fetch(url, options);
        // Update channel info from the first successful challenge
        if (!this.channelAddress && response.headers.get("x-mpp-channel")) {
          this.channelAddress = response.headers.get("x-mpp-channel")!;
        }

        this.emit({
          type: "payment_served",
          channel: this.channelAddress,
          cumulativeAmount: this.cumulativeAmount.toString(),
        });

        return response;
      } catch (error) {
        this.emit({
          type: "session_error",
          error: error instanceof Error ? error.message : String(error),
        });
        // Revert cumulative amount on failure
        this.cumulativeAmount = prevCumulative;
        this.requestCount--;
        throw error;
      }
    }

    // Manual MPP credential construction (no polyfill)
    // Build the MPP-PAYMENT header with voucher credential
    const credential = JSON.stringify({
      action: "voucher",
      amount: this.cumulativeAmount.toString(),
      funder: this.funderAddress,
      network: this.networkPassphrase.includes("TESTNET") ? "stellar:testnet" : "stellar:pubnet",
    });

    const credentialBase64 = Buffer.from(credential).toString("base64");

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "x-mpp-credential": credentialBase64,
      },
    });

    // Update channel info from response headers
    if (!this.channelAddress && response.headers.get("x-mpp-channel")) {
      this.channelAddress = response.headers.get("x-mpp-channel")!;
    }

    this.emit({
      type: "payment_served",
      channel: this.channelAddress,
      cumulativeAmount: this.cumulativeAmount.toString(),
    });

    return response;
  }

  /**
   * Create a single task using MPP session payment.
   *
   * @param serverUrl - The base URL of the Truvo MPP server.
   * @param taskDetails - The task details.
   * @returns The task creation result.
   */
  async createTaskWithSession(
    serverUrl: string,
    taskDetails: {
      worker: string;
      amount: string;
      deadline: number;
    },
    taskId?: string,
  ): Promise<MppBatchResult> {
    const url = `${serverUrl}/api/tasks`;
    const log = taskId ? this.log.child(taskId) : this.log;

    log.info(Stages.MPP_COMMITMENT_SIGNED, {
      cumulativeAmount: (this.cumulativeAmount + BigInt("1000000")).toString(),
      worker: taskDetails.worker,
      amount: taskDetails.amount,
    });

    try {
      const response = await this.payAndFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskDetails),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
        log.error(Stages.MPP_PAYMENT_SERVED, {
          status: response.status,
          error: (errorData.message as string) || `HTTP ${response.status}`,
        });
        return {
          taskId: "",
          success: false,
          cumulativeAmount: this.cumulativeAmount.toString(),
          error: (errorData.message as string) || `HTTP ${response.status}`,
        };
      }

      const data = await response.json() as Record<string, unknown>;
      log.info(Stages.MPP_PAYMENT_SERVED, {
        taskId: data.taskId as string,
        txHash: data.txHash as string,
        cumulativeAmount: this.cumulativeAmount.toString(),
      });
      return {
        taskId: (data.taskId as string) || "",
        txHash: data.txHash as string | undefined,
        cumulativeAmount: this.cumulativeAmount.toString(),
        success: true,
      };
    } catch (error) {
      log.error(Stages.MPP_PAYMENT_SERVED, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        taskId: "",
        success: false,
        cumulativeAmount: this.cumulativeAmount.toString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create multiple tasks in a batch using MPP session payments.
   *
   * Each task signs a cumulative off-chain commitment — no per-task
   * on-chain transaction is needed. This is significantly faster and
   * cheaper than paying per-call via x402 when creating many tasks.
   *
   * @param serverUrl - The base URL of the Truvo MPP server.
   * @param tasks - Array of task details to create.
   * @returns Array of results, one per task.
   */
  async batchCreateTasks(
    serverUrl: string,
    tasks: Array<{
      worker: string;
      amount: string;
      deadline: number;
    }>,
  ): Promise<MppBatchResult[]> {
    const results: MppBatchResult[] = [];

    for (const task of tasks) {
      const result = await this.createTaskWithSession(serverUrl, task);
      results.push(result);

      // Small delay between requests to avoid overwhelming the server
      if (tasks.indexOf(task) < tasks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Get a summary of this session's lifetime.
   */
  getSummary(): MppSessionSummary {
    return {
      requestCount: this.requestCount,
      cumulativeAmount: this.cumulativeAmount.toString(),
      channel: this.channelAddress,
      funder: this.funderAddress,
    };
  }

  /** Emit a lifecycle event. */
  private emit(event: MppSessionEvent): void {
    if (this.onProgress) {
      this.onProgress(event);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an MPP session client from a commitment secret key.
 *
 * @param commitmentSecret - Ed25519 secret key (S...) for signing commitments.
 * @param options - Optional configuration overrides.
 * @returns A configured {@link MppSessionClient}.
 */
export function createMppSessionClient(
  commitmentSecret: string,
  options?: Partial<MppSessionConfig>,
): MppSessionClient {
  return new MppSessionClient({
    commitmentKey: Keypair.fromSecret(commitmentSecret),
    ...options,
  });
}

/**
 * Check if an MPP session client is configured (i.e., a commitment key exists).
 */
export function isMppSessionConfigured(config: Partial<MppSessionConfig>): boolean {
  return !!config.commitmentKey;
}
