# Truvo

A payment settlement layer connecting Stellar's agentic payment protocols to Anchor off-ramp infrastructure. Truvo enables autonomous AI agents to transact on-chain and settle payments directly to real-world recipients in local currencies.

## The Problem

AI agents can now pay for services autonomously on Stellar — x402 for per-request HTTP payments, MPP for batched session payments. But the humans fulfilling that work downstream have no clean path from an on-chain payment to spendable local currency. The payment rails exist. The off-ramp infrastructure exists. Truvo connects them.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  AI Agent   │────▶│  x402 / MPP  │────▶│  Escrow Contract │────▶│   Worker     │
│  (pays)     │     │  Payment     │     │  (Soroban)       │     │  (receives)  │
└─────────────┘     └──────────────┘     └─────────────────┘     └──────┬───────┘
                                                                         │
                                                                         ▼
                                                                  ┌──────────────┐
                                                                  │   Anchor     │
                                                                  │  (SEP-24)    │
                                                                  └──────┬───────┘
                                                                         │
                                                                         ▼
                                                                  ┌──────────────┐
                                                                  │  Local       │
                                                                  │  Currency    │
                                                                  └──────────────┘
```

### Components

| Component | Path | Description |
|-----------|------|-------------|
| **Smart Contract** | `contracts/` | Soroban escrow contract with full lifecycle: create, confirm, release, refund, dispute |
| **SDK** | `sdk/` | TypeScript client for agents and apps: escrow ops, x402/MPP payments, anchor withdrawals, traceable logging |
| **Server** | `server/` | x402 + MPP payment gateway and demo agent for autonomous task creation |
| **Frontend** | `frontend/` | React app with Requester, Worker, and Admin views |
| **Docs** | `docs/` | Architecture docs, anchor integration reference, demo walkthrough |

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
git clone https://github.com/Tech-Aura/Truvo.git
cd Truvo

# Install all packages
cd sdk && npm install && cd ..
cd server && npm install && cd ..
cd frontend && npm install && cd ..
```

### Run the Demo

**1. Start the server:**

```bash
cd server
export TESTNET_SECRET_KEY=S...  # Your testnet secret key
npm run dev
```

**2. Start the frontend:**

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

**3. Run the autonomous agent (optional):**

```bash
cd server
export TESTNET_SECRET_KEY=S...
export SERVER_URL=http://localhost:3001
npx tsx src/agent.ts
```

The agent will autonomously pay for and create escrowed tasks. See [docs/demo-walkthrough.md](docs/demo-walkthrough.md) for a complete step-by-step guide.

## Contract

Deployed on Stellar Testnet:

- **Contract ID**: `CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF`
- **Network**: Stellar Testnet

### State Machine

```
Created ──▶ Confirmed ──▶ Released
   │            │
   │            ▼
   │         Disputed ──▶ Released (or Refunded)
   │
   ▼
Refunded
```

| Function | Description |
|----------|-------------|
| `create_task` | Fund escrow for a task (payer signs) |
| `confirm_completion` | Worker submits proof of completion (worker signs) |
| `release_funds` | Release escrowed XLM to worker (any account) |
| `refund_if_expired` | Refund to payer after deadline (any account) |
| `raise_dispute` | Freeze escrow for arbitration (payer or worker) |
| `resolve_dispute` | Arbitrator resolves: release to worker or refund payer |

## SDK

The TypeScript SDK provides:

- **Escrow operations**: `createEscrow`, `confirmTask`, `releaseFunds`, `refundExpired`, `raiseDispute`, `resolveDispute`
- **x402 payments**: Autonomous per-call payments for API access
- **MPP sessions**: Batched payments via off-chain commitment signing
- **Anchor integration**: SEP-10 auth, SEP-24 withdrawals, SEP-12 KYC, SEP-38 price estimates
- **Traceable logging**: End-to-end correlation IDs for payment journey reconstruction

See [sdk/README.md](sdk/README.md) for full API documentation.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/pitch.md](docs/pitch.md) | Project pitch for Stellar Community Fund |
| [SECURITY.md](SECURITY.md) | Security posture and known limitations |
| [docs/demo-walkthrough.md](docs/demo-walkthrough.md) | Step-by-step demo script |
| [docs/anchor-integration.md](docs/anchor-integration.md) | SEP-24/SEP-12 anchor integration reference |
| [docs/offramp-flow.md](docs/offramp-flow.md) | End-to-end off-ramp flow documentation |

## Testing

```bash
# SDK tests
cd sdk && npm test

# Contract tests
cd contracts && cargo test
```

## Status

**Testnet** — The escrow contract is deployed and operational on Stellar Testnet. This is a working prototype, not production-ready. See [SECURITY.md](SECURITY.md) for honest documentation of current limitations.

## License

UNLICENSED — Private project.
