/**
 * Truvo SDK Client
 *
 * TypeScript client for interacting with the Truvo escrow smart contract
 * deployed on Stellar Testnet.
 */

import {
  Contract,
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  xdr,
  Address,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { Task, TaskStatus, DisputeOutcome } from "./types";

type ApiGetTxStatus = typeof SorobanRpc.Api.GetTransactionStatus;
type ApiFailedTx = SorobanRpc.Api.GetFailedTransactionResponse;

// ============================================================================
// Types
// ============================================================================

/** Configuration for the TruvoClient. */
export interface TruvoClientConfig {
  /** Soroban RPC server URL (e.g. "https://soroban-testnet.stellar.org"). */
  rpcUrl: string;
  /** Deployed contract ID (C… StrKey). */
  contractId: string;
  /** Network passphrase (e.g. Networks.TESTNET). */
  networkPassphrase: string;
  /** Secret key of the signing account. */
  secretKey: string;
}

/** Input for {@link TruvoClient.createEscrow}. */
export interface CreateEscrowInput {
  /** Public key (G…) of the payer who funds and authorises the escrow. */
  payer: string;
  /** Public key (G…) of the worker assigned to the task. */
  worker: string;
  /** Escrow amount as a decimal string (i128 on-chain). */
  amount: string;
  /** 32-byte task identifier as a 64-character hex string. */
  taskId: string;
  /** Ledger timestamp (u64) after which the task may be refunded. */
  deadline: number;
}

/** Typed result returned by most SDK methods. */
export type TruvoResult =
  | { ok: true; task: Task; txHash: string }
  | { ok: false; error: string; txHash?: string };

// ============================================================================
// XDR helpers
// ============================================================================

/** Status code → TaskStatus mapping, matching the Rust contract constants. */
const STATUS_MAP: Record<number, TaskStatus> = {
  0: TaskStatus.Created,
  1: TaskStatus.Confirmed,
  2: TaskStatus.Released,
  3: TaskStatus.Refunded,
  4: TaskStatus.Disputed,
};

/** Convert a decimal string (i128) to an xdr.ScVal. */
export function i128ToScVal(value: string): xdr.ScVal {
  const n = BigInt(value);
  const lo = n & BigInt("0xFFFFFFFFFFFFFFFF");
  const hi = n >> BigInt(64);
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({
      lo: xdr.Uint64.fromString(lo.toString()),
      hi: xdr.Int64.fromString(hi.toString()),
    }),
  );
}

/** Convert a u64 value to an xdr.ScVal. */
export function u64ToScVal(value: number | bigint): xdr.ScVal {
  return xdr.ScVal.scvU64(xdr.Uint64.fromString(value.toString()));
}

/** Convert a 32-byte hex string to an xdr.ScVal (bytes). */
export function hex32ToScVal(hex: string): xdr.ScVal {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(`Expected 32-byte hex string, got ${buf.length} bytes`);
  }
  return xdr.ScVal.scvBytes(buf);
}

/** Extract an address string from an xdr.ScVal. */
function scValToAddress(scVal: xdr.ScVal): string {
  return Address.fromScVal(scVal).toString();
}

/** Extract an i128 string from an xdr.ScVal. */
function scValToI128(scVal: xdr.ScVal): string {
  const parts = scVal.i128();
  const lo = BigInt(parts.lo().toString());
  const hi = BigInt(parts.hi().toString());
  return ((hi << BigInt(64)) + lo).toString();
}

/** Extract a u64 as a number from an xdr.ScVal. */
function scValToU64(scVal: xdr.ScVal): number {
  return Number(scVal.u64().toString());
}

/** Extract bytes as a hex string from an xdr.ScVal. */
function scValToHex(scVal: xdr.ScVal): string {
  return scVal.bytes().toString("hex");
}

/**
 * Decode a `TaskData` value (soroban `#[contracttype]` struct serialised as
 * a 6-element `ScVal.scvVec`) from the contract's persistent storage into
 * the SDK's {@link Task} type.
 *
 * Field order matches the Rust `TaskData` struct:
 * `[payer, worker, amount, deadline, status, proof_hash]`
 */
function decodeTaskData(scVal: xdr.ScVal, taskId: string): Task {
  const vec = scVal.vec();
  if (!vec || vec.length < 6) {
    throw new Error(
      `Invalid TaskData: expected vector with 6 fields, got ${vec?.length ?? 0}`,
    );
  }

  return {
    task_id: taskId,
    payer: scValToAddress(vec[0]),
    worker: scValToAddress(vec[1]),
    amount: scValToI128(vec[2]),
    deadline: scValToU64(vec[3]),
    status: STATUS_MAP[vec[4].u32()] ?? (vec[4].u32() as TaskStatus),
    proof_hash: scValToHex(vec[5]),
  };
}

/**
 * Extract the first contract event whose topic matches `topicName` from
 * the Soroban transaction metadata. Returns the event data `ScVal`, or
 * `null` if no matching event is found.
 */
function findContractEvent(
  meta: xdr.TransactionMeta,
  topicName: string,
): xdr.ScVal | null {
  const v3 = meta.v3();
  if (!v3) return null;

  const sorobanMeta = v3.sorobanMeta();
  if (!sorobanMeta) return null;

  const events = sorobanMeta.events();
  for (const event of events) {
    const body = event.body().v0();
    if (!body) continue;

    const topics = body.topics();
    if (
      topics.length > 0 &&
      topics[0].switch().name === "scvSymbol" &&
      topics[0].sym().toString() === topicName
    ) {
      return body.data();
    }
  }

  return null;
}

// ============================================================================
// TruvoClient
// ============================================================================

/**
 * TypeScript client for the Truvo escrow smart contract.
 *
 * Wraps the Soroban RPC interface and provides typed methods for each
 * contract function: `createEscrow`, `confirmTask`, `releaseFunds`,
 * `refundExpired`, `raiseDispute`, `resolveDispute`.
 *
 * Each method builds a Soroban transaction, signs it with the configured
 * keypair, submits it to testnet, and returns a typed result.
 *
 * **Authorization:** Soroban `require_auth` means the transaction signer
 * must match the authorizing address for the called function. Construct
 * the client with the appropriate secret key for each role:
 *
 * - `createEscrow` → payer's key (payer must sign)
 * - `confirmTask` → worker's key (worker must sign)
 * - `releaseFunds` / `refundExpired` → any funded key (no auth required)
 * - `raiseDispute` → payer's or worker's key (caller must sign)
 * - `resolveDispute` → arbitrator's key (arbitrator must sign)
 */
export class TruvoClient {
  private readonly server: SorobanRpc.Server;
  private readonly contractId: string;
  private readonly networkPassphrase: string;
  private readonly keypair: Keypair;

  constructor(config: TruvoClientConfig) {
    this.server = new SorobanRpc.Server(config.rpcUrl);
    this.contractId = config.contractId;
    this.networkPassphrase = config.networkPassphrase;
    this.keypair = Keypair.fromSecret(config.secretKey);
  }

  /** The public key (G…) of the configured signing account. */
  get publicKey(): string {
    return this.keypair.publicKey();
  }

  // ------------------------------------------------------------------
  // createEscrow
  // ------------------------------------------------------------------

  /**
   * Create a new escrowed task on the Truvo contract.
   *
   * Wraps the contract's `create_task` function. The transaction must be
   * signed by the **payer** (who authorises the call via Soroban
   * `require_auth`).
   *
   * @param input - The escrow parameters (payer, worker, amount, taskId, deadline).
   * @returns A typed result containing the created {@link Task} on success,
   *   or a descriptive error string on failure.
   */
  async createEscrow(input: CreateEscrowInput): Promise<TruvoResult> {
    try {
      const contract = new Contract(this.contractId);
      const sourceAccount = await this.server.getAccount(
        this.keypair.publicKey(),
      );

      const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE })
        .setNetworkPassphrase(this.networkPassphrase)
        .setTimeout(30)
        .addOperation(
          contract.call(
            "create_task",
            new Address(input.payer).toScVal(),
            new Address(input.worker).toScVal(),
            i128ToScVal(input.amount),
            hex32ToScVal(input.taskId),
            u64ToScVal(input.deadline),
          ),
        )
        .build();

      const preparedTx = await this.server.prepareTransaction(tx);
      preparedTx.sign(this.keypair);

      const sendResult = await this.server.sendTransaction(preparedTx);

      if (sendResult.status === "ERROR") {
        return {
          ok: false,
          error:
            sendResult.errorResult?.toString() ?? "Transaction submission error",
          txHash: sendResult.hash,
        };
      }

      await this.waitForTransaction(sendResult.hash);

      // Read the newly created task from contract storage so we return
      // the authoritative on-chain state.
      const task = await this.readTask(input.taskId);

      return { ok: true, task, txHash: sendResult.hash };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Poll `getTransaction` until the transaction is confirmed or fails.
   * Throws on failure or timeout.
   */
  private async waitForTransaction(hash: string): Promise<void> {
    const MAX_ATTEMPTS = 30;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const result = await this.server.getTransaction(hash);

      if (result.status === "SUCCESS") {
        return;
      }

      if (result.status === "FAILED") {
        const errResult = (result as ApiFailedTx).resultXdr;
        throw new Error(
          `Transaction failed on-chain: ${errResult?.toString() ?? "unknown"}`,
        );
      }

      // NOT_FOUND – still pending; wait and retry.
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
      `Transaction ${hash} was not confirmed after ${MAX_ATTEMPTS} attempts`,
    );
  }

  /**
   * Read the full `TaskData` from the contract's persistent storage and
   * decode it into a {@link Task}.
   *
   * The storage key mirrors the contract's `task_key` function:
   * `Bytes::from_array(env, &task_id.to_array())` → `ScVal.scvBytes(32-byte buffer)`.
   */
  private async readTask(taskId: string): Promise<Task> {
    const key = xdr.ScVal.scvBytes(Buffer.from(taskId, "hex"));
    const entry = await this.server.getContractData(
      this.contractId,
      key,
      SorobanRpc.Durability.Persistent,
    );
    const contractData = entry.val.contractData();
    return decodeTaskData(contractData.val(), taskId);
  }
}
