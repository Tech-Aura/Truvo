/**
 * Truvo Autonomous Demo Agent
 *
 * A standalone TypeScript script that demonstrates fully autonomous operation:
 * 1. Monitors a queue of pending tasks (from a local JSON file)
 * 2. For each task, uses the x402 flow to pay for and create an escrowed task
 * 3. Operates without any human triggering it
 *
 * This proves the agent can discover work, pay autonomously, and create
 * escrows end to end.
 *
 * Usage:
 *   npx tsx src/agent.ts
 *
 * The agent will:
 *   - Read pending tasks from tasks-queue.json
 *   - For each task, call the x402-protected endpoint
 *   - Automatically handle the 402 response and payment flow
 *   - Update the queue with results
 */

import { Keypair, Networks } from "@stellar/stellar-sdk";
import { X402Client } from "../../sdk/src/x402";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Configuration
// ============================================================================

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";
const QUEUE_FILE = process.env.QUEUE_FILE || "tasks-queue.json";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);

// For demo purposes, use a testnet account
// In production, this would be a real funded account
const TESTNET_SECRET_KEY = process.env.TESTNET_SECRET_KEY || 
  "SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

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
 * Process a single pending task using the x402 payment flow
 */
async function processTask(
  client: X402Client,
  task: PendingTask
): Promise<PendingTask> {
  console.log(`\n🔄 Processing task ${task.id}...`);
  console.log(`   Worker: ${task.worker}`);
  console.log(`   Amount: ${task.amount} XLM`);
  console.log(`   Deadline: ${new Date(task.deadline * 1000).toISOString()}`);

  // Mark as processing
  task.status = "processing";
  task.updatedAt = new Date().toISOString();

  try {
    // Use the x402 client to create the task
    const result = await client.createTaskWithPayment(SERVER_URL, {
      worker: task.worker,
      amount: task.amount,
      deadline: task.deadline,
    });

    if (result.success) {
      console.log(`✅ Task ${task.id} created successfully!`);
      console.log(`   Task ID: ${result.taskId}`);
      console.log(`   TX Hash: ${result.txHash}`);

      task.status = "completed";
      task.txHash = result.txHash;
    } else {
      console.error(`❌ Task ${task.id} failed: ${result.error}`);

      task.status = "failed";
      task.error = result.error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Task ${task.id} error: ${errorMessage}`);

    task.status = "failed";
    task.error = errorMessage;
  }

  task.updatedAt = new Date().toISOString();
  return task;
}

/**
 * Process all pending tasks in the queue
 */
async function processPendingTasks(client: X402Client): Promise<number> {
  const queue = loadQueue();
  const pendingTasks = queue.tasks.filter(t => t.status === "pending");

  if (pendingTasks.length === 0) {
    console.log("No pending tasks to process.");
    return 0;
  }

  console.log(`\n📋 Found ${pendingTasks.length} pending task(s) to process.`);

  let processedCount = 0;
  for (const task of pendingTasks) {
    await processTask(client, task);
    processedCount++;

    // Small delay between tasks to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
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
  console.log("");

  // Create sample tasks for demonstration
  createSampleTasks();

  // Initialize the x402 client
  let client: X402Client;
  try {
    client = new X402Client({
      secretKey: TESTNET_SECRET_KEY,
      networkPassphrase: Networks.TESTNET,
      maxRetries: 3,
    });
    console.log(`✅ Agent initialized with public key: ${client.publicKey}`);
  } catch (error) {
    console.error("❌ Failed to initialize x402 client:", error);
    console.log("\n💡 To run this agent, set the TESTNET_SECRET_KEY environment variable:");
    console.log("   export TESTNET_SECRET_KEY=S...");
    console.log("\n   You can generate a testnet account with:");
    console.log("   curl https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>");
    return;
  }

  console.log("\n🚀 Starting agent loop...");
  console.log("   Press Ctrl+C to stop.\n");

  // Main loop
  let iteration = 0;
  while (true) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration} - ${new Date().toISOString()}`);

    try {
      const processedCount = await processPendingTasks(client);
      
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
