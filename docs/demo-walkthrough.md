# Truvo Demo Walkthrough

A step-by-step script for demonstrating Truvo end to end. This can also serve as a script for recording a demo video — each section maps to a natural "scene."

## Prerequisites

- Node.js 18+ installed
- Git installed
- A Stellar testnet account with XLM (we'll fund one via Friendbot)

## Step 1: Clone and Install

```bash
git clone https://github.com/Tech-Aura/Truvo.git
cd Truvo

# Install SDK dependencies
cd sdk && npm install && cd ..

# Install server dependencies
cd server && npm install && cd ..
```

**Expected output:** No errors. Dependencies installed successfully.

## Step 2: Fund Testnet Accounts

We need two accounts: one for the agent (payer) and one for the worker.

```bash
# Generate and fund the agent account
AGENT_KEY=$(stellar keys generate --network testnet agent-account --fund 2>&1 | tail -1)
AGENT_ADDRESS=$(stellar keys address agent-account)
echo "Agent: $AGENT_ADDRESS"

# Generate and fund the worker account
stellar keys generate --network testnet worker-account --fund 2>&1 | tail -1
WORKER_ADDRESS=$(stellar keys address worker-account)
echo "Worker: $WORKER_ADDRESS"
```

**Expected output:** Two public key addresses printed. Both accounts are funded with 10,000 XLM from Friendbot.

You can verify balances on [Stellar Expert](https://stellar.expert/explorer/testnet/) by searching for either address.

## Step 3: Start the Server

In a separate terminal:

```bash
cd server
export TESTNET_SECRET_KEY=$(stellar keys show agent-account --secret)
npm run dev
```

**Expected output:**

```
🚀 Truvo x402 Payment Server running on port 3001
📋 Task creation fee: 0.1 XLM
💰 Payment recipient: GCOLRACTORADDRESS123456789012345678901234567890
🌐 Network: Test SDF Network ; September 2015

📚 API Endpoints:
   POST /api/tasks - Create a task (x402 protected)
   GET /api/tasks/:taskId - Get task details (x402 protected)
   GET /health - Health check
```

## Step 4: Verify the Server is Running

```bash
curl http://localhost:3001/health
```

**Expected output:**

```json
{
  "status": "ok",
  "service": "Truvo x402 Payment Server",
  "version": "0.1.0",
  "mppEnabled": false
}
```

## Step 5: Run the Demo Agent

In another terminal:

```bash
cd server
export TESTNET_SECRET_KEY=$(stellar keys show agent-account --secret)
export SERVER_URL=http://localhost:3001
npx tsx src/agent.ts
```

**Expected output (first few lines):**

```
🤖 Truvo Autonomous Demo Agent
================================
Server URL: http://localhost:3001
Queue File: tasks-queue.json
Poll Interval: 5000ms
Batch Threshold: 2 tasks

📝 Creating sample tasks for demonstration...
✅ Created 3 sample tasks.
✅ x402 client initialized with public key: G...
ℹ️  MPP session not configured (MPP_COMMITMENT_SECRET not set)
   Using per-call x402 for all tasks.

🚀 Starting agent loop...
   Press Ctrl+C to stop.

🔄 Iteration 1 - 2026-09-15T...

📋 Found 3 pending task(s) to process.
   → Using per-call x402 (MPP not configured)

🔄 [x402] Processing task task_...
   Worker: GABC12345678901234567890123456789012345678901234
   Amount: 10 XLM
   Deadline: 2026-09-22T...
```

The agent will process each task by:
1. Receiving the 402 response from the server
2. Constructing a payment transaction
3. Submitting the payment and creating the escrow

**Expected output (after processing):**

```
✅ [x402] Task task_... created successfully!
   Task ID: <64-char hex string>
   TX Hash: <transaction hash>

✅ Processed 3 task(s) in this iteration.

⏳ Waiting 5s before next check...
```

The agent has created three escrowed tasks on-chain. Each task has:
- A unique 32-byte task ID
- A payer (the agent's address)
- A worker address
- An escrowed amount
- A deadline

## Step 6: Verify On-Chain State

Check one of the created tasks on Stellar Expert. Search for the contract address:

```
CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF
```

You should see recent transactions from the agent's address calling `create_task` on the contract.

You can also check the agent's account balance — it should have decreased by the task creation fee plus transaction fees for each task.

## Step 7: Start the Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

**Expected output:**

```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open `http://localhost:5173/` in your browser.

## Step 8: Connect Wallet as Worker

1. Click the wallet connection button in the top right
2. Connect with Freighter using the worker account
3. Navigate to the Worker view

**Expected state:** You should see pending tasks assigned to this worker's address.

## Step 9: Confirm Task Completion (Worker)

1. In the Worker view, find a pending task
2. Click "Submit Proof" or equivalent action
3. Enter a proof hash (any 64-character hex string for demo purposes, e.g., `ababababababababababababababababababababababababababababababababab`)
4. Submit

**Expected output:** The task status changes from "Created" to "Confirmed" in the frontend.

On-chain, the contract state has moved from `Created` (0) to `Confirmed` (1).

## Step 10: Release Funds

1. In the frontend, find the confirmed task
2. Click "Release Funds"
3. Confirm the transaction in Freighter

**Expected output:** The task status changes to "Released." The escrowed XLM has been transferred to the worker's Stellar account.

You can verify by checking the worker's balance on Stellar Expert — it should have increased by the task amount.

## Step 11: Worker Initiates Withdrawal

This is where Truvo's anchor integration shines — the worker converts their on-chain XLM to local currency.

1. In the Worker view, navigate to the withdrawal section
2. The SDK checks the worker's available balance
3. The SDK estimates the local currency value (e.g., "~3.90 USD" for 10 XLM)
4. Click "Withdraw" to initiate the SEP-24 withdrawal

**Expected output:** An interactive URL opens (from the test anchor) where the worker completes KYC and enters withdrawal details.

## Step 12: Complete KYC and Withdrawal

In the anchor's interactive page:

1. Fill in the required KYC fields (name, email — the test anchor auto-accepts)
2. Select the withdrawal destination (bank account or mobile money)
3. Confirm the withdrawal

**Expected output:** The anchor shows a confirmation page. The withdrawal is now in progress.

## Step 13: Track Withdrawal Status

Back in the Truvo frontend:

1. The worker can see the withdrawal status updating
2. It progresses through: `pending_user_transfer_start` → `pending_user_transfer_complete` → `pending_anchor` → `completed`

**Expected output (on testnet):**

The test anchor completes quickly. The status reaches "completed" and the worker has received local currency.

## Step 14: Verify Complete Payment Journey

The full journey is now complete:

1. **Agent paid** (x402) → server received payment and created escrow
2. **Escrow created** on-chain → funds locked in contract
3. **Worker confirmed** → contract state moved to Confirmed
4. **Funds released** → worker's Stellar account received XLM
5. **Worker withdrew** → anchor converted XLM to local currency

You can reconstruct the entire journey from the logs. Each log line includes a `correlation_id` (the task ID), so you can trace one specific payment from start to finish:

```bash
# If logs go to stderr, filter by task ID:
grep '<task-id>' <logfile>
```

## Expected Log Output

Each log line is structured JSON with:
- `timestamp`: ISO-8601 time
- `level`: info, warn, error
- `component`: which part of the system (agent, sdk.x402, sdk.client, server)
- `stage`: what happened (e.g., `x402.request_initiated`, `escrow.created`, `worker.confirmed`)
- `correlation_id`: the task ID threading through the entire pipeline

Example log sequence for one task:

```json
{"timestamp":"2026-09-15T10:00:00.000Z","level":"info","component":"agent","stage":"agent.task_processing","correlation_id":"task_abc123","worker":"G...","amount":"10","paymentMethod":"x402"}
{"timestamp":"2026-09-15T10:00:00.100Z","level":"info","component":"agent","stage":"x402.request_initiated","correlation_id":"task_abc123","url":"http://localhost:3001/api/tasks","method":"POST"}
{"timestamp":"2026-09-15T10:00:00.200Z","level":"info","component":"sdk.x402","stage":"x402.request_initiated","correlation_id":"task_abc123","url":"http://localhost:3001/api/tasks"}
{"timestamp":"2026-09-15T10:00:00.300Z","level":"info","component":"sdk.x402","stage":"x402.challenge_received","correlation_id":"task_abc123","status":402}
{"timestamp":"2026-09-15T10:00:00.400Z","level":"info","component":"sdk.x402","stage":"x402.payment_constructed","correlation_id":"task_abc123","amount":"1000000","destination":"G..."}
{"timestamp":"2026-09-15T10:00:00.500Z","level":"info","component":"sdk.x402","stage":"x402.payment_submitted","correlation_id":"task_abc123","status":201}
{"timestamp":"2026-09-15T10:00:00.600Z","level":"info","component":"server","stage":"server.payment_verified","correlation_id":"task_abc123","source":"x402"}
{"timestamp":"2026-09-15T10:00:00.700Z","level":"info","component":"server","stage":"escrow.created","correlation_id":"task_abc123","txHash":"simulated_tx_..."}
{"timestamp":"2026-09-15T10:00:00.800Z","level":"info","component":"sdk.x402","stage":"x402.payment_settled","correlation_id":"task_abc123","taskId":"...","txHash":"..."}
{"timestamp":"2026-09-15T10:00:00.900Z","level":"info","component":"agent","stage":"escrow.created","correlation_id":"task_abc123","onChainTaskId":"...","txHash":"..."}
```

## Cleanup

When done, stop the server and agent (Ctrl+C in each terminal). Reset the task queue:

```bash
rm server/tasks-queue.json
```

Reset testnet identities if desired:

```bash
stellar keys delete agent-account --force
stellar keys delete worker-account --force
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Agent says "Failed to initialize x402 client" | Ensure `TESTNET_SECRET_KEY` is set to a valid `S...` key |
| Server returns 402 but agent doesn't pay | Check that the server is running and `SERVER_URL` is correct |
| Frontend can't connect to contract | Verify `TRUVO_CONTRACT_ID` matches the deployed contract |
| Freighter doesn't show task | Ensure the worker account has the correct address matching the task |
| Withdrawal fails at anchor | Check the anchor is accessible at `testanchor.stellar.org` |
| MPP session not used | Set `MPP_COMMITMENT_SECRET` env var and ensure batch threshold is met |
