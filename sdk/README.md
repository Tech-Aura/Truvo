# Truvo SDK

TypeScript client for interacting with the Truvo escrow smart contract on Stellar/Soroban.

## Installation

```bash
npm install @stellar/stellar-sdk
```

The SDK depends on `@stellar/stellar-sdk` v12+. No other dependencies are required.

## Environment Setup

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Value | Description |
|---|---|---|
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Network passphrase for testnet |
| `TRUVO_CONTRACT_ID` | `CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF` | Deployed escrow contract ID |

## Quick Start

```typescript
import { TruvoClient, Networks } from "@truvo/sdk";

const client = new TruvoClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF",
  networkPassphrase: Networks.TESTNET,
  secretKey: "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // payer's secret key
});
```

## Error Handling

The SDK throws typed errors so you can distinguish between transient network failures and permanent contract rejections:

```typescript
import {
  TruvoClient,
  TruvoNetworkError,
  TruvoContractError,
  Networks,
} from "@truvo/sdk";

const client = new TruvoClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF",
  networkPassphrase: Networks.TESTNET,
  secretKey: "S...",
});

try {
  await client.createEscrow({ ... });
} catch (err) {
  if (err instanceof TruvoNetworkError) {
    // Transient failure (timeout, RPC unavailable).
    // The SDK already retried automatically — you can retry manually
    // or surface the error to the user.
    console.warn("Network error, try again later:", err.message);
  } else if (err instanceof TruvoContractError) {
    // Deterministic on-chain rejection (auth failure, invalid state).
    // Do NOT retry — fix the input or handle the business logic.
    console.error("Contract rejected:", err.contractError);
  }
}
```

**Retry behavior:** The SDK retries transient network failures (timeouts, RPC 5xx, connection resets) up to 3 times with exponential backoff before throwing a `TruvoNetworkError`. Contract-level rejections (`TruvoContractError`) are never retried.

You can configure the retry limit:

```typescript
const client = new TruvoClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF",
  networkPassphrase: Networks.TESTNET,
  secretKey: "S...",
  maxRetries: 5, // default is 3
});
```

## API Reference

### `createEscrow`

Create a new escrowed task. The payer funds and authorises the escrow.

```typescript
const result = await client.createEscrow({
  payer: "G...",       // payer's public key (must match the signing key)
  worker: "G...",      // worker's public key
  amount: "10000000",  // escrow amount (i128 as string — 10,000,000 = 1 XLM)
  taskId: "aabb...ff", // 32-byte hex string (64 characters)
  deadline: 1700000000, // ledger timestamp after which refund is allowed
});

console.log("Task created:", result.task.status); // "Created" (0)
console.log("Tx hash:", result.txHash);
```

### `confirmTask`

Confirm that the worker has completed the task. Must be called by the worker's signing key.

```typescript
const clientAsWorker = new TruvoClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF",
  networkPassphrase: Networks.TESTNET,
  secretKey: workerSecretKey, // worker's secret key
});

const result = await clientAsWorker.confirmTask({
  taskId: "aabb...ff",
  proofHash: "ccdd...00", // 32-byte hex proof hash
});

console.log("Task confirmed:", result.task.status); // "Confirmed" (1)
```

### `releaseFunds`

Release escrowed funds to the worker. The task must be in `Confirmed` status. No auth required — any funded account can call this.

```typescript
const result = await client.releaseFunds({
  taskId: "aabb...ff",
});

console.log("Funds released to:", result.worker);
console.log("Amount:", result.amount);
console.log("Task status:", result.task.status); // "Released" (2)
```

### `refundExpired`

Refund escrowed funds back to the payer if the deadline has passed. The task must still be in `Created` status. No auth required.

```typescript
const result = await client.refundExpired({
  taskId: "aabb...ff",
});

console.log("Refunded to:", result.payer);
console.log("Amount:", result.amount);
console.log("Task status:", result.task.status); // "Refunded" (3)
```

You can check client-side whether a task's deadline has passed before submitting:

```typescript
import { TruvoClient, TaskStatus } from "@truvo/sdk";

// After reading a task from the contract:
if (task.status === TaskStatus.Created && TruvoClient.isTaskExpired(task)) {
  const refund = await client.refundExpired({ taskId: task.task_id });
  console.log("Refunded:", refund.amount);
}
```

### `raiseDispute`

Raise a dispute on a task. Either the payer or worker may raise a dispute while the task is in `Created` or `Confirmed` status.

```typescript
const result = await client.raiseDispute({
  taskId: "aabb...ff",
  role: "worker", // or "payer"
});

console.log("Task disputed:", result.task.status); // "Disputed" (4)
```

### `resolveDispute`

Resolve a dispute. **Only the designated arbitrator may call this.** The client must be constructed with the arbitrator's secret key.

```typescript
const arbitratorClient = new TruvoClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF",
  networkPassphrase: Networks.TESTNET,
  secretKey: arbitratorSecretKey,
});

const result = await arbitratorClient.resolveDispute({
  taskId: "aabb...ff",
  outcome: "Worker", // release funds to worker, or "Payer" to refund
});

console.log("Dispute resolved:", result.task.status); // "Released" (2) or "Refunded" (3)
```

## Full Example: Happy Path

```typescript
import { TruvoClient, Networks } from "@truvo/sdk";
import { Keypair } from "@stellar/stellar-sdk";

const RPC = "https://soroban-testnet.stellar.org";
const CONTRACT = "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA4IN3G2PF";
const NETWORK = Networks.TESTNET;

// Generate test accounts (or use existing funded keypairs).
const payer = Keypair.random();
const worker = Keypair.random();

// Fund via Friendbot for testnet.
await fetch(`https://friendbot.stellar.org?addr=${payer.publicKey()}`);
await fetch(`https://friendbot.stellar.org?addr=${worker.publicKey()}`);

// Create clients for each role.
const payerClient = new TruvoClient({
  rpcUrl: RPC, contractId: CONTRACT, networkPassphrase: NETWORK,
  secretKey: payer.secret(),
});
const workerClient = new TruvoClient({
  rpcUrl: RPC, contractId: CONTRACT, networkPassphrase: NETWORK,
  secretKey: worker.secret(),
});

const taskId = Buffer.from(require("crypto").randomBytes(32)).toString("hex");
const proofHash = Buffer.from(require("crypto").randomBytes(32)).toString("hex");
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

// 1. Create escrow (payer signs)
const created = await payerClient.createEscrow({
  payer: payer.publicKey(),
  worker: worker.publicKey(),
  amount: "10000000",
  taskId,
  deadline,
});
console.log("Created:", created.task.status);

// 2. Confirm task (worker signs)
const confirmed = await workerClient.confirmTask({ taskId, proofHash });
console.log("Confirmed:", confirmed.task.status);

// 3. Release funds (any account)
const released = await payerClient.releaseFunds({ taskId });
console.log("Released to:", released.worker, "amount:", released.amount);
```

## Contract Status Codes

| Status | Value | Meaning |
|---|---|---|
| `Created` | 0 | Escrow created, awaiting worker completion |
| `Confirmed` | 1 | Worker confirmed completion, awaiting release |
| `Released` | 2 | Funds released to worker (terminal) |
| `Refunded` | 3 | Funds refunded to payer (terminal) |
| `Disputed` | 4 | Dispute raised, awaiting arbitrator resolution |

## Running Tests

```bash
cd sdk
npm install
npm test
```

Tests run against the live testnet contract and require network access. See `tests/integration.test.ts` for details.
