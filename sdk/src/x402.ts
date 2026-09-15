/**
 * Truvo SDK - x402 Payment Client
 *
 * Implements the client side of the x402 payment flow:
 * 1. Calls a x402-protected endpoint
 * 2. Receives the 402 response
 * 3. Constructs and submits the required Stellar payment
 * 4. Retries the original request with valid payment proof attached
 *
 * This enables autonomous agents to pay for API access without human intervention.
 */

import {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  rpc as SorobanRpc,
  Transaction,
} from "@stellar/stellar-sdk";

// ============================================================================
// x402 Types (based on x402 V2 specification)
// ============================================================================

export interface PaymentRequired {
  x402Version: number;
  error: string;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepts: Array<{
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
  }>;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signedTxXdr: string;
    sourceAccount: string;
    amount: string;
    destination: string;
    asset: string;
    validUntilLedger: number;
    nonce: string;
  };
}

export interface SettlementResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
}

export interface X402ClientConfig {
  /** Stellar secret key for signing payments */
  secretKey: string;
  /** Network passphrase */
  networkPassphrase?: string;
  /** Horizon URL for account queries */
  horizonUrl?: string;
  /** Maximum number of retry attempts */
  maxRetries?: number;
}

// ============================================================================
// x402 Client
// ============================================================================

/**
 * Client for handling x402 payment flows
 *
 * Enables autonomous agents to pay for x402-protected resources without
 * human intervention. The client automatically handles the 402 response,
 * constructs the payment, and retries the request.
 */
export class X402Client {
  private readonly keypair: Keypair;
  private readonly networkPassphrase: string;
  private readonly horizonUrl: string;
  private readonly maxRetries: number;
  private readonly rpcServer: SorobanRpc.Server;

  constructor(config: X402ClientConfig) {
    this.keypair = Keypair.fromSecret(config.secretKey);
    this.networkPassphrase = config.networkPassphrase || Networks.TESTNET;
    this.horizonUrl = config.horizonUrl || "https://horizon-testnet.stellar.org";
    this.maxRetries = config.maxRetries || 3;
    this.rpcServer = new SorobanRpc.Server("https://soroban-testnet.stellar.org");
  }

  /**
   * The public key of the configured account
   */
  get publicKey(): string {
    return this.keypair.publicKey();
  }

  /**
   * Make a request to an x402-protected endpoint
   *
   * Automatically handles 402 responses by constructing and submitting
   * the required payment, then retrying the original request.
   *
   * @param url - The URL to request
   * @param options - Fetch options (method, headers, body, etc.)
   * @returns The response from the endpoint
   */
  async fetchWithPayment(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Make the initial request
        const response = await fetch(url, options);

        // If not a 402, return the response directly
        if (response.status !== 402) {
          return response;
        }

        // Parse the 402 response
        const paymentRequired = await this.parsePaymentRequired(response);

        // Select a payment requirement
        const paymentRequirement = this.selectPaymentRequirement(paymentRequired);

        // Create and sign the payment transaction
        const paymentPayload = await this.createPaymentPayload(paymentRequirement);

        // Retry the request with the payment signature
        const retryResponse = await this.retryWithPayment(url, options, paymentPayload);

        // If still 402, payment verification failed
        if (retryResponse.status === 402) {
          const settlementResponse = await this.parseSettlementResponse(retryResponse);
          if (!settlementResponse.success) {
            throw new Error(`Payment failed: ${settlementResponse.errorReason}`);
          }
        }

        return retryResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this was the last attempt, throw the error
        if (attempt === this.maxRetries) {
          throw lastError;
        }

        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Parse the PAYMENT-REQUIRED header from a 402 response
   */
  private async parsePaymentRequired(response: Response): Promise<PaymentRequired> {
    const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");

    if (!paymentRequiredHeader) {
      throw new Error("Missing PAYMENT-REQUIRED header in 402 response");
    }

    try {
      const decoded = Buffer.from(paymentRequiredHeader, "base64").toString();
      return JSON.parse(decoded) as PaymentRequired;
    } catch (error) {
      throw new Error(`Failed to parse PAYMENT-REQUIRED header: ${error}`);
    }
  }

  /**
   * Parse the PAYMENT-RESPONSE header from a response
   */
  private async parseSettlementResponse(response: Response): Promise<SettlementResponse> {
    const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");

    if (!paymentResponseHeader) {
      throw new Error("Missing PAYMENT-RESPONSE header");
    }

    try {
      const decoded = Buffer.from(paymentResponseHeader, "base64").toString();
      return JSON.parse(decoded) as SettlementResponse;
    } catch (error) {
      throw new Error(`Failed to parse PAYMENT-RESPONSE header: ${error}`);
    }
  }

  /**
   * Select a payment requirement from the accepts array
   *
   * Chooses the first requirement that matches our capabilities
   */
  private selectPaymentRequirement(paymentRequired: PaymentRequired): PaymentRequired["accepts"][0] {
    if (!paymentRequired.accepts || paymentRequired.accepts.length === 0) {
      throw new Error("No payment requirements provided");
    }

    // For now, select the first requirement
    // In production, this would filter based on supported schemes and networks
    return paymentRequired.accepts[0];
  }

  /**
   * Create a signed payment payload for the given requirement
   */
  private async createPaymentPayload(
    paymentRequirement: PaymentRequired["accepts"][0]
  ): Promise<PaymentPayload> {
    // Get the source account
    const sourceAccount = await this.rpcServer.getAccount(this.keypair.publicKey());

    // Get the current ledger sequence for validUntilLedger
    const latestLedger = await this.rpcServer.getLatestLedger();
    const validUntilLedger = latestLedger.sequence + 100; // Valid for 100 ledgers

    // Create the payment transaction
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: "100000", // 0.01 XLM fee
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: paymentRequirement.payTo,
          asset: paymentRequirement.asset === "native"
            ? Asset.native()
            : new Asset(paymentRequirement.asset, paymentRequirement.payTo),
          amount: paymentRequirement.amount,
        })
      )
      .setTimeout(300) // 5 minutes
      .build();

    // Sign the transaction
    transaction.sign(this.keypair);

    // Generate a nonce
    const nonce = crypto.randomUUID();

    // Create the payment payload
    const paymentPayload: PaymentPayload = {
      x402Version: 2,
      scheme: paymentRequirement.scheme,
      network: paymentRequirement.network,
      payload: {
        signedTxXdr: transaction.toXDR(),
        sourceAccount: this.keypair.publicKey(),
        amount: paymentRequirement.amount,
        destination: paymentRequirement.payTo,
        asset: paymentRequirement.asset,
        validUntilLedger,
        nonce,
      },
    };

    return paymentPayload;
  }

  /**
   * Retry the original request with the payment signature
   */
  private async retryWithPayment(
    url: string,
    originalOptions: RequestInit,
    paymentPayload: PaymentPayload
  ): Promise<Response> {
    // Encode the payment payload as Base64
    const paymentSignatureBase64 = Buffer.from(
      JSON.stringify(paymentPayload)
    ).toString("base64");

    // Merge the original options with the payment signature header
    const retryOptions: RequestInit = {
      ...originalOptions,
      headers: {
        ...originalOptions.headers,
        "PAYMENT-SIGNATURE": paymentSignatureBase64,
      },
    };

    // Make the retry request
    return fetch(url, retryOptions);
  }

  /**
   * Convenience method for creating a task via x402 payment
   *
   * @param serverUrl - The base URL of the x402 server
   * @param taskDetails - The task details to create
   * @returns The created task details
   */
  async createTaskWithPayment(
    serverUrl: string,
    taskDetails: {
      worker: string;
      amount: string;
      deadline: number;
    }
  ): Promise<{ success: boolean; taskId?: string; txHash?: string; error?: string }> {
    const url = `${serverUrl}/api/tasks`;

    const response = await this.fetchWithPayment(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskDetails),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      return {
        success: false,
        error: (errorData.message as string) || `HTTP ${response.status}`,
      };
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      success: true,
      taskId: data.taskId as string,
      txHash: data.txHash as string,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an x402 client from a secret key
 */
export function createX402Client(
  secretKey: string,
  options?: Partial<X402ClientConfig>
): X402Client {
  return new X402Client({
    secretKey,
    ...options,
  });
}

/**
 * Check if a response is a 402 Payment Required
 */
export function is402Response(response: Response): boolean {
  return response.status === 402;
}

/**
 * Parse the PAYMENT-REQUIRED header from a 402 response
 */
export async function parsePaymentRequired(
  response: Response
): Promise<PaymentRequired> {
  const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");

  if (!paymentRequiredHeader) {
    throw new Error("Missing PAYMENT-REQUIRED header in 402 response");
  }

  const decoded = Buffer.from(paymentRequiredHeader, "base64").toString();
  return JSON.parse(decoded) as PaymentRequired;
}
