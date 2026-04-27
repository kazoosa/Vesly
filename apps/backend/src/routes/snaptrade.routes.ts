import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { requireDeveloper } from "../middleware/authJwt.js";
import { prisma } from "../db.js";
import { Errors } from "../utils/errors.js";
import { config } from "../config.js";
import {
  isSnapTradeConfigured,
  createConnectionPortalUrl,
  syncDeveloper,
  pollActivities,
  deleteSnapTradeConnection,
  ensureSnapTradeUser,
} from "../services/snaptradeService.js";
import { logger } from "../logger.js";

const router = Router();

/**
 * Is SnapTrade configured on the server? Frontend checks this before
 * showing the connect button for non-demo users.
 */
router.get("/status", (_req, res) => {
  res.json({ configured: isSnapTradeConfigured() });
});

/**
 * Returns a SnapTrade Connection Portal URL that the frontend opens in a popup.
 */
router.post("/connect-url", requireDeveloper, async (req, res, next) => {
  try {
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    const url = await createConnectionPortalUrl(dev, {
      customRedirect: typeof req.body?.redirect === "string" ? req.body.redirect : undefined,
    });
    res.json({ redirect_url: url });
  } catch (e) {
    next(e);
  }
});

/**
 * On-demand sync — called by the frontend after the connection portal closes
 * OR from the Accounts page "Refresh now" button.
 */
router.post("/sync", requireDeveloper, async (req, res, next) => {
  try {
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    const out = await syncDeveloper(dev);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

/**
 * Activities-only poll. The frontend background poller hits this on a
 * 2-minute cadence after a fresh connect when transactions came back
 * empty — SnapTrade's broker-side cache (especially Robinhood) takes
 * minutes to warm. Cheap to call: skips positions/options/holdings.
 */
router.post("/poll-activities", requireDeveloper, async (req, res, next) => {
  try {
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    const out = await pollActivities(dev);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

/**
 * Remove a SnapTrade connection by the connectionId stored on the Item.
 */
router.post("/disconnect", requireDeveloper, async (req, res, next) => {
  try {
    const connectionId = String(req.body?.connection_id ?? "");
    if (!connectionId) throw Errors.badRequest("connection_id required");
    const item = await prisma.item.findFirst({
      where: { snaptradeConnectionId: connectionId },
      include: { application: true },
    });
    if (!item || item.application.developerId !== req.developerId) {
      throw Errors.notFound("Connection");
    }
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    await deleteSnapTradeConnection(dev, connectionId);
    res.json({ removed: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Ensures the logged-in developer has a SnapTrade user registration.
 * Called early by the frontend to prime the relationship.
 */
router.post("/register", requireDeveloper, async (req, res, next) => {
  try {
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    const { userId } = await ensureSnapTradeUser(dev);
    res.json({ user_id: userId });
  } catch (e) {
    next(e);
  }
});

/**
 * SnapTrade webhook receiver.
 * Verifies HMAC-SHA256 signature over the sorted-keys JSON body.
 * Reference: https://docs.snaptrade.com/docs/webhooks
 */
router.post("/webhooks", async (req: Request, res: Response, next) => {
  try {
    const secret = config.SNAPTRADE_WEBHOOK_SECRET;
    if (!secret) {
      logger.warn("SNAPTRADE_WEBHOOK_SECRET not set — webhook ignored");
      return res.status(503).json({ error: "webhook secret not configured" });
    }

    const signature = String(req.headers["signature"] ?? req.headers["Signature"] ?? "");
    if (!signature) return res.status(401).json({ error: "missing signature" });

    // Reconstruct the signable string: sorted-keys JSON of the payload
    const sorted = sortedStringify(req.body);
    const digest = crypto.createHmac("sha256", secret).update(sorted).digest("base64");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
      logger.warn({ signature }, "bad SnapTrade webhook signature");
      return res.status(401).json({ error: "bad signature" });
    }

    const payload = req.body as {
      eventType?: string;
      userId?: string;
      brokerageAuthorizationId?: string;
      accountId?: string;
    };
    logger.info({ event: payload.eventType, userId: payload.userId }, "SnapTrade webhook");

    // On any holdings/transactions/connection event, trigger a full sync for that user
    const triggerEvents = new Set([
      "CONNECTION_ADDED",
      "CONNECTION_UPDATED",
      "CONNECTION_FIXED",
      "ACCOUNT_HOLDINGS_UPDATED",
      "ACCOUNT_TRANSACTIONS_INITIAL_UPDATE",
      "ACCOUNT_TRANSACTIONS_UPDATED",
      "NEW_ACCOUNT_AVAILABLE",
    ]);
    if (payload.eventType && triggerEvents.has(payload.eventType) && payload.userId) {
      const dev = await prisma.developer.findUnique({
        where: { snaptradeUserId: payload.userId },
      });
      if (dev) {
        // Fire-and-forget sync (don't block webhook response)
        void syncDeveloper(dev).catch((err) =>
          logger.error({ err, developerId: dev.id }, "webhook-triggered sync failed"),
        );
      }
    }

    res.status(200).json({ received: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Canonical (sorted-keys) JSON stringify, used for HMAC signatures.
 */
function sortedStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((v) => sortedStringify(v)).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ":" + sortedStringify((obj as Record<string, unknown>)[k]),
  );
  return "{" + parts.join(",") + "}";
}

export default router;
