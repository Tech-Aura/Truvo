# Changelog

All notable changes to Truvo are documented here, organized by component area.

## Escrow Contract

### Core Functions
- `create_task`: Fund and initialize an escrowed task with payer, worker, amount, and deadline
- `confirm_completion`: Worker submits proof of completion (32-byte SHA-256 hash)
- `release_funds`: Release escrowed XLM to the worker (any funded account can call)
- `refund_if_expired`: Refund to payer after deadline has passed (any funded account can call)
- `initialize`: Set the contract owner and arbitrator addresses (one-time)

### Dispute Resolution
- `raise_dispute`: Either payer or worker can freeze escrow while task is in Created or Confirmed status
- `resolve_dispute`: Arbitrator resolves in favor of worker (release) or payer (refund)

### Events
- `task_created`, `task_confirmed`, `task_released`, `task_refunded`, `task_disputed`, `task_resolved`
- All state transitions emit events with task ID, addresses, and amounts for off-chain indexing

### Security
- Reentrancy protection tested (confirm_completion during release, double release attempt)
- Double-refund prevention tested
- Unauthorized caller rejection tested
- Invalid state transition rejection tested

## SDK

### Contract Client (`TruvoClient`)
- Typed wrappers for all six contract functions: `createEscrow`, `confirmTask`, `releaseFunds`, `refundExpired`, `raiseDispute`, `resolveDispute`
- Automatic retry with exponential backoff for transient network errors (configurable `maxRetries`)
- Typed error classification: `TruvoNetworkError` (retryable) vs `TruvoContractError` (non-retryable)
- `getTask`: Read task state from on-chain storage with automatic decoding
- `isTaskExpired`: Client-side deadline check
- Event parsing for `releaseFunds` and `refundExpired` (extracts worker/payer and amount from contract events)

### x402 Payment Client (`X402Client`)
- Autonomous per-call HTTP payments via the x402 protocol (V2)
- Automatic 402 challenge handling: parse → construct payment → sign → retry
- `fetchWithPayment`: Generic x402-aware fetch with retry
- `createTaskWithPayment`: Convenience method for task creation with x402 payment
- Structured logging with correlation ID support

### MPP Session Client (`MppSessionClient`)
- Batched payments via Stellar MPP channel mode (off-chain commitment signing)
- `payAndFetch`: Sign cumulative ed25519 commitments off-chain (no per-payment on-chain tx)
- `createTaskWithSession`: Single task creation via MPP session
- `batchCreateTasks`: Create multiple tasks in a batch with cumulative commitments
- `installFetchPolyfill`: Polyfill global `fetch` for transparent MPP handling
- Session summary tracking (request count, cumulative amount, channel address)

### Anchor Integration (`AnchorClient`)
- SEP-10 web authentication (challenge → sign → JWT)
- SEP-24 interactive withdrawal initiation and status polling
- SEP-12 KYC status checking with normalized state (`kyc_required`, `kyc_pending`, `kyc_approved`, `kyc_rejected`)
- SEP-38 price oracle for local currency conversion estimates
- Horizon-based balance queries with liability subtraction for accurate spendable balance
- JWT expiry detection and automatic re-authentication

### Error Handling
- `TruvoError`: Base error class with optional `txHash` for correlation
- `TruvoNetworkError`: Transient failures (retryable, carries `attemptsExhausted`)
- `TruvoContractError`: Deterministic on-chain rejections (non-retryable, carries `contractError`)
- `TruvoAnchorError`, `TruvoAnchorAuthError`, `TruvoAnchorApiError`: Anchor-specific errors

### Structured Logging (`TruvoLogger`)
- Correlation ID (task_id) threading through every log line
- Component-scoped loggers (`sdk.x402`, `sdk.client`, `sdk.mpp-session`)
- `ChildLogger` for automatic task_id injection
- Canonical pipeline stage constants (`Stages.*`) for consistent naming

### Utilities
- XDR helpers: `i128ToScVal`, `u64ToScVal`, `hex32ToScVal`
- Retry logic with exponential backoff and jitter (`retryWithBackoff`)
- Error classification (`isRetryableError`)

## Server

### x402 Payment Gateway
- POST `/api/tasks` — x402-protected task creation endpoint
- GET `/api/tasks/:taskId` — task details (x402-protected)
- GET `/health` — health check with MPP status
- `requirePayment` middleware: x402 payment verification
- `requireMppOrX402` middleware: MPP session or x402 fallback
- Structured logging with request_id and correlation_id

### MPP Channel Server
- One-way payment channel support via `@stellar/mpp/channel/server`
- Channel contract and commitment key configuration
- MPP credential verification alongside x402

### Demo Agent
- Autonomous task processing from a JSON queue
- x402 per-call payments for individual tasks
- MPP session batch payments when task count exceeds threshold
- Structured logging with task_id correlation throughout

## Frontend

### Views
- **Requester**: Create escrowed tasks, view escrow status list with filtering
- **Worker**: View assigned tasks, submit completion proofs (SHA-256 hashing), withdraw to local currency via SEP-24
- **Admin**: View disputed tasks, resolve disputes (release to worker or refund to payer)

### Wallet Integration
- Freighter-based wallet connection via `WalletContext`
- Transaction signing delegated to Freighter (secret key never stored in browser)
- `TruvoSDKContext`: Read and write access to the escrow contract

### Worker Features
- Task filtering (all, awaiting action, completed/released)
- Proof submission with real-time SHA-256 hash computation (text or file input)
- Withdraw modal with SEP-24 anchor integration
- Balance display with local currency estimation (SEP-38 oracle)
- Error classification and user-friendly messaging

### Styling
- Dark theme consistent design across all views
- Status badges for task states (Created, Confirmed, Released, Refunded, Disputed)
- Responsive table layouts
- Modal overlays for proof submission and withdrawal

### Utilities
- `errorUtils.ts`: Error classification for UI display (retryable vs non-retryable)
- `proofUtils.ts`: SHA-256 proof hash computation and validation
- `withdrawalUtils.ts`: Currency definitions and fallback exchange rate estimation

## Documentation

- `docs/pitch.md`: SCF pitch document covering problem, solution, architecture, and demo flow
- `SECURITY.md`: Honest security posture assessment with known limitations and mainnet readiness requirements
- `docs/demo-walkthrough.md`: Step-by-step demo script with expected output at each stage
- `docs/anchor-integration.md`: SEP-10/SEP-24/SEP-12/SEP-38 integration reference
- `docs/offramp-flow.md`: End-to-end off-ramp flow with Mermaid sequence diagram
- `README.md`: Project introduction, architecture overview, quick start guide
- `sdk/README.md`: SDK API documentation with examples for all contract operations, x402, anchor integration
- `server/README.md`: Server documentation covering x402 and MPP payment modes

## Infrastructure

- Monorepo structure: `contracts/`, `sdk/`, `server/`, `frontend/`, `docs/`
- TypeScript throughout (ES2022 target, nodenext module resolution)
- Stellar SDK v15+ with Soroban RPC
- MPP integration via `@stellar/mpp` v0.7+ and `mppx` v0.6+
- Contract tests (Rust) and SDK integration tests (TypeScript against testnet)
