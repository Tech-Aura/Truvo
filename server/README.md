# Truvo Payment Server

This server implements the payment gateway for Truvo's task creation endpoint, supporting both x402 per-call payments and MPP session (channel) payments.

## Overview

The server supports two payment modes:

- **x402 (per-call)**: Each request triggers an individual on-chain payment. Simple and suitable for one-off tasks.
- **MPP Session (channel)**: Batch payments via off-chain commitment signing. The agent deposits once and signs cumulative commitments — no per-payment on-chain transaction. Ideal for creating many tasks in quick succession.

When a client calls the protected endpoint without payment, the server responds with HTTP 402 Payment Required plus the payment details needed to proceed.

## x402 Protocol (V2)

### Headers

- **PAYMENT-REQUIRED** (Server → Client): Base64-encoded PaymentRequired object
- **PAYMENT-SIGNATURE** (Client → Server): Base64-encoded PaymentPayload object  
- **PAYMENT-RESPONSE** (Server → Client): Base64-encoded SettlementResponse object

### Payment Required Response

When no payment is provided, the server returns:

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/tasks",
    "description": "Truvo task creation fee",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "stellar-testnet",
      "amount": "1000000",
      "asset": "native",
      "payTo": "G...",
      "maxTimeoutSeconds": 300,
      "extra": {}
    }
  ]
}
```

### Payment Payload

When retrying with payment, the client sends:

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "stellar-testnet",
  "payload": {
    "signedTxXdr": "...",
    "sourceAccount": "G...",
    "amount": "1000000",
    "destination": "G...",
    "asset": "native",
    "validUntilLedger": 12345678,
    "nonce": "..."
  }
}
```

## API Endpoints

### POST /api/tasks

Create a new task (x402 protected).

**Request without payment:**
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"worker": "G...", "amount": "10", "deadline": 12345678}'
```

**Response (402):**
```json
{
  "error": "Payment required",
  "message": "This endpoint requires an x402 payment. See PAYMENT-REQUIRED header for details."
}
```

**Request with payment:**
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-encoded-payment-payload>" \
  -d '{"worker": "G...", "amount": "10", "deadline": 12345678}'
```

**Response (201):**
```json
{
  "success": true,
  "taskId": "abc123...",
  "txHash": "simulated_tx_...",
  "message": "Task created successfully"
}
```

### GET /api/tasks/:taskId

Get task details (x402 protected).

### GET /health

Health check endpoint.

## Environment Variables

- `PORT` - Server port (default: 3001)
- `NETWORK_PASSPHRASE` - Stellar network passphrase
- `HORIZON_URL` - Horizon API URL
- `SOROBAN_RPC_URL` - Soroban RPC URL
- `TASK_CREATION_FEE` - Task creation fee in stroops (default: 1000000 = 0.1 XLM)
- `PAYMENT_RECIPIENT` - Stellar address to receive payments

## Running the Server

```bash
cd server
npm install
npm run dev
```

## Autonomous Demo Agent

The server includes an autonomous demo agent that demonstrates the x402 payment flow:

```bash
# Start the agent
npm run agent

# Or with custom configuration
SERVER_URL=http://localhost:3001 QUEUE_FILE=tasks-queue.json npm run agent
```

The agent will:
1. Read pending tasks from `tasks-queue.json`
2. For each task, call the x402-protected endpoint
3. Automatically handle the 402 response and payment flow
4. Update the queue with results

To add tasks to the queue, edit `tasks-queue.json`:

```json
{
  "tasks": [
    {
      "id": "task_1",
      "worker": "GABC123...",
      "amount": "10",
      "deadline": 1234567890,
      "status": "pending"
    }
  ],
  "lastProcessed": "2024-01-01T00:00:00.000Z"
}
```

## Testing

```bash
# Test health endpoint
curl http://localhost:3001/health

# Test task creation without payment (should return 402)
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"worker": "G...", "amount": "10", "deadline": 12345678}'
```
