/**
 * Truvo Autonomous Demo Agent
 *
 * A standalone TypeScript script that demonstrates fully autonomous operation:
 * 1. Monitors a queue of pending tasks (from a local JSON file)
 * 2. For batches of tasks, uses MPP session (channel) payments for efficiency
 * 3. For single tasks, falls back to per-call x402 payments
 * 4. Operates without any human triggering it
 *
 * This proves the agent can discover work, pay autonomously, and create
 * escrows end to end — with session payments for batch efficiency.
 *
 * Usage:
 *   npx tsx src/agent.ts
 *
 * The agent will:
 *   - Read pending tasks from tasks-queue.json
 *   - For batches: use MPP session (channel) payments (off-chain commitments)
 *   - For one-offs: use per-call x402 payments (on-chain per transaction)
 *   - Update the queue with results
 */

import { Keypair, Networks } from "@stellar/stellar-sdk";
import { X402Client } from "../../sdk/src/x402";
import { MppSessionClient } from "../../sdk/src/mpp-session";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Configuration
// ============================================================================

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";
const QUEUE_FILE = process.env.QUEUE_FILE || "tasks-queue.json";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);

// Batch threshold: if this many or more tasks are pending, use MPP session
const BATCH_THRESHOLD = parseInt(process.env.BATCH_THRESHOLD || "2", 10);

// For demo purposes, use testnet accounts
// In production, these would be real funded accounts
const TESTNET_SECRET_KEY = process.env.TESTNET_SECRET_KEY || 
  "SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

// MPP session commitment key (ed25519 secret for signing off-chain commitments)
// This is different from the payment key — it signs cumulative commitments
const MPP_COMMITMENT_SECRET = process.env.MPP_COMMITMENT_SECRET || "";

// ============================================================================
// Types
// ============================================================================

interface PendingTask {
  id: string;
  worker: string;
  amount: string;
  deadline: number;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  txHash?: string;
  paymentMethod?: "x402" | "mpp-session";
  createdAt: string;
  updatedAt: string;
}

interface TaskQueue {
  tasks: PendingTask[];
  lastProcessed: string;
}

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Load the task queue from the JSON file
 */
function loadQueue(): TaskQueue {
  try {
    const queuePath = path.resolve(QUEUE_FILE);
    if (fs.existsSync(queuePath)) {
      const data = fs.readFileSync(queuePath, "utf-8");
      return JSON.parse(data) as TaskQueue;
    }
  } catch (error) {
    console.error("Failed to load queue:", error);
  }

  // Return empty queue
  return {
    tasks: [],
    lastProcessed: new Date().toISOString(),
  };
}

/**
 * Save the task queue to the JSON file
 */
function saveQueue(queue: TaskQueue): void {
  try {
    const queuePath = path.resolve(QUEUE_FILE);
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  } catch (error) {
    console.error("Failed to save queue:", error);
  }
}

/**
 * Add a new task to the queue
 */
function addTaskToQueue(
  queue: TaskQueue,
  worker: string,
  amount: string,
  deadline: number
): PendingTask {
  const task: PendingTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    worker,
    amount,
    deadline,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  queue.tasks.push(task);
  return task;
}

// ============================================================================
// Agent Logic
// ============================================================================

/**
 * Process a single task using x402 payment (per-call)
 */
async function processTaskWithX402(
  x402Client: X402Client,
  task: PendingTask
): Promise<PendingTask> {
  console.log(`\n🔄 [x402] Processing task ${task.id}...`);
  console.log(`   Worker: ${task.worker}`);
  console.log(`   Amount: ${task.amount} XLM`);
  console.log(`   Deadline: ${new Date(task.deadline * 1000).toISOString()}`);

  task.status = "processing";
  task.paymentMethod = "x402";
  task.updatedAt = new Date().toISOString();

  try {
    const result = await x402Client.createTaskWithPayment(SERVER_URL, {
      worker: task.worker,
      amount: task.amount,
      deadline: task.deadline,
    });

    if (result.success) {
      console.log(`✅ [x402] Task ${task.id} created successfully!`);
      console.log(`   Task ID: ${result.taskId}`);
      console.log(`   TX Hash: ${result.txHash}`);

      task.status = "completed";
      task.txHash = result.txHash;
    } else {
      console.error(`❌ [x402] Task ${task.id} failed: ${result.error}`);

      task.status = "failed";
      task.error = result.error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [x402] Task ${task.id} error: ${errorMessage}`);

    task.status = "failed";
    task.error = errorMessage;
  }

  task.updatedAt = new Date().toISOString();
  return task;
}

/**
 * Process a batch of tasks using MPP session (channel) payment
 */
async function processBatchWithMppSession(
  mppClient: MppSessionClient,
  tasks: PendingTask[]
): Promise<PendingTask[]> {
  console.log(`\n🚀 [MPP Session] Processing batch of ${tasks.length} tasks...`);
  console.log(`   Funder: ${mppClient.publicKey}`);

  // Mark all as processing
  for (const task of tasks) {
    task.status = "processing";
    task.paymentMethod = "mpp-session";
    task.updatedAt = new Date().toISOString();
  }

  try {
    const batchResults = await mppClient.batchCreateTasks(
      SERVER_URL,
      tasks.map((t) => ({
        worker: t.worker,
        amount: t.amount,
        deadline: t.deadline,
      }))
    );

    // Map results back to tasks
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const result = batchResults[i];

      if (result.success) {
        console.log(`✅ [MPP Session] Task ${task.id} created!`);
        console.log(`   Task ID: ${result.taskId}`);

        task.status = "completed";
        task.txHash = result.txHash;
      } else {
        console.error(`❌ [MPP Session] Task ${task.id} failed: ${result.error}`);

        task.status = "failed";
        task.error = result.error;
      }

      task.updatedAt = new Date().toISOString();
    }

    // Log session summary
    const summary = mppClient.getSummary();
    console.log(`\n📊 [MPP Session] Batch complete:`);
    console.log(`   Requests: ${summary.requestCount}`);
    console.log(`   Cumulative committed: ${summary.cumulativeAmount} base units`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [MPP Session] Batch error: ${errorMessage}`);

    // Mark all remaining tasks as failed
    for (const task of tasks) {
      if (task.status === "processing") {
        task.status = "failed";
        task.error = errorMessage;
        task.updatedAt = new Date().toISOString();
      }
    }
  }

  return tasks;
}

/**
 * Process all pending tasks in the queue
 */
async function processPendingTasks(
  x402Client: X402Client,
  mppClient: MppSessionClient | null
): Promise<number> {
  const queue = loadQueue();
  const pendingTasks = queue.tasks.filter(t => t.status === "pending");

  if (pendingTasks.length === 0) {
    console.log("No pending tasks to process.");
    return 0;
  }

  console.log(`\n📋 Found ${pendingTasks.length} pending task(s) to process.`);

  let processedCount = 0;

  // Decide payment strategy: batch vs individual
  if (mppClient && pendingTasks.length >= BATCH_THRESHOLD) {
    // Use MPP session for batch processing
    console.log(`   → Using MPP session for batch (${pendingTasks.length} >= ${BATCH_THRESHOLD} threshold)`);

    await processBatchWithMppSession(mppClient, pendingTasks);
    processedCount = pendingTasks.length;
  } else {
    // Use per-call x402 for individual tasks
    console.log(`   → Using per-call x402 ${mppClient ? `(below batch threshold of ${BATCH_THRESHOLD})` : "(MPP not configured)"}`);

    for (const task of pendingTasks) {
      await processTaskWithX402(x402Client, task);
      processedCount++;

      // Small delay between tasks to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Update the queue
  queue.lastProcessed = new Date().toISOString();
  saveQueue(queue);

  return processedCount;
}

/**
 * Create sample tasks for demonstration
 */
function createSampleTasks(): void {
  const queue = loadQueue();

  // Add some sample tasks if queue is empty
  if (queue.tasks.length === 0) {
    console.log("📝 Creating sample tasks for demonstration...");

    const sampleTasks = [
      {
        worker: "GABC12345678901234567890123456789012345678901234",
        amount: "10",
        deadline: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days from now
      },
      {
        worker: "GDEF98765432109876543210987654321098765432109876",
        amount: "25",
        deadline: Math.floor(Date.now() / 1000) + 86400 * 3, // 3 days from now
      },
      {
        worker: "GHIJ11111111111111111111111111111111111111111111",
        amount: "5",
        deadline: Math.floor(Date.now() / 1000) + 86400 * 1, // 1 day from now
      },
    ];

    for (const sample of sampleTasks) {
      addTaskToQueue(queue, sample.worker, sample.amount, sample.deadline);
    }

    saveQueue(queue);
    console.log(`✅ Created ${sampleTasks.length} sample tasks.`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("🤖 Truvo Autonomous Demo Agent");
  console.log("================================");
  console.log(`Server URL: ${SERVER_URL}`);
  console.log(`Queue File: ${QUEUE_FILE}`);
  console.log(`Poll Interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`Batch Threshold: ${BATCH_THRESHOLD} tasks`);
  console.log("");

  // Create sample tasks for demonstration
  createSampleTasks();

  // Initialize the x402 client (always available as fallback)
  let x402Client: X402Client;
  try {
    x402Client = new X402Client({
      secretKey: TESTNET_SECRET_KEY,
      networkPassphrase: Networks.TESTNET,
      maxRetries: 3,
    });
    console.log(`✅ x402 client initialized with public key: ${x402Client.publicKey}`);
  } catch (error) {
    console.error("❌ Failed to initialize x402 client:", error);
    console.log("\n💡 To run this agent, set the TESTNET_SECRET_KEY environment variable:");
    console.log("   export TESTNET_SECRET_KEY=S...");
    console.log("\n   You can generate a testnet account with:");
    console.log("   curl https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>");
    return;
  }

  // Initialize MPP session client (optional, for batch efficiency)
  let mppClient: MppSessionClient | null = null;
  if (MPP_COMMITMENT_SECRET) {
    try {
      mppClient = new MppSessionClient({
        commitmentKey: Keypair.fromSecret(MPP_COMMITMENT_SECRET),
        networkPassphrase: Networks.TESTNET,
        onProgress: (event) => {
          switch (event.type) {
            case "session_opened":
              console.log(`   📡 MPP session opened with funder: ${event.funder}`);
              break;
            case "commitment_signed":
              console.log(`   ✍️  Commitment signed (cumulative: ${event.cumulativeAmount})`);
              break;
            case "payment_served":
              console.log(`   💰 Payment served via channel: ${event.channel}`);
              break;
          }
        },
      });
      console.log(`✅ MPP session client initialized with commitment key: ${mppClient.publicKey}`);
    } catch (error) {
      console.warn("⚠️  Failed to initialize MPP session client:", error);
      console.log("   Falling back to per-call x402 for all tasks.");
    }
  } else {
    console.log("ℹ️  MPP session not configured (MPP_COMMITMENT_SECRET not set)");
    console.log("   Using per-call x402 for all tasks.");
  }

  console.log("\n🚀 Starting agent loop...");
  console.log("   Press Ctrl+C to stop.\n");

  // Main loop
  let iteration = 0;
  while (true) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration} - ${new Date().toISOString()}`);

    try {
      const processedCount = await processPendingTasks(x402Client, mppClient);
      
      if (processedCount > 0) {
        console.log(`\n✅ Processed ${processedCount} task(s) in this iteration.`);
      }
    } catch (error) {
      console.error("❌ Error in processing loop:", error);
    }

    // Wait before next iteration
    console.log(`\n⏳ Waiting ${POLL_INTERVAL_MS / 1000}s before next check...`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Run the agent
main().catch(console.error);
