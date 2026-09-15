# Truvo: Connecting Agentic Payments to Real-World Spending

## The Problem

AI agents can now transact autonomously on Stellar. They can pay for APIs, create escrows, and move value on-chain without human intervention. The payment infrastructure exists — x402 for per-request HTTP payments, MPP for batched session payments — and it works.

But here's the gap: the humans and services fulfilling that work downstream have no clean path from an agent's on-chain payment to spendable local currency.

Consider a real scenario. A logistics company in Lagos uses an AI agent to delegate delivery tasks to local couriers. The agent pays autonomously via x402, creates an escrow on-chain, and the courier completes the delivery. The funds are released to the courier's Stellar wallet. Now what?

The courier needs Nigerian Naira in their bank account to buy fuel, pay rent, and feed their family. The on-chain XLM sitting in their Stellar wallet is useless for that. They need to go through an anchor — complete KYC, initiate a withdrawal, wait for processing — and the process is fragmented, manual, and unfamiliar to most people in emerging markets.

The payment rails exist. The off-ramp infrastructure exists. But nothing connects them into a single, coherent flow.

## The Gap

Stellar has two powerful primitives that solve different parts of this problem:

1. **Agentic payment protocols** (x402, MPP) let AI agents pay for services autonomously, with no human in the loop for each transaction.
2. **Anchor off-ramp infrastructure** (SEP-24, SEP-12) lets people convert Stellar assets to local fiat currency through regulated intermediaries.

These two systems live in separate worlds today. An agent can pay, and an anchor can off-ramp, but there is no settlement layer that bridges them. The result is that autonomous agent payments end their journey on-chain, and the human recipients are left to figure out the rest.

## What Truvo Does

Truvo is the payment settlement layer that connects these two worlds.

An AI agent pays for a task using x402 or an MPP session. Truvo's escrow contract holds the funds on-chain until the work is confirmed. When the worker completes the task, funds are released to their Stellar wallet. From there, Truvo's SDK guides them through a seamless anchor withdrawal — authentication, KYC, withdrawal initiation, and status tracking — all handled programmatically.

The full journey, from an agent's first payment to a worker receiving local currency, becomes one continuous, auditable flow.

## Architecture

At a high level, Truvo has four components:

### Smart Contract (Soroban)

The on-chain escrow contract manages the task lifecycle. It enforces a strict state machine: a task is created and funded, the worker confirms completion, and funds are released. If something goes wrong, either party can raise a dispute, and an arbitrator resolves it. Every state transition emits an event, so the full history is auditable on-chain.

The contract is deployed on Stellar Testnet and has been tested against adversarial scenarios including reentrancy attacks and double-refund attempts.

### TypeScript SDK

The SDK is the interface that both agents and humans use to interact with Truvo. It provides:

- **Escrow operations**: creating tasks, confirming completion, releasing funds, raising disputes
- **Payment integration**: x402 client for per-call payments, MPP session client for batch payments
- **Anchor integration**: SEP-10 authentication, SEP-24 withdrawals, SEP-12 KYC, SEP-38 price estimates
- **Traceable logging**: every payment can be followed from the agent's initial request through to withdrawal completion, with a consistent correlation ID

The SDK is designed for autonomous agents — it handles retries, error classification (retryable network errors vs. deterministic contract errors), and payment proof construction without human intervention.

### Demo Agent

A standalone TypeScript process that demonstrates fully autonomous operation. It monitors a queue of pending tasks, and for each one:

- If there's a batch of tasks, it uses an MPP session to pay efficiently
- If there's a single task, it falls back to per-call x402
- It creates escrowed tasks on-chain and logs every step with correlation IDs

The agent runs without any human triggering it. It proves that an AI can discover work, pay for it, and manage the full escrow lifecycle end to end.

### Frontend

A React web application with views for requesters (creating tasks), workers (confirming completion and withdrawing funds), and administrators (resolving disputes). The frontend uses Freighter for wallet integration and connects to the same SDK and contract as the agent.

## Demo Flow

The demo walks through the complete journey:

1. **Agent pays and creates escrow**: The demo agent reads a task from its queue, pays via x402 (or MPP session for batches), and creates an escrowed task on-chain.

2. **Worker confirms**: A human worker opens the frontend, sees the pending task, submits proof of completion, and the contract state moves to "Confirmed."

3. **Funds released**: Anyone can call `release_funds` — the contract transfers the escrowed XLM to the worker's Stellar wallet.

4. **Worker withdraws**: The worker initiates a withdrawal through the anchor. The SDK handles SEP-10 authentication, opens the anchor's interactive KYC flow, and tracks the withdrawal status until completion.

5. **Local currency received**: The anchor delivers local currency to the worker's bank account or mobile money wallet.

Every step is logged with a consistent task ID, so the full payment journey can be reconstructed from logs alone.

## Why Stellar

Truvo depends on capabilities that are unique to Stellar:

- **Soroban smart contracts** for trustless escrow with deterministic state transitions
- **x402 and MPP** for machine-to-machine payments over HTTP — the standard that makes autonomous agent payments possible
- **SEP-24 and SEP-12 anchors** for regulated off-ramp infrastructure with global reach
- **Low transaction costs** that make micro-escrows economically viable — you can't escrow a $2 delivery task on a chain with $5 gas fees

Stellar is the only network where all four of these primitives exist and interoperate. Truvo is the layer that makes them work together.

## What We're Building Next

- **Production authentication** on the x402 endpoint (currently demo-grade)
- **Multi-arbitrator dispute resolution** to reduce centralization risk
- **Mainnet deployment** after a security audit
- **Anchor partnerships** for real off-ramp coverage in target markets
- **Agent registry** so requesters can discover and assign tasks to verified workers

## Summary

Truvo solves a real problem at the intersection of AI autonomy and human economic participation. Agent payment rails and anchor off-ramps both exist on Stellar, but they don't talk to each other. Truvo is the bridge — a settlement layer that lets an agent's on-chain payment flow seamlessly through to a worker's local bank account.

The smart contract is deployed. The SDK handles the full payment lifecycle. The demo agent proves autonomous operation end to end. What we need now is the support to take this from testnet to production and put it in front of real users.
