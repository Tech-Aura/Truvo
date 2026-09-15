# Truvo

**A payment settlement layer connecting Stellar's agentic payment protocols to real-world local currency.**

AI agents can now pay autonomously on Stellar using protocols such as x402 and MPP. Truvo provides the settlement layer that turns those on-chain payments into completed work and, ultimately, spendable local currency for the humans fulfilling it.

The contract is the settlement primitive. The SDK, payment gateway, Anchor integration and reference frontend build around it.

---

## At a glance

|                   |                                                            |
| ----------------- | ---------------------------------------------------------- |
| Network           | Stellar Testnet                                            |
| Contract          | `CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF` |
| Smart contract    | Soroban escrow                                             |
| Payment protocols | x402, MPP                                                  |
| Off-ramp          | Stellar Anchor ecosystem                                   |
| Anchor standards  | SEP-10, SEP-12, SEP-24, SEP-38                             |
| SDK               | TypeScript                                                 |
| Frontend          | React                                                      |
| Server            | Node.js / TypeScript                                       |
| Status            | Working prototype on Testnet                               |

> **Prototype:** Truvo is deployed and operational on Stellar Testnet, but it is not production-ready. Review the security and limitations documentation before relying on it for real funds.

---

## The problem

Agentic payment protocols solve the payment side of autonomous commerce.

An AI agent can make a payment for an API request through x402 or commit to a series of payments through MPP. But the payment does not end the workflow.

Someone still has to do the work.

That worker needs to receive the value, and in many cases needs that value in a local currency rather than as an on-chain asset.

The missing path is:

```text
AI agent
   │
   │ autonomous payment
   ▼
x402 / MPP
   │
   │ on-chain settlement
   ▼
Soroban escrow
   │
   │ task completion
   ▼
Worker
   │
   │ off-ramp
   ▼
Stellar Anchor
   │
   │ SEP-24 withdrawal
   ▼
Local currency
```

**Truvo connects those pieces.**

---

## Architecture

```text
┌─────────────┐
│   AI Agent  │
│    pays     │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│      x402 / MPP     │
│   Payment Protocol  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Truvo Escrow      │
│      Soroban        │
└──────────┬──────────┘
           │
           │ task completed
           ▼
┌─────────────────────┐
│       Worker        │
│      receives       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│       Anchor        │
│      SEP-24         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Local Currency    │
└─────────────────────┘
```

The escrow contract is the trust boundary between autonomous payment and human settlement.

---

## Core design

### Escrow first

Truvo does not treat a payment as complete merely because an agent has sent funds.

Funds are placed into a Soroban escrow and remain associated with a task until the lifecycle reaches a terminal state.

The basic lifecycle is:

```text
Created ──▶ Confirmed ──▶ Released
   │            │
   │            ▼
   │         Disputed ──▶ Released
   │                    or
   │                  Refunded
   │
   ▼
Refunded
```

The payer funds the escrow when creating the task.

The worker confirms completion.

Funds can then be released to the worker.

If the task expires, the payer can recover the escrow through the expiry path.

Either party can raise a dispute, freezing the escrow until an arbitrator resolves it.

---

### Autonomous payments

Truvo supports two agentic payment patterns.

**x402**

Per-request payments for services exposed through HTTP.

An autonomous agent can pay for an individual resource or API request without requiring a traditional checkout flow.

**MPP**

Batched or session-based payments using off-chain commitment signing.

This allows an agent to establish a payment session rather than treating every interaction as an isolated transaction.

Both payment paths ultimately connect to the same settlement layer.

---

### Settlement is a separate concern

The on-chain payment and the off-ramp are intentionally separate stages.

The escrow contract handles:

* task funding
* completion confirmation
* fund release
* expiry refunds
* disputes
* dispute resolution

The Anchor integration handles the path from Stellar assets to local currency.

This separation keeps the escrow primitive independent of any single Anchor or payout provider.

---

## Contract

The Truvo contract is deployed on **Stellar Testnet**.

**Contract ID**

```text
CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF
```

**Network**

```text
Stellar Testnet
```

### Function surface

```text
// Lifecycle
create_task(...)          // fund escrow for a task
confirm_completion(...)   // worker submits proof of completion
release_funds(...)        // release escrowed XLM to worker
refund_if_expired(...)    // refund payer after deadline

// Disputes
raise_dispute(...)        // freeze escrow for arbitration
resolve_dispute(...)      // release to worker or refund payer
```

### Lifecycle semantics

| Function             | Authorization   | Purpose                            |
| -------------------- | --------------- | ---------------------------------- |
| `create_task`        | Payer           | Creates and funds an escrow        |
| `confirm_completion` | Worker          | Records completion proof           |
| `release_funds`      | Any account     | Releases escrowed funds to worker  |
| `refund_if_expired`  | Any account     | Returns funds after the deadline   |
| `raise_dispute`      | Payer or worker | Freezes the escrow                 |
| `resolve_dispute`    | Arbitrator      | Releases or refunds disputed funds |

The contract is designed so that release and expiry actions do not require a specific keeper to be online.

---

## Agent payment gateway

The server provides the bridge between autonomous agents and the Truvo settlement layer.

It combines:

```text
Agent
  │
  ├── x402 payment
  │
  └── MPP session
          │
          ▼
     Payment gateway
          │
          ▼
       Escrow task
          │
          ▼
       Worker
```

The included autonomous demo agent can create tasks and pay for them without a human manually initiating each transaction.

---

## Anchor integration

Once a worker has received an on-chain payment, Truvo provides the integration path toward an Anchor-based withdrawal.

The SDK covers the relevant Stellar ecosystem standards:

| Standard | Purpose                        |
| -------- | ------------------------------ |
| SEP-10   | Anchor authentication          |
| SEP-12   | KYC / customer information     |
| SEP-24   | Interactive withdrawal         |
| SEP-38   | Asset and fiat price estimates |

The intended settlement path is:

```text
Worker receives Stellar asset
          │
          ▼
     SEP-10 auth
          │
          ▼
     SEP-12 / KYC
          │
          ▼
   SEP-38 estimate
          │
          ▼
   SEP-24 withdrawal
          │
          ▼
     Local currency
```

The Anchor layer is therefore downstream of the escrow rather than part of the escrow contract itself.

---

## SDK

The TypeScript SDK provides a single client surface for applications and agents interacting with Truvo.

### Escrow operations

```text
createEscrow
confirmTask
releaseFunds
refundExpired
raiseDispute
resolveDispute
```

### Payment operations

```text
x402 payments
MPP sessions
```

### Anchor operations

```text
SEP-10 authentication
SEP-12 KYC
SEP-24 withdrawals
SEP-38 price estimates
```

### Traceable logging

Every payment journey can be correlated through traceable logging.

The goal is to make it possible to reconstruct:

```text
agent request
    ↓
payment
    ↓
escrow
    ↓
task
    ↓
worker completion
    ↓
release
    ↓
anchor withdrawal
```

rather than treating each stage as an unrelated transaction.

See [`sdk/README.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/sdk/README.md) for the SDK API documentation.

---

## Repository layout

```text
Truvo/
├── contracts/
│   └── Soroban escrow contract
│
├── sdk/
│   └── TypeScript client
│
├── server/
│   ├── x402 / MPP gateway
│   └── autonomous demo agent
│
├── frontend/
│   └── React reference application
│
└── docs/
    ├── pitch.md
    ├── demo-walkthrough.md
    ├── anchor-integration.md
    └── offramp-flow.md
```

### Components

| Component      | Path         | Responsibility                         |
| -------------- | ------------ | -------------------------------------- |
| Smart Contract | `contracts/` | Soroban escrow and task lifecycle      |
| SDK            | `sdk/`       | Agent/application client               |
| Server         | `server/`    | x402/MPP gateway and demo agent        |
| Frontend       | `frontend/`  | Requester, Worker and Admin views      |
| Docs           | `docs/`      | Architecture and integration reference |

---

## Quick start

### Prerequisites

* Node.js 18+
* npm

### Install

```bash
git clone https://github.com/Tech-Aura/Truvo.git
cd Truvo

cd sdk && npm install && cd ..
cd server && npm install && cd ..
cd frontend && npm install && cd ..
```

### Start the server

```bash
cd server

export TESTNET_SECRET_KEY=S...
npm run dev
```

### Start the frontend

In another terminal:

```bash
cd frontend
npm run dev
```

Then open:

```text
http://localhost:5173
```

### Run the autonomous agent

```bash
cd server

export TESTNET_SECRET_KEY=S...
export SERVER_URL=http://localhost:3001

npx tsx src/agent.ts
```

The agent autonomously pays for and creates escrowed tasks.

For the complete demo sequence, see [`docs/demo-walkthrough.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/docs/demo-walkthrough.md).

---

## Testing

### SDK

```bash
cd sdk
npm test
```

### Contract

```bash
cd contracts
cargo test
```

The contract suite should be treated as the primary correctness check for escrow lifecycle behaviour.

---

## Design boundaries

Truvo deliberately separates the responsibilities of each layer.

### The contract owns value

The Soroban contract is responsible for escrow state and the rules governing when funds can move.

### The server owns coordination

The server connects agentic payment protocols to task creation and the escrow layer.

### The SDK owns integration

The SDK provides applications and agents with a reusable interface rather than requiring each consumer to implement Soroban, x402, MPP and Anchor interactions independently.

### The Anchor owns fiat settlement

The Anchor remains responsible for the actual off-ramp and local-currency payout.

This keeps the protocol composable rather than binding Truvo to one payment provider or fiat rail.

---

## Security and limitations

Truvo is a **working prototype, not a production payment system**.

The current deployment is on Stellar Testnet.

Important areas to review before relying on the system include:

* escrow authorization and lifecycle assumptions
* dispute/arbitration trust
* Anchor availability and compliance requirements
* KYC requirements
* off-ramp liquidity and settlement behaviour
* x402 and MPP integration assumptions
* secret-key handling in the demo environment
* Testnet-only deployment status

See [`SECURITY.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/SECURITY.md) for the project's documented security posture and known limitations.

---

## Non-goals

Truvo's current scope is intentionally focused on settlement between autonomous agents, workers and Anchor infrastructure.

It does not attempt to:

* replace Stellar's underlying payment protocols
* operate its own fiat banking rail
* become an Anchor
* provide its own KYC infrastructure
* guarantee Anchor liquidity
* eliminate the need for arbitration in disputed tasks
* provide production-grade custody
* support every possible off-ramp provider

The protocol connects existing rails rather than attempting to rebuild them.

---

## Documentation

| Document                                                                                                            | Description                                  |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`docs/pitch.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/docs/pitch.md)                           | Project pitch for Stellar Community Fund     |
| [`SECURITY.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/SECURITY.md)                               | Security posture and known limitations       |
| [`docs/demo-walkthrough.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/docs/demo-walkthrough.md)     | Complete step-by-step demo                   |
| [`docs/anchor-integration.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/docs/anchor-integration.md) | SEP-24 / SEP-12 Anchor integration reference |
| [`docs/offramp-flow.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/docs/offramp-flow.md)             | End-to-end off-ramp flow                     |
| [`sdk/README.md`](https://github.com/Tech-Aura/Truvo/blob/chore/s6-release/sdk/README.md)                           | SDK API documentation                        |

---

## Status

**Testnet — working prototype.**

The Soroban escrow contract is deployed and operational on Stellar Testnet.

The current system demonstrates the complete conceptual path:

```text
AI agent
   ↓
x402 / MPP
   ↓
Soroban escrow
   ↓
Worker
   ↓
Anchor
   ↓
Local currency
```

The next stage is hardening the individual components and validating the full settlement journey against real Anchor infrastructure and production-like conditions.

---

## Project

**Repository:** [github.com/Tech-Aura/Truvo](https://github.com/Tech-Aura/Truvo)


