import type { WebhookEventCode } from "@finlink/shared";
import { WEBHOOK_TYPES } from "@finlink/shared";
import { prisma } from "../db.js";
import { getWebhookQueue } from "../jobs/queue.js";
import { config } from "../config.js";
import { hmacSha256Hex } from "../utils/crypto.js";

export interface FireWebhookArgs {
  applicationId: string;
  itemId?: string;
  code: WebhookEventCode;
  extra?: Record<string, unknown>;
}

export async function fireWebhook({ applicationId, itemId, code, extra = {} }: FireWebhookArgs) {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) return null;

  const payload = {
    webhook_type: WEBHOOK_TYPES[code],
    webhook_code: code,
    item_id: itemId ?? null,
    environment: config.ENVIRONMENT,
    ...extra,
  };

  const event = await prisma.webhookEvent.create({
    data: {
      applicationId,
      itemId: itemId ?? null,
      webhookType: payload.webhook_type,
      webhookCode: code,
      payload: payload as unknown as object,
      url: app.webhookUrl,
      status: app.webhookUrl ? "PENDING" : "FAILED", // no URL → mark as FAILED but record
    },
  });

  if (app.webhookUrl) {
    const queue = getWebhookQueue();
    await queue.add(
      "deliver",
      { eventId: event.id },
      { attempts: 1, removeOnComplete: true, removeOnFail: true },
    );
  } else {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        lastResponse: { reason: "no webhook_url configured" } as object,
      },
    });
  }
  return event;
}

export function signWebhookBody(secret: string, body: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = hmacSha256Hex(secret, `${ts}.${body}`);
  return `t=${ts}, v1=${sig}`;
}

/**
 * Rebuilds signable string + signs using the app's secret (plaintext not stored,
 * so in sandbox we use WEBHOOK_SIGNING_SECRET). Real systems would store an HMAC
 * key separate from the bcrypt'd client_secret.
 */
export function defaultSignWebhookBody(body: string): string {
  return signWebhookBody(config.WEBHOOK_SIGNING_SECRET, body);
}
