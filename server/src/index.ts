/**
 * Truvo x402 Payment Server
 *
 * Implements the server side of the x402 payment flow for task creation.
 * When called without payment, responds with HTTP 402 Payment Required
 * plus the payment details an agent needs. When called with valid payment
 * proof, proceeds to create the escrowed task.
 */

import express from "express";
import { 
  Keypair, 
  Networks, 
  TransactionBuilder, 
  Operation, 
  Asset,
  rpc as SorobanRpc,
  Contract,
  Address,
  xdr
} from "@stellar/stellar-sdk";
import { Mppx as MppxServer, Store } from "mppx/server";
import { stellar } from "@stellar/mpp/channel/server";

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 3001;
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
const HORIZON_URL = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const TASK_CREATION_FEE = process.env.TASK_CREATION_FEE || "1000000"; // 1 XLM in stroops (7 decimals)
const TASK_CREATION_FEE_DISPLAY = "0.1 XLM"; // Display amount

// Payment recipient (Truvo treasury)
const PAYMENT_RECIPIENT = process.env.PAYMENT_RECIPIENT || "GCOLRACTORADDRESS123456789012345678901234567890";

// MPP Session (Channel) configuration
const MPP_CHANNEL_CONTRACT = process.env.MPP_CHANNEL_CONTRACT; // C... (56 chars)
const MPP_COMMITMENT_PUBKEY = process.env.MPP_COMMITMENT_PUBKEY; // 64-char hex ed25519 public key
const MPP_SECRET_KEY = process.env.MPP_SECRET_KEY; // Shared secret for MPP credential verification
const MPP_PER_REQUEST_FEE = process.env.MPP_PER_REQUEST_FEE || "1000000"; // 0.1 XLM in stroops

// ============================================================================
// x402 Types (based on x402 V2 specification)
// ============================================================================

interface PaymentRequired {
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

interface PaymentPayload {
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

interface SettlementResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create the x402 Payment Required response object
 */
function createPaymentRequired(
  requestUrl: string,
  description: string = "Truvo task creation fee"
): PaymentRequired {
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: requestUrl,
      description,
      mimeType: "application/json"
    },
    accepts: [
      {
        scheme: "exact",
        network: "stellar-testnet",
        amount: TASK_CREATION_FEE,
        asset: "native",
        payTo: PAYMENT_RECIPIENT,
        maxTimeoutSeconds: 300,
        extra: {
          feeSponsorship: false
        }
      }
    ]
  };
}

/**
 * Verify the x402 payment signature
 * In production, this would use a facilitator or verify the transaction on-chain
 */
async function verifyPayment(paymentPayload: PaymentPayload): Promise<boolean> {
  try {
    // Decode the signed transaction
    const txXdr = paymentPayload.payload.signedTxXdr;
    const networkPassphrase = paymentPayload.network === "stellar-testnet" 
      ? Networks.TESTNET 
      : Networks.PUBLIC;
    
    // In production, we would:
    // 1. Decode the XDR transaction
    // 2. Verify the signature
    // 3. Check the transaction details match the payment requirements
    // 4. Submit the transaction via a facilitator
    
    // For demo purposes, we'll accept valid-looking payloads
    console.log(`Verifying payment from ${paymentPayload.payload.sourceAccount}`);
    console.log(`Amount: ${paymentPayload.payload.amount} stroops`);
    console.log(`Destination: ${paymentPayload.payload.destination}`);
    
    // Simple validation
    if (!txXdr || !paymentPayload.payload.sourceAccount) {
      return false;
    }
    
    // In production, verify the transaction is valid and hasn't been submitted
    return true;
  } catch (error) {
    console.error("Payment verification failed:", error);
    return false;
  }
}

/**
 * Create a task in the Truvo escrow contract
 */
async function createTask(
  taskId: string,
  payer: string,
  worker: string,
  amount: string,
  deadline: number
): Promise<{ success: boolean; taskId: string; txHash?: string; error?: string }> {
  try {
    // In production, this would call the Truvo escrow contract
    // For demo purposes, we'll simulate the task creation
    
    console.log(`Creating task ${taskId}`);
    console.log(`Payer: ${payer}, Worker: ${worker}`);
    console.log(`Amount: ${amount}, Deadline: ${deadline}`);
    
    // Simulate successful task creation
    return {
      success: true,
      taskId,
      txHash: `simulated_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  } catch (error) {
    return {
      success: false,
      taskId,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// ============================================================================
// MPP Channel Server (Session)
// ============================================================================

let mppChannel: any = null;

if (MPP_CHANNEL_CONTRACT && MPP_COMMITMENT_PUBKEY && MPP_SECRET_KEY) {
  // Convert hex commitment pubkey to Stellar G... address
  const commitmentPublicKeyG = "G" + Buffer.from(MPP_COMMITMENT_PUBKEY, "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "").replace(/=+$/, "");

  mppChannel = MppxServer.create({
    secretKey: MPP_SECRET_KEY,
    methods: [
      stellar.channel({
        channel: MPP_CHANNEL_CONTRACT,
        commitmentKey: commitmentPublicKeyG,
        store: Store.memory(),
        network: "stellar:testnet",
      }),
    ],
  });

  console.log("✅ MPP Session (Channel) server initialized");
  console.log(`   Channel: ${MPP_CHANNEL_CONTRACT}`);
  console.log(`   Commitment key: ${commitmentPublicKeyG}`);
  console.log(`   Per-request fee: ${MPP_PER_REQUEST_FEE} stroops`);
} else {
  console.log("⚠️  MPP Session (Channel) not configured — x402 only");
  console.log("   Set MPP_CHANNEL_CONTRACT, MPP_COMMITMENT_PUBKEY, and MPP_SECRET_KEY");
}

// ============================================================================
// Express Server
// ============================================================================

const app = express();
app.use(express.json());

// ============================================================================
// Middleware: x402 Payment Check
// ============================================================================

/**
 * Middleware that checks for x402 payment signature
 * Returns 402 if no valid payment is provided
 */
function requirePayment(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const paymentSignatureHeader = req.headers["payment-signature"];
  
  if (!paymentSignatureHeader) {
    // No payment provided - return 402 with payment requirements
    const paymentRequired = createPaymentRequired(
      `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      "Truvo task creation fee"
    );
    
    // Set the PAYMENT-REQUIRED header (Base64-encoded JSON)
    const paymentRequiredBase64 = Buffer.from(
      JSON.stringify(paymentRequired)
    ).toString("base64");
    
    res.setHeader("PAYMENT-REQUIRED", paymentRequiredBase64);
    res.status(402).json({
      error: "Payment required",
      message: "This endpoint requires an x402 payment. See PAYMENT-REQUIRED header for details."
    });
    return;
  }
  
  // Payment signature provided - verify it
  try {
    const headerValue = Array.isArray(paymentSignatureHeader) ? paymentSignatureHeader[0] : paymentSignatureHeader;
    const paymentPayload: PaymentPayload = JSON.parse(
      Buffer.from(headerValue, "base64").toString()
    );
    
    // Store the parsed payment payload for later use
    (req as any).paymentPayload = paymentPayload;
    next();
  } catch (error) {
    res.status(400).json({
      error: "Invalid payment signature",
      message: "The PAYMENT-SIGNATURE header contains invalid JSON"
    });
  }
}

// ============================================================================
// MPP Session (Channel) Middleware
// ============================================================================

/**
 * Middleware that handles MPP channel (session) payments.
 * If MPP is configured, intercepts 402 challenges and handles them
 * via the MPP channel server. Falls back to x402 if MPP is not configured.
 */
async function requireMppOrX402(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // If MPP channel server is not configured, fall back to x402
  if (!mppChannel) {
    return requirePayment(req, res, next);
  }

  // Check if the request includes an MPP credential
  const mppCredential = req.headers["x-mpp-credential"];

  if (mppCredential) {
    // Handle MPP channel payment
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue;
        if (Array.isArray(value)) {
          for (const entry of value) {
            headers.append(key, entry);
          }
        } else {
          headers.set(key, value);
        }
      }

      const webReq = new Request(`http://localhost:${PORT}${req.url}`, {
        method: req.method,
        headers,
        body: req.method !== "GET" && req.method !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined,
      });

      const result = await mppChannel.channel({
        amount: (parseInt(MPP_PER_REQUEST_FEE) / 10000000).toString(), // Convert stroops to XLM
        description: "Truvo task creation fee",
      })(webReq);

      if (result.status === 402) {
        const challenge = result.challenge;
        challenge.headers.forEach((value: string, key: string) => res.setHeader(key, value));
        return res.status(402).send(await challenge.text());
      }

      // MPP payment verified — proceed to task creation
      (req as any).mppVerified = true;
      (req as any).mppFunder = mppCredential;
      next();
    } catch (error) {
      console.error("MPP channel verification failed:", error);
      return requirePayment(req, res, next);
    }
  } else {
    // No MPP credential — fall back to x402
    return requirePayment(req, res, next);
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "Truvo x402 Payment Server",
    version: "0.1.0",
    mppEnabled: !!mppChannel
  });
});

/**
 * POST /api/tasks - Create a new task (x402 protected)
 * 
 * When called without payment, responds with HTTP 402 Payment Required
 * plus the payment details in the PAYMENT-REQUIRED header.
 * 
 * When called with valid payment proof, creates the escrowed task.
 */
app.post("/api/tasks", requireMppOrX402, async (req, res) => {
  try {
    const paymentPayload: PaymentPayload = (req as any).paymentPayload;
    
    // Verify the payment
    const isValid = await verifyPayment(paymentPayload);
    
    if (!isValid) {
      // Payment verification failed - return settlement response
      const settlementResponse: SettlementResponse = {
        success: false,
        errorReason: "Payment verification failed"
      };
      
      const settlementBase64 = Buffer.from(
        JSON.stringify(settlementResponse)
      ).toString("base64");
      
      res.setHeader("PAYMENT-RESPONSE", settlementBase64);
      res.status(402).json({
        error: "Payment verification failed",
        message: "The provided payment could not be verified"
      });
      return;
    }
    
    // Payment verified - create the task
    const { worker, amount, deadline } = req.body;
    
    if (!worker || !amount || !deadline) {
      res.status(400).json({
        error: "Missing required fields",
        message: "Worker address, amount, and deadline are required"
      });
      return;
    }
    
    // Generate a task ID
    const taskId = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    
    // Create the task in the escrow contract
    const result = await createTask(
      taskId,
      paymentPayload.payload.sourceAccount,
      worker,
      amount,
      deadline
    );
    
    if (result.success) {
      // Success - return the created task
      const settlementResponse: SettlementResponse = {
        success: true,
        transaction: result.txHash,
        network: "stellar-testnet",
        payer: paymentPayload.payload.sourceAccount
      };
      
      const settlementBase64 = Buffer.from(
        JSON.stringify(settlementResponse)
      ).toString("base64");
      
      res.setHeader("PAYMENT-RESPONSE", settlementBase64);
      res.status(201).json({
        success: true,
        taskId: result.taskId,
        txHash: result.txHash,
        message: "Task created successfully"
      });
    } else {
      // Task creation failed
      const settlementResponse: SettlementResponse = {
        success: false,
        errorReason: result.error || "Task creation failed"
      };
      
      const settlementBase64 = Buffer.from(
        JSON.stringify(settlementResponse)
      ).toString("base64");
      
      res.setHeader("PAYMENT-RESPONSE", settlementBase64);
      res.status(500).json({
        error: "Task creation failed",
        message: result.error
      });
    }
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to process task creation"
    });
  }
});

/**
 * GET /api/tasks/:taskId - Get task details (x402 protected)
 */
app.get("/api/tasks/:taskId", requirePayment, async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // In production, this would fetch from the escrow contract
    // For demo purposes, return a mock task
    res.json({
      taskId,
      status: "Created",
      message: "Task details would be fetched from escrow contract"
    });
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch task details"
    });
  }
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Truvo x402 Payment Server running on port ${PORT}`);
  console.log(`📋 Task creation fee: ${TASK_CREATION_FEE_DISPLAY}`);
  console.log(`💰 Payment recipient: ${PAYMENT_RECIPIENT}`);
  console.log(`🌐 Network: ${NETWORK_PASSPHRASE}`);
  console.log(`\n📚 API Endpoints:`);
  console.log(`   POST /api/tasks - Create a task (x402 protected)`);
  console.log(`   GET /api/tasks/:taskId - Get task details (x402 protected)`);
  console.log(`   GET /health - Health check`);
});

export default app;
