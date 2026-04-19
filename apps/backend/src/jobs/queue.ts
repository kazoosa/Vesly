import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

let webhookQueue: Queue | null = null;
let webhookWorker: Worker | null = null;

function createConnection(): ConnectionOptions {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

export function getWebhookQueue(): Queue {
  if (!webhookQueue) {
    webhookQueue = new Queue("webhook", { connection: createConnection() });
  }
  return webhookQueue;
}

export async function startWorkers() {
  if (process.env.NODE_ENV === "test") return;
  if (webhookWorker) return;
  const { deliverWebhook } = await import("./webhookDeliveryJob.js");
  webhookWorker = new Worker(
    "webhook",
    async (job) => {
      if (job.name === "deliver") {
        await deliverWebhook((job.data as { eventId: string }).eventId);
      }
    },
    {
      connection: createConnection(),
      concurrency: 5,
    },
  );
  webhookWorker.on("failed", (_job, err) => {
    // eslint-disable-next-line no-console
    console.error("[webhook worker] job failed:", err?.message);
  });
}

export async function shutdownWorkers() {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
  }
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
  }
}
