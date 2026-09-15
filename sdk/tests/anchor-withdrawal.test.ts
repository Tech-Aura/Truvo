/**
 * Anchor Withdrawal Integration Tests — Stellar Testnet
 *
 * These are **integration tests** that exercise the full escrow-to-withdrawal
 * flow against the *deployed* escrow contract AND the Stellar testnet Anchor
 * (`testanchor.stellar.org`). They are distinct from the contract's own unit
 * tests (see contracts/src/lib.rs for the Rust-level tests in Sessions 1–2).
 *
 * Requirements:
 *   - Active internet connection (Stellar Testnet RPC + Friendbot + Anchor).
 *   - The testnet contract at the address configured below must be deployed.
 *   - Each test run creates fresh funded accounts via Friendbot, so no
 *     persistent test fixtures are required.
 *
 * Run:
 *   cd sdk && npx jest anchor-withdrawal
 *
 * These tests may take several minutes due to testnet ledger confirmation
 * delays, Friendbot funding, and Anchor API round-trips. A generous timeout
 * (120 s per test) is configured in jest.config.js.
 */

import {
  Keypair,
  rpc as SorobanRpc,
  Networks,
} from "@stellar/stellar-sdk";
import { TruvoClient, AnchorClient, TaskStatus } from "../src";

// ============================================================================
// Configuration
// ============================================================================

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const CONTRACT_ID =
  "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF";

// Anchor endpoints (see /docs/anchor-integration.md)
const ANCHOR_AUTH_URL = "https://testanchor.stellar.org/auth";
const ANCHOR_SEP24_URL = "https://testanchor.stellar.org/sep24";
const ANCHOR_SEP12_URL = "https://testanchor.stellar.org/sep12";

// ============================================================================
// Helpers
// ============================================================================

function randomHex32(): string {
  return Buffer.from(require("crypto").randomBytes(32)).toString("hex");
}

function randomKeypair(): Keypair {
  return Keypair.random();
}

async function fundAccount(publicKey: string): Promise<void> {
  const url = `https://friendbot.stellar.org?addr=${publicKey}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
      if (resp.status === 400) return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Failed to fund account ${publicKey} via Friendbot`);
}

async function getLedgerCloseTime(server: SorobanRpc.Server): Promise<number> {
  const ledger = await server.getLatestLedger();
  return Number((ledger as any).closeTime);
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Escrow-to-Withdrawal Integration — Stellar Testnet + Anchor", () => {
  const server = new SorobanRpc.Server(RPC_URL);

  let payerKp: Keypair;
  let workerKp: Keypair;

  let payerClient: TruvoClient;
  let workerClient: TruvoClient;
  let anchorClient: AnchorClient;

  let currentTimestamp: number;

  beforeAll(async () => {
    // 1. Generate fresh keypairs for payer and worker.
    payerKp = randomKeypair();
    workerKp = randomKeypair();

    // 2. Fund both accounts via Friendbot.
    await Promise.all([
      fundAccount(payerKp.publicKey()),
      fundAccount(workerKp.publicKey()),
    ]);

    // 3. Construct SDK clients.
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

    // 4. Construct Anchor client for withdrawal flows.
    anchorClient = new AnchorClient({
      authUrl: ANCHOR_AUTH_URL,
      sep24Url: ANCHOR_SEP24_URL,
      sep12Url: ANCHOR_SEP12_URL,
    });

    // 5. Fetch the current ledger timestamp for deadline calculations.
    currentTimestamp = await getLedgerCloseTime(server);

    console.log(`\n  Accounts funded:`);
    console.log(`    Payer:  ${payerKp.publicKey()}`);
    console.log(`    Worker: ${workerKp.publicKey()}`);
    console.log(`    Ledger time: ${currentTimestamp}\n`);
  }, 60_000);

  // ------------------------------------------------------------------
  // Test 1: Full escrow → withdrawal lifecycle
  // ------------------------------------------------------------------

  it("createEscrow → confirmTask → releaseFunds → initiateWithdrawal → getWithdrawalStatus", async () => {
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
    expect(createResult.task.worker).toBe(workerKp.publicKey());

    // Step 2: confirmTask (worker signs)
    const confirmResult = await workerClient.confirmTask({
      taskId,
      proofHash,
    });

    expect(confirmResult.task.status).toBe(TaskStatus.Confirmed);

    // Step 3: releaseFunds (any funded account)
    const releaseResult = await payerClient.releaseFunds({ taskId });

    expect(releaseResult.task.status).toBe(TaskStatus.Released);
    expect(releaseResult.worker).toBe(workerKp.publicKey());
    expect(releaseResult.amount).toBe(amount);

    // Step 4: Authenticate with the anchor using the worker's keypair
    // (the worker is the one withdrawing).
    const jwt = await anchorClient.authenticate(workerKp);
    expect(typeof jwt).toBe("string");
    expect(jwt.length).toBeGreaterThan(0);

    // Step 5: Initiate an interactive SEP-24 withdrawal
    const withdrawal = await anchorClient.initiateWithdrawal(
      "native", // XLM
      "1",      // 1 XLM (test anchor allows 1–10 per transaction)
      workerKp.publicKey(),
      { memo: `truvo-task-${taskId}` },
    );

    // Assert: interactive URL and transaction ID are returned.
    expect(typeof withdrawal.transactionId).toBe("string");
    expect(withdrawal.transactionId.length).toBeGreaterThan(0);
    expect(typeof withdrawal.interactiveUrl).toBe("string");
    expect(withdrawal.interactiveUrl).toMatch(/^https?:\/\//);
    expect(typeof withdrawal.type).toBe("string");

    console.log(`    Withdrawal initiated:`);
    console.log(`      transactionId: ${withdrawal.transactionId}`);
    console.log(`      interactiveUrl: ${withdrawal.interactiveUrl}`);
    console.log(`      type: ${withdrawal.type}`);

    // Step 6: Track the withdrawal via getWithdrawalStatus
    const status = await anchorClient.getWithdrawalStatus(
      withdrawal.transactionId,
    );

    expect(typeof status.id).toBe("string");
    expect(status.id).toBe(withdrawal.transactionId);
    expect(typeof status.status).toBe("string");

    // The initial status should be non-terminal (the worker hasn't
    // completed the interactive flow yet, so it should still be
    // "incomplete" or "pending_user_transfer_start").
    const terminalStatuses = [
      "completed",
      "refunded",
      "expired",
      "error",
    ];
    expect(terminalStatuses).not.toContain(status.status);

    console.log(`      initial status: ${status.status}`);
  });

  // ------------------------------------------------------------------
  // Test 2: KYC status check for the worker
  // ------------------------------------------------------------------

  it("getCustomerKycStatus returns a valid KYC state", async () => {
    // Ensure the anchor client is authenticated (re-use cached token
    // from the previous test, or re-authenticate if needed).
    await anchorClient.ensureAuthenticated(workerKp);

    const kycStatus = await anchorClient.getCustomerKycStatus(
      workerKp.publicKey(),
    );

    // Assert: the KYC state is one of the known values.
    const knownStates = [
      "kyc_required",
      "kyc_pending",
      "kyc_approved",
      "kyc_rejected",
      "unknown",
    ];
    expect(knownStates).toContain(kycStatus.state);

    expect(typeof kycStatus.rawStatus).toBe("string");
    expect(typeof kycStatus.approved).toBe("boolean");
    expect(typeof kycStatus.blockingWithdrawal).toBe("boolean");

    console.log(`\n    KYC status for worker:`);
    console.log(`      state: ${kycStatus.state}`);
    console.log(`      rawStatus: ${kycStatus.rawStatus}`);
    console.log(`      approved: ${kycStatus.approved}`);
  });

  // ------------------------------------------------------------------
  // Test 3: Available balance check after release
  // ------------------------------------------------------------------

  it("getAvailableBalance returns the worker's spendable balance", async () => {
    const balance = await anchorClient.getAvailableBalance(
      workerKp.publicKey(),
      "XLM",
    );

    expect(typeof balance.available).toBe("string");
    expect(typeof balance.found).toBe("boolean");
    expect(balance.found).toBe(true);
    // The worker should have received XLM from the previous test's
    // releaseFunds call, plus the initial Friendbot funding.
    expect(Number(balance.available)).toBeGreaterThan(0);

    console.log(`\n    Worker balance:`);
    console.log(`      available: ${balance.available} XLM`);
  });
});
