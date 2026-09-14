# Anchor Integration Reference

Research document for integrating with a Stellar testnet Anchor that supports
SEP-24 (Interactive Withdrawal) and SEP-12 (KYC). This serves as the reference
for the implementation work in the next session.

## Target Anchor

**Name:** Stellar Test Anchor (SDF Reference Implementation)
**Domain:** `testanchor.stellar.org`
**Network:** Stellar Testnet (`Test SDF Network ; September 2015`)
**Maintainer:** Stellar Development Foundation (SDF)
**Purpose:** Official reference anchor for testing SEP-compliant integrations end-to-end

This is the anchor used by the Stellar Demo Wallet
(`https://demo-wallet.stellar.org`) and the official anchor test suite
(`https://anchor-tests.stellar.org/`). It supports SEP-6, SEP-10, SEP-12,
SEP-24, SEP-31, and SEP-38.

### Supported Assets

| Code | Issuer | Type | Description |
|------|--------|------|-------------|
| `SRT` | `GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B` | crypto | Stellar Reference Token — test proxy for XLM |
| `USDC` | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` | crypto | Circle USDC Token |
| `native` | — | crypto | XLM, the native asset |

### Key Accounts

| Role | Public Key |
|------|-----------|
| Anchor Home Domain Account | `GCSGSR6KQQ5BP2FXVPWRL6SWPUSFWLVONLIBJZUKTVQB5FYJFVL6XOXE` |
| SEP-10 Signing Key | `GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR` |

---

## Discovery (SEP-1)

The anchor's `stellar.toml` is served at:

```
GET https://testanchor.stellar.org/.well-known/stellar.toml
```

Relevant fields:

```toml
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
WEB_AUTH_ENDPOINT = "https://testanchor.stellar.org/auth"
KYC_SERVER = "https://testanchor.stellar.org/sep12"
TRANSFER_SERVER = "https://testanchor.stellar.org/sep6"
TRANSFER_SERVER_SEP0024 = "https://testanchor.stellar.org/sep24"
DIRECT_PAYMENT_SERVER = "https://testanchor.stellar.org/sep31"
ANCHOR_QUOTE_SERVER = "https://testanchor.stellar.org/sep38"
```

---

## SEP-10: Web Authentication

Before calling any authenticated SEP-24 or SEP-12 endpoint, the client must
authenticate via SEP-10 to obtain a JWT.

**Endpoint:**

```
POST https://testanchor.stellar.org/auth
```

**Flow:**

1. Client sends a challenge transaction to the auth endpoint.
2. Client signs the challenge transaction with the user's secret key.
3. Client submits the signed challenge back to the auth endpoint.
4. Server returns a JWT token.

**Request (step 3 — submit signed challenge):**

```http
POST /auth
Content-Type: application/json

{
  "transaction": "<signed XDR transaction>"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

The JWT is included in all subsequent requests as:

```
Authorization: Bearer <JWT>
```

---

## SEP-24: Hosted Deposit and Withdrawal

**Base URL:** `https://testanchor.stellar.org/sep24`

### GET /info

Returns information about the anchor's supported assets, transfer methods,
and features. This endpoint is **unauthenticated**.

**Request:**

```http
GET https://testanchor.stellar.org/sep24/info
```

**Response:**

```json
{
  "deposit": {
    "SRT": {
      "enabled": true,
      "min_amount": 1,
      "max_amount": 10
    },
    "native": {
      "enabled": true,
      "min_amount": 1,
      "max_amount": 10
    },
    "USDC": {
      "enabled": true,
      "min_amount": 1,
      "max_amount": 10
    }
  },
  "withdraw": {
    "SRT": {
      "enabled": true,
      "min_amount": 1,
      "max_amount": 10
    },
    "native": {
      "enabled": true,
      "min_amount": 1,
      "max_amount": 10
    },
    "USDC": {
      "enabled": true,
      "min_amount": 1,
      "max_amount": 10
    }
  },
  "fee": {
    "enabled": false
  },
  "features": {
    "account_creation": false,
    "claimable_balances": false
  }
}
```

### POST /transactions/withdraw/interactive

Initiates an interactive withdrawal. The anchor returns a URL that the user
opens in a webview/popup to complete KYC and withdrawal details.

**Request:**

```http
POST https://testanchor.stellar.org/sep24/transactions/withdraw/interactive
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "asset_code": "SRT",
  "account": "G...",
  "amount": "5"
}
```

**Response:**

```json
{
  "id": "1596051987804",
  "type": "interactive_customer_info_needed",
  "url": "https://testanchor.stellar.org/sep24/interactive?jwt=<token>&transaction_id=1596051987804",
  "expires_at": "2024-01-01T00:00:00Z"
}
```

The `url` is opened in a popup/webview. The user completes the KYC and
withdrawal form there. When done, the anchor communicates back via:

- **postMessage callback** (if `callback=postMessage` was appended to the URL)
- **URL callback** (if a `callback` URL was provided)
- **Polling** via GET /transaction

### POST /transactions/deposit/interactive

Same pattern as withdrawal, but for deposits.

**Request:**

```http
POST https://testanchor.stellar.org/sep24/transactions/deposit/interactive
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "asset_code": "SRT",
  "account": "G...",
  "amount": "10"
}
```

**Response:**

```json
{
  "id": "1596051987805",
  "type": "interactive_customer_info_needed",
  "url": "https://testanchor.stellar.org/sep24/interactive?jwt=<token>&transaction_id=1596051987805",
  "expires_at": "2024-01-01T00:00:00Z"
}
```

### GET /transactions

Returns a list of the user's transactions. Requires authentication.

**Request:**

```http
GET https://testanchor.stellar.org/sep24/transactions?asset_code=SRT
Authorization: Bearer <JWT>
```

**Response:**

```json
{
  "transactions": [
    {
      "id": "1596051987804",
      "kind": "withdrawal",
      "status": "completed",
      "more_info_url": "https://testanchor.stellar.org/sep24/transaction?id=1596051987804",
      "started_at": "2024-01-01T00:00:00Z",
      "completed_at": "2024-01-01T00:01:00Z",
      "amount_in": "5.00",
      "amount_out": "4.90",
      "amount_fee": "0.10",
      "asset_code": "SRT"
    }
  ]
}
```

### GET /transaction

Returns the status and details of a single transaction.

**Request:**

```http
GET https://testanchor.stellar.org/sep24/transaction?id=1596051987804
Authorization: Bearer <JWT>
```

**Response:**

```json
{
  "transaction": {
    "id": "1596051987804",
    "kind": "withdrawal",
    "status": "completed",
    "started_at": "2024-01-01T00:00:00Z",
    "completed_at": "2024-01-01T00:01:00Z",
    "amount_in": "5.00",
    "amount_out": "4.90",
    "amount_fee": "0.10",
    "asset_code": "SRT",
    "withdraw_anchor_account": "G...",
    "withdraw_memo": "...",
    "withdraw_memo_type": "text"
  }
}
```

### Transaction Statuses

| Status | Description |
|--------|-------------|
| `incomplete` | User has not yet completed the interactive flow |
| `pending_user_transfer_start` | User must send the Stellar payment (withdrawals) |
| `pending_user_transfer_complete` | Anchor has received the user's payment, processing |
| `pending_anchor` | Anchor is processing off-chain |
| `pending_stellar` | Stellar transaction is being processed |
| `pending_trust` | Waiting for user to establish trustline |
| `pending_account` | Waiting for account creation |
| `completed` | Transaction finished successfully |
| `refunded` | Transaction was refunded |
| `expired` | Transaction expired |
| `error` | Transaction failed |

---

## SEP-12: KYC API

**Base URL:** `https://testanchor.stellar.org/sep12`

All endpoints require a SEP-10 JWT in the `Authorization` header.

### GET /customer

Check the KYC status of a customer or fetch the required fields.

**Request:**

```http
GET https://testanchor.stellar.org/sep12/customer?account=G...
Authorization: Bearer <JWT>
```

**Response (needs info):**

```json
{
  "status": "NEEDS_INFO",
  "fields": {
    "first_name": {
      "description": "The customer's first name",
      "type": "string"
    },
    "last_name": {
      "description": "The customer's last name",
      "type": "string"
    },
    "email_address": {
      "description": "The customer's email address",
      "type": "string"
    }
  }
}
```

**Response (accepted):**

```json
{
  "id": "d1ce2f48-3ff1-495d-9240-7a50d806cfed",
  "status": "ACCEPTED",
  "provided_fields": {
    "first_name": {
      "description": "The customer's first name",
      "type": "string",
      "status": "ACCEPTED"
    },
    "last_name": {
      "description": "The customer's last name",
      "type": "string",
      "status": "ACCEPTED"
    },
    "email_address": {
      "description": "The customer's email address",
      "type": "string",
      "status": "ACCEPTED"
    }
  }
}
```

### PUT /customer

Upload customer KYC information. This is idempotent — calling it again with
the same data is safe.

**Request:**

```http
PUT https://testanchor.stellar.org/sep12/customer
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "first_name": "Jane",
  "last_name": "Doe",
  "email_address": "jane@example.com"
}
```

**Response:**

```json
{
  "id": "d1ce2f48-3ff1-495d-9240-7a50d806cfed",
  "status": "ACCEPTED"
}
```

### Customer Statuses

| Status | Description |
|--------|-------------|
| `ACCEPTED` | All required KYC fields accepted; customer validated |
| `NEEDS_INFO` | More info required; see `fields` in response |
| `PROCESSING` | KYC under review |
| `REJECTED` | KYC failed permanently |

### PUT /customer/callback

Register a callback URL for status updates.

**Request:**

```http
PUT https://testanchor.stellar.org/sep12/customer/callback
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "url": "https://your-app.com/kyc-callback"
}
```

### DELETE /customer/{account}

Request deletion of all stored KYC data for a customer.

**Request:**

```http
DELETE https://testanchor.stellar.org/sep12/customer/G...
Authorization: Bearer <JWT>
```

---

## Integration Flow for Truvo

For the Truvo escrow platform, the anchor integration would support
off-ramp withdrawals when escrow funds are released to a worker who wants
to convert Stellar assets to fiat. The high-level flow:

1. **User registers KYC** with the anchor via SEP-12 (`PUT /customer`)
2. **User initiates withdrawal** via SEP-24 (`POST /transactions/withdraw/interactive`)
3. **User completes interactive flow** in popup (KYC confirmation, bank details)
4. **User sends Stellar payment** to the anchor's withdrawal address
5. **Anchor processes** the off-chain fiat transfer
6. **Client polls status** via SEP-24 (`GET /transaction`) until completed

### Key Implementation Notes

- **Authentication required:** All SEP-24 endpoints except `/info` require a
  valid SEP-10 JWT. The SEP-12 KYC endpoints also require authentication.
- **Interactive flow:** The withdrawal/deposit flow opens a popup hosted by
  the anchor. The SDK/client must handle the popup lifecycle and callback.
- **Trustlines:** Users must establish trustlines to the asset issuer before
  depositing. The test anchor's assets (SRT, USDC) already have testnet
  issuers.
- **Rate limits:** The test anchor has deposit/withdraw limits of 1–10 units
  per transaction (suitable for testing, not production volumes).
- **Fees:** The test anchor has fees disabled (`fee.enabled: false`).
- **No account creation:** The test anchor does not create accounts
  (`account_creation: false`). Users must already have funded Stellar
  accounts.

---

## References

- [SEP-24 Specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md)
- [SEP-12 Specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0012.md)
- [SEP-10 Specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md)
- [SEP-9 Standard KYC Fields](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0009.md)
- [Stellar Anchor Platform Docs](https://developers.stellar.org/docs/platforms/anchor-platform)
- [Stellar Demo Wallet](https://demo-wallet.stellar.org)
- [Anchor Test Suite](https://anchor-tests.stellar.org)
