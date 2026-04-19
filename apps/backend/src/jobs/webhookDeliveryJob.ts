import { prisma } from "../db.js";
import { defaultSignWebhookBody } from "../services/webhookService.js";
import { logger } from "../logger.js";

const BACKOFFS_MS = [30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const MAX_ATTEMPTS = 5;

export async function deliverWebhook(eventId: string) {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId },
    include: { application: true },
  });
  if (!event || !event.url) return;
  if (event.status === "DELIVERED") return;

  const body = JSON.stringify(event.payload);
  const signature = defaultSignWebhookBody(body);

  let status = 0;
  let responseText = "";
  try {
    const res = await fetch(event.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "FinLink-Signature": signature,
        "User-Agent": "FinLink-Webhooks/1.0",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    responseText = (await res.text()).slice(0, 2000);
  } catch (err) {
    responseText = (err as Error).message;
  }

  const ok = status >= 200 && status < 300;
  const attempts = event.attempts + 1;

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      attempts,
      status: ok ? "DELIVERED" : attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
      deliveredAt: ok ? new Date() : null,
      lastResponse: { status, body: responseText } as object,
    },
  });

  if (!ok && attempts < MAX_ATTEMPTS) {
    const { getWebhookQueue } = await import("./queue.js");
    const queue = getWebhookQueue();
    await queue.add(
      "deliver",
      { eventId: event.id },
      { delay: BACKOFFS_MS[attempts - 1] ?? 60_000, removeOnComplete: true, removeOnFail: true },
    );
    logger.info({ eventId: event.id, attempts }, "webhook delivery failed — retrying");
  } else if (ok) {
    logger.info({ eventId: event.id }, "webhook delivered");
  } else {
    logger.warn({ eventId: event.id, attempts }, "webhook delivery gave up");
  }
}
