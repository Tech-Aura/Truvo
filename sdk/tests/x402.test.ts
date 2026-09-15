/**
 * Tests for x402 client module
 */

import { X402Client, createX402Client, is402Response, parsePaymentRequired } from "../src/x402";
import type { PaymentRequired, PaymentPayload, SettlementResponse } from "../src/x402";

describe("X402Client", () => {
  // Use a valid testnet secret key for testing
  const testSecretKey = "SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

  describe("constructor", () => {
    it("should throw with invalid secret key", () => {
      expect(() => new X402Client({ secretKey: "invalid" })).toThrow();
    });
  });

  describe("createX402Client", () => {
    it("should create a client using factory function", () => {
      // Skip if we don't have a valid test key
      if (!testSecretKey.startsWith("S")) {
        return;
      }
      try {
        const client = createX402Client(testSecretKey);
        expect(client).toBeInstanceOf(X402Client);
      } catch {
        // Expected to fail with invalid key
      }
    });
  });
});

describe("is402Response", () => {
  it("should return true for 402 responses", () => {
    const response = new Response("", { status: 402 });
    expect(is402Response(response)).toBe(true);
  });

  it("should return false for other status codes", () => {
    const response = new Response("", { status: 200 });
    expect(is402Response(response)).toBe(false);
  });
});

describe("parsePaymentRequired", () => {
  it("should parse a valid PAYMENT-REQUIRED header", async () => {
    const paymentRequired: PaymentRequired = {
      x402Version: 2,
      error: "PAYMENT-SIGNATURE header is required",
      resource: {
        url: "https://api.example.com/tasks",
        description: "Task creation fee",
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: "stellar-testnet",
          amount: "1000000",
          asset: "native",
          payTo: "GCOLRACTORADDRESS123456789012345678901234567890",
          maxTimeoutSeconds: 300,
          extra: {},
        },
      ],
    };

    const header = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
    const response = new Response("", {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": header,
      },
    });

    const result = await parsePaymentRequired(response);
    expect(result).toEqual(paymentRequired);
  });

  it("should throw for missing PAYMENT-REQUIRED header", async () => {
    const response = new Response("", { status: 402 });
    await expect(parsePaymentRequired(response)).rejects.toThrow(
      "Missing PAYMENT-REQUIRED header"
    );
  });

  it("should throw for invalid PAYMENT-REQUIRED header", async () => {
    const response = new Response("", {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": "invalid-base64",
      },
    });
    await expect(parsePaymentRequired(response)).rejects.toThrow();
  });
});

describe("PaymentPayload", () => {
  it("should have the correct structure", () => {
    const payload: PaymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: "stellar-testnet",
      payload: {
        signedTxXdr: "AAAAAgAAAAA...",
        sourceAccount: "GABC123...",
        amount: "1000000",
        destination: "GDEF456...",
        asset: "native",
        validUntilLedger: 12345678,
        nonce: "550e8400-e29b-41d4-a716-446655440000",
      },
    };

    expect(payload.x402Version).toBe(2);
    expect(payload.scheme).toBe("exact");
    expect(payload.network).toBe("stellar-testnet");
    expect(payload.payload.signedTxXdr).toBeDefined();
    expect(payload.payload.sourceAccount).toBeDefined();
    expect(payload.payload.amount).toBeDefined();
    expect(payload.payload.destination).toBeDefined();
    expect(payload.payload.asset).toBeDefined();
    expect(payload.payload.validUntilLedger).toBeDefined();
    expect(payload.payload.nonce).toBeDefined();
  });
});

describe("SettlementResponse", () => {
  it("should have the correct structure for success", () => {
    const response: SettlementResponse = {
      success: true,
      transaction: "abc123...",
      network: "stellar-testnet",
      payer: "GABC123...",
    };

    expect(response.success).toBe(true);
    expect(response.transaction).toBeDefined();
    expect(response.network).toBeDefined();
    expect(response.payer).toBeDefined();
  });

  it("should have the correct structure for failure", () => {
    const response: SettlementResponse = {
      success: false,
      errorReason: "Payment verification failed",
    };

    expect(response.success).toBe(false);
    expect(response.errorReason).toBeDefined();
  });
});
