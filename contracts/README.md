# Truvo Smart Contracts

This directory contains the Soroban smart contracts for the Truvo settlement layer on Stellar.

## Prerequisites

- **Rust & Cargo** (latest stable):
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Wasm target**:
  ```bash
  rustup target add wasm32v1-none
  # or
  rustup target add wasm32-unknown-unknown
  ```
- **Stellar CLI**:
  Follow instructions at [Stellar Developers Documentation](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli).

## Building Locally

To build the contract wasm binary using the Stellar CLI:

```bash
cd contracts
stellar contract build
```

Or using Cargo directly:

```bash
cd contracts
cargo build --target wasm32v1-none --release
```

The compiled `.wasm` file will be generated in `target/wasm32v1-none/release/truvo_contracts.wasm`.

## Running Tests Locally

To run the unit and integration tests:

```bash
cd contracts
cargo test
```

## Status

**In Development** — Contract skeleton initialized with Soroban SDK dependencies and build configuration. Contract logic will be implemented in subsequent milestones.

