# Truvo Frontend

React frontend for the Truvo escrow platform. This is a **scaffold**: routing
and Freighter wallet connection only — task/escrow UI comes later.

## Stack: Vite + React + TypeScript

**Why Vite over Create React App (CRA):** CRA is deprecated and no longer
maintained (its last major release was in 2022, and the React team's own
docs now recommend Vite for new single-page apps). Vite gives us:

- Instant dev server startup and hot module replacement
- First-class TypeScript support with no config overhead (`tsc -b` for
  typecheck, esbuild for transpilation)
- A standard `build`/`preview` story for deployment

## Setup

```bash
cd frontend
npm install
npm run dev        # dev server at http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build locally
npm run typecheck  # TypeScript check only
```

## Wallet connection (Freighter)

Wallet state lives in `src/wallet/WalletContext.tsx` and is provided app-wide
via React context (wrapped around the router in `src/main.tsx`):

```tsx
import { useWallet } from "./wallet/WalletContext";

function MyComponent() {
  const { publicKey, isConnected, connect, disconnect, network } = useWallet();
  // ...
}
```

Behavior:

- **Detect** — on load, checks whether the Freighter extension is installed
  (`isConnected()`), without prompting.
- **Restore** — if the app is already on Freighter's Allow List, the public
  key is restored silently via `getAddress()`.
- **Connect** — the "Connect Wallet" button calls `requestAccess()`, which
  prompts the user once and returns their public key.
- **Watch** — a `WatchWalletChanges` poller keeps the context in sync when
  the user switches accounts or networks inside Freighter.
- **Network badge** — displays the Freighter network (`TESTNET`, `PUBLIC`, …)
  so users can see when they're on the wrong network.

Only the **public key** is ever handled by the app. Secret keys never leave
the Freighter extension; transaction signing will be delegated to Freighter
when escrow features are added.

## Routes

| Path      | View       | Purpose (future)                       |
|-----------|------------|----------------------------------------|
| `/`       | Requester  | Create tasks, fund escrows             |
| `/worker` | Worker     | Browse tasks, confirm, withdraw        |
| `/admin`  | Admin      | Arbitrator view for dispute resolution |

All three views are placeholders showing wallet-connection state; the escrow
UI will be built on top of them in later branches.

## Requirements

- Node 18+ (developed on Node 22)
- The [Freighter extension](https://freighter.app) for wallet connection
  (set it to **Testnet** for use with the Truvo contracts)
