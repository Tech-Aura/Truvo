/**
 * SDK Integration Tests — Stellar Testnet
 *
 * These are **integration tests** that exercise the Truvo SDK against the
 * *deployed* escrow contract on Stellar Testnet. They are distinct from
 * the contract's own unit tests (see contracts/src/lib.rs for the Rust-level
 * tests in Sessions 1–2).
 *
 * Requirements:
 *   - Active internet connection (Stellar Testnet RPC + Friendbot).
 *   - The testnet contract at the address configured below must be deployed.
 *   - Each test run creates fresh funded accounts via Friendbot, so no
 *     persistent test fixtures are required.
 *
 * Run:
 *   cd sdk && npm test
 *
 * These tests may take a few minutes due to testnet ledger confirmation
 * delays and Friendbot funding. A generous timeout (120 s) is configured
 * in jest.config.js.
 */

import {
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  Contract,
  Address,
  Networks,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import { TruvoClient, TaskStatus } from "../src";

// ============================================================================
// Configuration
// ============================================================================

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const CONTRACT_ID =
  "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF";

// ============================================================================
// Helpers
// ============================================================================

/** Generate a random 32-byte hex string for use as a task ID or proof hash. */
function randomHex32(): string {
  return Buffer.from(require("crypto").randomBytes(32)).toString("hex");
}

/** Generate a random Keypair. */
function randomKeypair(): Keypair {
  return Keypair.random();
}

/**
 * Fund an account on Stellar Testnet via the Friendbot faucet.
 * Retries once on transient network errors.
 */
async function fundAccount(publicKey: string): Promise<void> {
  const url = `https://friendbot.stellar.org?addr=${publicKey}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
      // Friendbot may return 400 if already funded — treat as success.
      if (resp.status === 400) return;
    } catch {
      // Transient network error — retry after a short delay.
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  // If all retries failed, throw so the test fails clearly.
  throw new Error(`Failed to fund account ${publicKey} via Friendbot`);
}

/**
 * Get the current ledger close time from the testnet network. This is the
 * authoritative time used by the contract for deadline comparisons.
 */
async function getLedgerCloseTime(server: SorobanRpc.Server): Promise<number> {
  const ledger = await server.getLatestLedger();
  // The API response includes closeTime but the SDK type definition omits it.
  return Number((ledger as any).closeTime);
}

/**
 * Build, sign, and submit a raw Soroban transaction that invokes a contract
 * function. This is used for calls not directly exposed by the SDK, such as
 * `initialize`.
 *
 * @param server   - Soroban RPC server instance.
 * @param contractId - Deployed contract ID (C… StrKey).
 * @param secretKey  - Secret key of the signing account.
 * @param fnName     - Contract function name to invoke.
 * @param args       - xdr.ScVal arguments for the function.
 * @returns The transaction hash on success.
 */
async function invokeRaw(
  server: SorobanRpc.Server,
  contractId: string,
  secretKey: string,
  fnName: string,
  args: xdr.ScVal[],
): Promise<string> {
  const keypair = Keypair.fromSecret(secretKey);
  const sourceAccount = await server.getAccount(keypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE })
    .setNetworkPassphrase(NETWORK_PASSPHRASE)
    .setTimeout(30)
    .addOperation(contract.call(fnName, ...args))
    .build();

  const preparedTx = await server.prepareTransaction(tx);
  preparedTx.sign(keypair);

  const sendResult = await server.sendTransaction(preparedTx);
  if (sendResult.status === "ERROR") {
    throw new Error(
      `Transaction submission error: ${sendResult.errorResult?.toString() ?? "unknown"}`,
    );
  }

  // Poll for confirmation.
  const MAX_ATTEMPTS = 30;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = await server.getTransaction(sendResult.hash);
    if (result.status === "SUCCESS") return sendResult.hash;
    if (result.status === "FAILED") {
      throw new Error(
        `Transaction failed on-chain: ${(result as any).resultXdr?.toString() ?? "unknown"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Transaction ${sendResult.hash} was not confirmed after ${MAX_ATTEMPTS} attempts`,
  );
}


// ============================================================================
// Test Suite
// ============================================================================

describe("SDK integration tests — Stellar Testnet", () => {
  const server = new SorobanRpc.Server(RPC_URL);

  // Account keypairs created per test and funded via Friendbot.
  let payerKp: Keypair;
  let workerKp: Keypair;
  let arbitratorKp: Keypair;

  let payerClient: TruvoClient;
  let workerClient: TruvoClient;
  let arbitratorClient: TruvoClient;

  // The testnet ledger timestamp used as the basis for deadline calculations.
  let currentTimestamp: number;

  beforeAll(async () => {
    // 1. Generate fresh keypairs.
    payerKp = randomKeypair();
    workerKp = randomKeypair();
    arbitratorKp = randomKeypair();

    // 2. Fund all three accounts via Friendbot.
    await Promise.all([
      fundAccount(payerKp.publicKey()),
      fundAccount(workerKp.publicKey()),
      fundAccount(arbitratorKp.publicKey()),
    ]);

    // 3. Construct SDK clients for each role.
    payerClient = new TruvoClient({
      rpcUrl: RPC_URL,
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      secretKey: payerKp.secret(),
    });

    workerClient = new TruvoClient({
      rpcUrl: RPC_URL,
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      secretKey: workerKp.secret(),
    });

    arbitratorClient = new TruvoClient({
      rpcUrl: RPC_URL,
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      secretKey: arbitratorKp.secret(),
    });

    // 4. Fetch the current ledger timestamp for deadline calculations.
    currentTimestamp = await getLedgerCloseTime(server);

    console.log(`\n  Accounts funded:`);
    console.log(`    Payer:       ${payerKp.publicKey()}`);
    console.log(`    Worker:      ${workerKp.publicKey()}`);
    console.log(`    Arbitrator:  ${arbitratorKp.publicKey()}`);
    console.log(`    Ledger time: ${currentTimestamp}\n`);
  }, 60_000);

  // ------------------------------------------------------------------
  // Test 1: Full lifecycle — createEscrow → confirmTask → releaseFunds
  // ------------------------------------------------------------------

  it("createEscrow → confirmTask → releaseFunds (happy path)", async () => {
    const taskId = randomHex32();
    const proofHash = randomHex32();
    const deadline = currentTimestamp + 600; // 10 minutes from now
    const amount = "10000000"; // 1 XLM (in stroops-like i128)

    // Step 1: createEscrow (payer signs)
    const createResult = await payerClient.createEscrow({
      payer: payerKp.publicKey(),
      worker: workerKp.publicKey(),
      amount,
      taskId,
      deadline,
    });

    expect(createResult.task.status).toBe(TaskStatus.Created);
    expect(createResult.task.payer).toBe(payerKp.publicKey());
    expect(createResult.task.worker).toBe(workerKp.publicKey());
    expect(createResult.task.amount).toBe(amount);
    expect(createResult.task.deadline).toBe(deadline);

    // Step 2: confirmTask (worker signs)
    const confirmResult = await workerClient.confirmTask({
      taskId,
      proofHash,
    });

    expect(confirmResult.task.status).toBe(TaskStatus.Confirmed);
    expect(confirmResult.task.proof_hash).toBe(proofHash);

    // Step 3: releaseFunds (any funded account)
    const releaseResult = await payerClient.releaseFunds({ taskId });

    expect(releaseResult.task.status).toBe(TaskStatus.Released);
    expect(releaseResult.worker).toBe(workerKp.publicKey());
    expect(releaseResult.amount).toBe(amount);
  });

  // ------------------------------------------------------------------
  // Test 2: Refund — createEscrow → refundExpired (deliberately short deadline)
  // ------------------------------------------------------------------

  it("createEscrow → refundExpired (deliberately short deadline)", async () => {
    const taskId = randomHex32();
    // Set the deadline to 1 — effectively always in the past on testnet.
    const deadline = 1;
    const amount = "5000000"; // 0.5 XLM equivalent

    // Step 1: createEscrow with an already-expired deadline.
    const createResult = await payerClient.createEscrow({
      payer: payerKp.publicKey(),
      worker: workerKp.publicKey(),
      amount,
      taskId,
      deadline,
    });

    expect(createResult.task.status).toBe(TaskStatus.Created);

    // Step 2: refundExpired — should succeed because deadline has passed.
    const refundResult = await payerClient.refundExpired({ taskId });

    expect(refundResult.task.status).toBe(TaskStatus.Refunded);
    expect(refundResult.payer).toBe(payerKp.publicKey());
    expect(refundResult.amount).toBe(amount);
  });

  // ------------------------------------------------------------------
  // Test 3: Dispute — createEscrow → confirmTask → raiseDispute → resolveDispute
  // ------------------------------------------------------------------

  it("createEscrow → confirmTask → raiseDispute → resolveDispute", async () => {
    const taskId = randomHex32();
    const proofHash = randomHex32();
    const deadline = currentTimestamp + 600;
    const amount = "8000000"; // 0.8 XLM equivalent

    // First, ensure the contract is initialized with our test arbitrator.
    // This is a no-op if the contract is already initialized (will panic
    // and we catch it gracefully).
    try {
      await invokeRaw(server, CONTRACT_ID, arbitratorKp.secret(), "initialize", [
        new Address(arbitratorKp.publicKey()).toScVal(),
        new Address(arbitratorKp.publicKey()).toScVal(),
      ]);
    } catch {
      // Contract may already be initialized — that's fine.
    }

    // Step 1: createEscrow (payer signs)
    const createResult = await payerClient.createEscrow({
      payer: payerKp.publicKey(),
      worker: workerKp.publicKey(),
      amount,
      taskId,
      deadline,
    });

    expect(createResult.task.status).toBe(TaskStatus.Created);

    // Step 2: confirmTask (worker signs)
    const confirmResult = await workerClient.confirmTask({
      taskId,
      proofHash,
    });

    expect(confirmResult.task.status).toBe(TaskStatus.Confirmed);

    // Step 3: raiseDispute (worker raises)
    const disputeResult = await workerClient.raiseDispute({
      taskId,
      role: "worker",
    });

    expect(disputeResult.task.status).toBe(TaskStatus.Disputed);

    // Step 4: resolveDispute (arbitrator resolves in favor of worker)
    const resolveResult = await arbitratorClient.resolveDispute({
      taskId,
      outcome: "Worker",
    });

    expect(resolveResult.task.status).toBe(TaskStatus.Released);
  });
});
