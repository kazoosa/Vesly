import { Router } from "express";
import { nanoid } from "nanoid";
import { createApplicationSchema, patchApplicationSchema } from "@finlink/shared";
import { prisma } from "../db.js";
import { hashSecret } from "../utils/crypto.js";
import { requireDeveloper } from "../middleware/authJwt.js";
import { Errors } from "../utils/errors.js";
import { fireWebhook } from "../services/webhookService.js";
import { getWebhookQueue } from "../jobs/queue.js";

const router = Router();
router.use(requireDeveloper);

function maskClientId(clientId: string) {
  if (clientId.length <= 8) return clientId;
  return clientId.slice(0, 6) + "…" + clientId.slice(-4);
}

router.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.application.findMany({
      where: { developerId: req.developerId! },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      applications: rows.map((a: typeof rows[number]) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        client_id: a.clientId,
        client_id_masked: maskClientId(a.clientId),
        webhook_url: a.webhookUrl,
        redirect_uris: a.redirectUris,
        allowed_products: a.allowedProducts,
        environment: a.environment,
        created_at: a.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createApplicationSchema.parse(req.body);
    const clientId = `cli_${nanoid(24)}`;
    const clientSecret = nanoid(40);
    const app = await prisma.application.create({
      data: {
        developerId: req.developerId!,
        name: input.name,
        description: input.description,
        clientId,
        clientSecretHash: await hashSecret(clientSecret),
        webhookUrl: input.webhook_url ?? null,
        redirectUris: input.redirect_uris,
        allowedProducts: input.allowed_products,
        environment: input.environment,
      },
    });
    res.status(201).json({
      id: app.id,
      name: app.name,
      client_id: app.clientId,
      client_secret: clientSecret, // ONLY returned on create
      webhook_url: app.webhookUrl,
      redirect_uris: app.redirectUris,
      allowed_products: app.allowedProducts,
      environment: app.environment,
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const input = patchApplicationSchema.parse(req.body);
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, developerId: req.developerId! },
    });
    if (!app) throw Errors.notFound("Application");
    const updated = await prisma.application.update({
      where: { id: app.id },
      data: {
        name: input.name ?? undefined,
        description: input.description ?? undefined,
        webhookUrl: input.webhook_url ?? undefined,
        redirectUris: input.redirect_uris ?? undefined,
        allowedProducts: input.allowed_products ?? undefined,
      },
    });
    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      client_id: updated.clientId,
      webhook_url: updated.webhookUrl,
      redirect_uris: updated.redirectUris,
      allowed_products: updated.allowedProducts,
      environment: updated.environment,
    });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, developerId: req.developerId! },
    });
    if (!app) throw Errors.notFound("Application");
    await prisma.application.delete({ where: { id: app.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/rotate-secret", async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, developerId: req.developerId! },
    });
    if (!app) throw Errors.notFound("Application");
    const clientSecret = nanoid(40);
    await prisma.application.update({
      where: { id: app.id },
      data: { clientSecretHash: await hashSecret(clientSecret) },
    });
    res.json({ client_secret: clientSecret });
  } catch (e) {
    next(e);
  }
});

/**
 * Dashboard metrics.
 */
router.get("/:id/metrics", async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, developerId: req.developerId! },
    });
    if (!app) throw Errors.notFound("Application");
    const days = Math.max(1, Math.min(90, Number(req.query.days ?? 30)));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const [itemsCount, apiCalls, webhookStats, recentEvents] = await Promise.all([
      prisma.item.count({ where: { applicationId: app.id } }),
      prisma.apiLog.groupBy({
        by: ["createdAt"],
        where: { applicationId: app.id, createdAt: { gte: since } },
        _count: true,
      }),
      prisma.webhookEvent.groupBy({
        by: ["status"],
        where: { applicationId: app.id, createdAt: { gte: since } },
        _count: true,
      }),
      prisma.webhookEvent.findMany({
        where: { applicationId: app.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // bucket api calls per day
    const calls: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      calls[d] = 0;
    }
    for (const row of apiCalls) {
      const d = row.createdAt.toISOString().slice(0, 10);
      calls[d] = (calls[d] ?? 0) + (row._count as unknown as number);
    }

    const totalWebhooks = webhookStats.reduce(
      (a: number, w: (typeof webhookStats)[number]) => a + (w._count as unknown as number),
      0,
    );
    const deliveredWebhooks =
      (webhookStats.find((w: (typeof webhookStats)[number]) => w.status === "DELIVERED")?._count as unknown as number) ?? 0;

    res.json({
      items_connected: itemsCount,
      api_calls_total: Object.values(calls).reduce((a, b) => a + b, 0),
      api_calls_by_day: Object.entries(calls).map(([date, count]) => ({ date, count })),
      webhook_success_rate: totalWebhooks === 0 ? 1 : deliveredWebhooks / totalWebhooks,
      recent_webhooks: recentEvents,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/:id/api-logs", async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, developerId: req.developerId! },
    });
    if (!app) throw Errors.notFound("Application");
    const take = Math.min(200, Number(req.query.count ?? 50));
    const skip = Number(req.query.offset ?? 0);
    const rows = await prisma.apiLog.findMany({
      where: { applicationId: app.id },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });
    res.json({ logs: rows });
  } catch (e) {
    next(e);
  }
});

router.get("/:id/webhooks", async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, developerId: req.developerId! },
    });
    if (!app) throw Errors.notFound("Application");
    const take = Math.min(200, Number(req.query.count ?? 50));
    const skip = Number(req.query.offset ?? 0);
    const rows = await prisma.webhookEvent.findMany({
      where: { applicationId: app.id },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });
    res.json({ events: rows });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/webhooks/:eventId/retry", async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, developerId: req.developerId! },
    });
    if (!app) throw Errors.notFound("Application");
    const event = await prisma.webhookEvent.findFirst({
      where: { id: req.params.eventId, applicationId: app.id },
    });
    if (!event) throw Errors.notFound("Webhook event");
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "PENDING" } });
    const queue = getWebhookQueue();
    await queue.add("deliver", { eventId: event.id }, { removeOnComplete: true, removeOnFail: true });
    res.json({ queued: true });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/webhooks/test", async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, developerId: req.developerId! },
    });
    if (!app) throw Errors.notFound("Application");
    if (!app.webhookUrl) throw Errors.badRequest("Webhook URL not configured");
    const event = await fireWebhook({
      applicationId: app.id,
      code: "ITEM_ERROR",
      extra: { test: true, message: "FinLink test webhook" },
    });
    res.json({ queued: true, event_id: event?.id });
  } catch (e) {
    next(e);
  }
});

export default router;
