# Truvo Smart Contracts

This directory contains the Soroban smart contracts for the Truvo payment settlement layer on Stellar.

## Status

**Deployed to Testnet** — The core Truvo escrow contract is deployed and active on the Stellar Testnet.

- **Contract ID**: `CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF`
- **WASM Hash**: `bbbb8302a740210aeec54e20b57da3348177d8b98fe5a836258cf228b8c117ac`
- **Network**: `testnet` (Passphrase: `"Test SDF Network ; September 2015"`)
- **RPC URL**: `https://soroban-testnet.stellar.org`
- **Deployer**: `GDUCYBAOSOWU625DWCUDOZ7RGBRYXJRRVICFZZCNRTKWRBFPOG3JKTSF`
- **Stellar Lab**: [Inspect Contract on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF)
- **Stellar Expert**: [View Contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF)

---

## Prerequisites

Ensure the following dependencies and tools are installed:

1. **Rust & Cargo** (latest stable):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
2. **Wasm compilation target**:
   ```bash
   rustup target add wasm32v1-none
   # or
   rustup target add wasm32-unknown-unknown
   ```
3. **Stellar CLI**:
   Follow instructions at [Stellar Developers Documentation](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli).
   Verify installation:
   ```bash
   stellar --version
   ```

---

## Deployment Process to Stellar Testnet

Deploying the Truvo escrow contract to the Stellar testnet involves four primary steps: funding an identity via Friendbot, compiling the contract to optimized WASM, deploying with the Stellar CLI, and recording the resulting contract identifier for SDK / client use.

### Step 1: Fund a Testnet Account via Friendbot

Stellar's testnet provides a faucet service called **Friendbot** that distributes free test XLM to fund transaction fees and storage reserves.

Generate a deployer key identity and automatically request funds from Friendbot:

```bash
stellar keys generate --network testnet truvo-deployer --fund
```

To verify the generated account address:

```bash
stellar keys address truvo-deployer
```

*(Optional)* If funding an existing account manually, query Friendbot directly via cURL:

```bash
curl "https://friendbot.stellar.org?addr=$(stellar keys address truvo-deployer)"
```

### Step 2: Build the Contract WASM

Compile the contract source code into an optimized WebAssembly bytecode target:

Using the **Stellar CLI** (recommended):

```bash
cd contracts
stellar contract build
```

Alternatively, build with **Cargo** directly:

```bash
cd contracts
cargo build --target wasm32v1-none --release
```

The optimized WASM output will be generated at:
```text
target/wasm32v1-none/release/truvo_contracts.wasm
```

### Step 3: Deploy with the Stellar CLI

Deploy the compiled WASM binary to Stellar testnet using your funded deployer identity:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/truvo_contracts.wasm \
  --source truvo-deployer \
  --network testnet
```

During this step, the Stellar CLI will:
1. Upload and install the contract WASM bytecode to the ledger.
2. Instantiate a new contract instance on-chain.
3. Print the resulting **Contract ID** (`C...`) to stdout.

Example deployment output:
```text
✅ Deployed!
CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF
```

### Step 4: Record the Contract ID for SDK & Client Integration

To enable the TypeScript SDK and frontend applications to interact with the deployed contract, record the deployment details in config files:

1. **`contracts/contracts.json`**:
   ```json
   {
     "network": "testnet",
     "contractId": "CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF",
     "wasmHash": "bbbb8302a740210aeec54e20b57da3348177d8b98fe5a836258cf228b8c117ac",
     "deployer": "GDUCYBAOSOWU625DWCUDOZ7RGBRYXJRRVICFZZCNRTKWRBFPOG3JKTSF",
     "rpcUrl": "https://soroban-testnet.stellar.org",
     "networkPassphrase": "Test SDF Network ; September 2015"
   }
   ```

2. **`contracts/.env.example`** and **`sdk/.env.example`**:
   ```env
   STELLAR_NETWORK=testnet
   SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
   STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
   TRUVO_CONTRACT_ID=CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF
   ```

Copy this file to `.env` in the respective directories when running scripts or SDK clients:
```bash
cp contracts/.env.example contracts/.env
cp sdk/.env.example sdk/.env
```

---

## Contract Interactivity via CLI

You can invoke methods on the deployed testnet contract directly using the Stellar CLI:

### 1. Create a Task (`create_task`)

```bash
stellar contract invoke \
  --id CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF \
  --source truvo-deployer \
  --network testnet \
  -- \
  create_task \
  --payer <PAYER_ADDRESS> \
  --worker <WORKER_ADDRESS> \
  --amount 10000000 \
  --task_id 0101010101010101010101010101010101010101010101010101010101010101 \
  --deadline 1800000000
```

### 2. Confirm Completion (`confirm_completion`)

```bash
stellar contract invoke \
  --id CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF \
  --source <WORKER_NAME> \
  --network testnet \
  -- \
  confirm_completion \
  --task_id 0101010101010101010101010101010101010101010101010101010101010101 \
  --proof_hash abababababababababababababababababababababababababababababababab
```

### 3. Release Funds (`release_funds`)

```bash
stellar contract invoke \
  --id CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF \
  --source truvo-deployer \
  --network testnet \
  -- \
  release_funds \
  --task_id 0101010101010101010101010101010101010101010101010101010101010101
```

### 4. Refund Expired Task (`refund_if_expired`)

```bash
stellar contract invoke \
  --id CA2FRXSOJ7ZNL2OZLADGQEC64D72K3BFWPUBCVKQQGDQLSA54IN3G2PF \
  --source truvo-deployer \
  --network testnet \
  -- \
  refund_if_expired \
  --task_id 0101010101010101010101010101010101010101010101010101010101010101
```

---

## Running Tests Locally

To run the full suite of unit and integration tests:

```bash
cd contracts
cargo test
```
