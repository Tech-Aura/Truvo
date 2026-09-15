/**
 * Truvo SDK context for the frontend.
 *
 * Provides read and write access to the Truvo escrow contract via the SDK.
 * Transaction signing is delegated to Freighter — the secret key is never
 * stored in the browser.
 *
 * Architecture:
 * - Read-only calls (getTask, getWorkerBalance, estimateLocalCurrencyValue)
 *   go directly through the SDK clients.
 * - Write calls (createEscrow, confirmTask, etc.) build Soroban transactions,
 *   have Freighter sign them, and submit to the network.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  Address,
  BASE_FEE,
  xdr,
  Networks,
} from "@stellar/stellar-sdk";
import * as TruvoSDK from "@truvo/sdk";

const { TruvoClient, AnchorClient, i128ToScVal, u64ToScVal, hex32ToScVal } = TruvoSDK;
type Task = TruvoSDK.Task;
type AnchorClientConfig = TruvoSDK.AnchorClientConfig;
type DisputeOutcome = TruvoSDK.DisputeOutcome;
type AvailableBalance = TruvoSDK.AvailableBalance;
type LocalValueEstimate = TruvoSDK.LocalValueEstimate;
import { signTransaction } from "@stellar/freighter-api";
import { useWallet } from "../wallet/WalletContext";

// ============================================================================
// Configuration — in production these come from env vars
// ============================================================================

const TRUVO_RPC_URL = "https://soroban-testnet.stellar.org";
const TRUVO_CONTRACT_ID = "CDRNO7YONZFXBHT5RWO7S3SFLYQGE27GZXON3ZQUI4LFMANM73NHZVRY";
const NETWORK_PASSPHRASE = Networks.TESTNET;

const ANCHOR_CONFIG: AnchorClientConfig = {
  authUrl: "https://testanchor.stellar.org/auth",
  sep24Url: "https://testanchor.stellar.org/sep24",
  sep12Url: "https://testanchor.stellar.org/sep12",
  quoteUrl: "https://testanchor.stellar.org/sep38",
  networkPassphrase: NETWORK_PASSPHRASE,
};

// ============================================================================
// Helpers
// ============================================================================

function getServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(TRUVO_RPC_URL);
}

function getContract(): Contract {
  return new Contract(TRUVO_CONTRACT_ID);
}

/**
 * Wait for a Soroban transaction to be confirmed on-chain.
 * Returns the transaction hash on success, throws on failure/timeout.
 */
async function waitForTx(hash: string): Promise<void> {
  const server = getServer();
  const MAX = 30;
  for (let i = 0; i < MAX; i++) {
    const result = await server.getTransaction(hash);
    if (result.status === "SUCCESS") return;
    if (result.status === "FAILED") {
      throw new Error(`Transaction failed on-chain: ${(result as any).resultXdr?.toString() ?? "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Transaction ${hash} was not confirmed after ${MAX} attempts`);
}

/**
 * Build a Soroban transaction, have Freighter sign it, submit it,
 * and wait for confirmation. Returns the tx hash.
 */
async function buildSignSubmit(
  publicKey: string,
  networkPassphrase: string,
  contractCall: xdr.Operation,
): Promise<string> {
  const server = getServer();
  const sourceAccount = await server.getAccount(publicKey);

  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE })
    .setNetworkPassphrase(networkPassphrase)
    .setTimeout(30)
    .addOperation(contractCall)
    .build();

  const preparedTx = await server.prepareTransaction(tx);
  const { signedTxXdr, error: signError } = await signTransaction(
    preparedTx.toXDR(),
    { networkPassphrase },
  );
  if (signError) {
    throw new Error(`Freighter signing failed: ${signError}`);
  }

  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
  const sendResult = await server.sendTransaction(signedTx);

  if (sendResult.status === "ERROR") {
    throw new Error(`Transaction failed: ${sendResult.errorResult?.toString() ?? "unknown"}`);
  }

  await waitForTx(sendResult.hash);
  return sendResult.hash;
}

// ============================================================================
// Context type
// ============================================================================

export interface TruvoSDKState {
  /** Read a single task from on-chain storage by its 32-byte hex ID. */
  getTask: (taskId: string) => Promise<Task>;
  /** Create an escrowed task (requires Freighter signing as payer). */
  createEscrow: (input: {
    payer: string;
    worker: string;
    amount: string;
    taskId: string;
    deadline: number;
  }) => Promise<{ task: Task; txHash: string }>;
  /** Confirm task completion (requires Freighter signing as worker). */
  confirmTask: (input: {
    taskId: string;
    proofHash: string;
  }) => Promise<{ task: Task; txHash: string }>;
  /** Release funds to the worker (no Soroban auth required). */
  releaseFunds: (input: { taskId: string }) => Promise<{ task: Task; txHash: string; worker: string; amount: string }>;
  /** Refund expired task back to payer (no Soroban auth required). */
  refundExpired: (input: { taskId: string }) => Promise<{ task: Task; txHash: string; payer: string; amount: string }>;
  /** Raise a dispute (requires Freighter signing as payer or worker). */
  raiseDispute: (input: { taskId: string; role: "payer" | "worker" }) => Promise<{ task: Task; txHash: string }>;
  /** Resolve a dispute (requires Freighter signing as arbitrator). */
  resolveDispute: (input: { taskId: string; outcome: DisputeOutcome }) => Promise<{ task: Task; txHash: string }>;
  /** Get the worker's available XLM balance from Horizon. */
  getWorkerBalance: (account: string) => Promise<AvailableBalance>;
  /** Estimate local currency value of an XLM amount via SEP-38 oracle. */
  estimateLocalCurrencyValue: (amount: string, targetCurrency?: string) => Promise<LocalValueEstimate>;
  /** Initiate a SEP-24 interactive withdrawal via the anchor. */
  initiateWithdrawal: (input: { assetCode: string; amount: string; account: string; memo?: string }) => Promise<{ transactionId: string; interactiveUrl: string; type: string }>;
}

const TruvoSDKContext = createContext<TruvoSDKState | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function TruvoSDKProvider({ children }: { children: ReactNode }) {
  const { publicKey, networkPassphrase } = useWallet();
  const passphrase = networkPassphrase || NETWORK_PASSPHRASE;

  // Read-only clients (don't need a real secret key for reads)
  const anchor = useMemo(() => new AnchorClient(ANCHOR_CONFIG), []);

  // TruvoClient used only for readTask (getTask) — reads don't sign
  const truvoReadOnly = useMemo(
    () =>
      new TruvoClient({
        rpcUrl: TRUVO_RPC_URL,
        contractId: TRUVO_CONTRACT_ID,
        networkPassphrase: NETWORK_PASSPHRASE,
        // Dummy key — only used for reads; Freighter signs real txns
        secretKey: "SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      }),
    [],
  );

  // --- Read-only methods ---

  const getTask = useCallback(
    async (taskId: string): Promise<Task> => truvoReadOnly.getTask(taskId),
    [truvoReadOnly],
  );

  const getWorkerBalance = useCallback(
    async (account: string): Promise<AvailableBalance> =>
      anchor.getAvailableBalance(account, "XLM"),
    [anchor],
  );

  const estimateLocalCurrencyValue = useCallback(
    async (amount: string, targetCurrency = "USD"): Promise<LocalValueEstimate> =>
      anchor.estimateLocalValue(amount, "XLM", targetCurrency),
    [anchor],
  );

  // --- Write methods (Freighter-signed) ---

  const createEscrow = useCallback(
    async (input: {
      payer: string;
      worker: string;
      amount: string;
      taskId: string;
      deadline: number;
    }) => {
      if (!publicKey) throw new Error("Wallet not connected");

      const contract = getContract();
      const op = contract.call(
        "create_task",
        new Address(input.payer).toScVal(),
        new Address(input.worker).toScVal(),
        i128ToScVal(input.amount),
        hex32ToScVal(input.taskId),
        u64ToScVal(input.deadline),
      );

      const txHash = await buildSignSubmit(publicKey, passphrase, op);
      const task = await getTask(input.taskId);
      return { task, txHash };
    },
    [publicKey, passphrase, getTask],
  );

  const confirmTask = useCallback(
    async (input: { taskId: string; proofHash: string }) => {
      if (!publicKey) throw new Error("Wallet not connected");

      const contract = getContract();
      const op = contract.call(
        "confirm_completion",
        hex32ToScVal(input.taskId),
        hex32ToScVal(input.proofHash),
      );

      const txHash = await buildSignSubmit(publicKey, passphrase, op);
      const task = await getTask(input.taskId);
      return { task, txHash };
    },
    [publicKey, passphrase, getTask],
  );

  const releaseFunds = useCallback(
    async (input: { taskId: string }) => {
      if (!publicKey) throw new Error("Wallet not connected");

      const contract = getContract();
      const op = contract.call("release_funds", hex32ToScVal(input.taskId));

      const txHash = await buildSignSubmit(publicKey, passphrase, op);
      const task = await getTask(input.taskId);
      return { task, txHash, worker: task.worker, amount: task.amount };
    },
    [publicKey, passphrase, getTask],
  );

  const refundExpired = useCallback(
    async (input: { taskId: string }) => {
      if (!publicKey) throw new Error("Wallet not connected");

      const contract = getContract();
      const op = contract.call("refund_if_expired", hex32ToScVal(input.taskId));

      const txHash = await buildSignSubmit(publicKey, passphrase, op);
      const task = await getTask(input.taskId);
      return { task, txHash, payer: task.payer, amount: task.amount };
    },
    [publicKey, passphrase, getTask],
  );

  const raiseDispute = useCallback(
    async (input: { taskId: string; role: "payer" | "worker" }) => {
      if (!publicKey) throw new Error("Wallet not connected");

      const contract = getContract();
      const callerAddress = new Address(publicKey);
      const op = contract.call(
        "raise_dispute",
        hex32ToScVal(input.taskId),
        callerAddress.toScVal(),
      );

      const txHash = await buildSignSubmit(publicKey, passphrase, op);
      const task = await getTask(input.taskId);
      return { task, txHash };
    },
    [publicKey, passphrase, getTask],
  );

  const resolveDispute = useCallback(
    async (input: { taskId: string; outcome: DisputeOutcome }) => {
      if (!publicKey) throw new Error("Wallet not connected");

      const contract = getContract();
      const favorWorker = input.outcome === "Worker";
      const op = contract.call(
        "resolve_dispute",
        hex32ToScVal(input.taskId),
        xdr.ScVal.scvBool(favorWorker),
      );

      const txHash = await buildSignSubmit(publicKey, passphrase, op);
      const task = await getTask(input.taskId);
      return { task, txHash };
    },
    [publicKey, passphrase, getTask],
  );

  const initiateWithdrawal = useCallback(
    async (input: { assetCode: string; amount: string; account: string; memo?: string }) => {
      const result = await anchor.initiateWithdrawal(
        input.assetCode,
        input.amount,
        input.account,
        { memo: input.memo },
      );
      return {
        transactionId: result.transactionId,
        interactiveUrl: result.interactiveUrl,
        type: result.type,
      };
    },
    [anchor],
  );

  const value = useMemo<TruvoSDKState>(
    () => ({
      getTask,
      createEscrow,
      confirmTask,
      releaseFunds,
      refundExpired,
      raiseDispute,
      resolveDispute,
      getWorkerBalance,
      estimateLocalCurrencyValue,
      initiateWithdrawal,
    }),
    [
      getTask,
      createEscrow,
      confirmTask,
      releaseFunds,
      refundExpired,
      raiseDispute,
      resolveDispute,
      getWorkerBalance,
      estimateLocalCurrencyValue,
      initiateWithdrawal,
    ],
  );

  return (
    <TruvoSDKContext.Provider value={value}>
      {children}
    </TruvoSDKContext.Provider>
  );
}

/**
 * Access the Truvo SDK state anywhere in the component tree.
 * Must be used inside a {@link TruvoSDKProvider}.
 */
export function useTruvoSDK(): TruvoSDKState {
  const ctx = useContext(TruvoSDKContext);
  if (!ctx) {
    throw new Error("useTruvoSDK must be used within a TruvoSDKProvider");
  }
  return ctx;
}
