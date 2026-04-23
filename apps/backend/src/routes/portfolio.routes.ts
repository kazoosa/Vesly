import { Router } from "express";
import { requireDeveloper } from "../middleware/authJwt.js";
import {
  getPortfolioSummary,
  getPortfolioHoldings,
  getPortfolioTransactions,
  getPortfolioDividends,
  getPortfolioAllocation,
  getConnectedAccounts,
  getPortfolioBySymbol,
  ensureUserApplicationAndLinkToken,
} from "../services/portfolioService.js";
import { prisma } from "../db.js";
import { Errors } from "../utils/errors.js";
import { deleteItem } from "../services/itemService.js";
import { verifyPublicToken } from "../utils/jwt.js";
import { createItemFromSession } from "../services/itemService.js";
import { redis } from "../redis.js";

const router = Router();
router.use(requireDeveloper);

router.get("/summary", async (req, res, next) => {
  try {
    res.json(await getPortfolioSummary(req.developerId!));
  } catch (e) {
    next(e);
  }
});

/**
 * Populates the logged-in user's account with a realistic mock portfolio
 * (4 brokerages, ~30 holdings, transactions, dividends). Idempotent.
 */
router.post("/seed-demo", async (req, res, next) => {
  try {
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    const { seedDemoPortfolioForDeveloper } = await import(
      "../services/demoSeedService.js"
    );
    const t0 = Date.now();
    console.log(`[seed-demo] start developer=${dev.email}`);
    const out = await seedDemoPortfolioForDeveloper(dev.id, dev.email);
    console.log(
      `[seed-demo] done developer=${dev.email} created=${out.created} items=${out.itemCount} in ${Date.now() - t0}ms`,
    );
    res.json(out);
  } catch (e) {
    console.error("[seed-demo] failed", e);
    next(e);
  }
});

/**
 * Wipes all mock items (those without a snaptradeConnectionId) for the logged-in
 * user. Safe to call before connecting real SnapTrade brokerages to avoid mixing
 * mock and real data.
 */
router.post("/wipe-demo", async (req, res, next) => {
  try {
    const apps = await prisma.application.findMany({
      where: { developerId: req.developerId! },
      select: { id: true },
    });
    const appIds = apps.map((a: { id: string }) => a.id);
    if (appIds.length === 0) return res.json({ removed: 0 });

    const mockItems = await prisma.item.findMany({
      where: { applicationId: { in: appIds }, snaptradeConnectionId: null },
      select: { id: true },
    });
    if (mockItems.length === 0) return res.json({ removed: 0 });

    await prisma.item.deleteMany({
      where: { id: { in: mockItems.map((i: { id: string }) => i.id) } },
    });
    res.json({ removed: mockItems.length });
  } catch (e) {
    next(e);
  }
});

router.get("/holdings", async (req, res, next) => {
  try {
    res.json(await getPortfolioHoldings(req.developerId!));
  } catch (e) {
    next(e);
  }
});

router.get("/transactions", async (req, res, next) => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const ticker = typeof req.query.ticker === "string" ? req.query.ticker : undefined;
    const count = Math.min(500, Number(req.query.count ?? 200));
    const offset = Number(req.query.offset ?? 0);
    res.json(await getPortfolioTransactions(req.developerId!, { type, ticker, count, offset }));
  } catch (e) {
    next(e);
  }
});

router.get("/dividends", async (req, res, next) => {
  try {
    res.json(await getPortfolioDividends(req.developerId!));
  } catch (e) {
    next(e);
  }
});

router.get("/allocation", async (req, res, next) => {
  try {
    res.json(await getPortfolioAllocation(req.developerId!));
  } catch (e) {
    next(e);
  }
});

router.get("/accounts", async (req, res, next) => {
  try {
    res.json(await getConnectedAccounts(req.developerId!));
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/portfolio/by-symbol/:symbol — single-shot aggregate for the
 * Stocks page detail view. Position, closed-lot FIFO P/L, win stats,
 * dividend calendar, held-in breakdown, and activity feed — all in one
 * payload so the right rail renders without a waterfall.
 */
router.get("/by-symbol/:symbol", async (req, res, next) => {
  try {
    const raw = String(req.params.symbol ?? "").trim();
    if (!raw) {
      return res.status(400).json({
        error_type: "VALIDATION_ERROR",
        error_message: "Missing symbol",
      });
    }
    res.json(await getPortfolioBySymbol(req.developerId!, raw));
  } catch (e) {
    next(e);
  }
});

/**
 * Creates a link_token for the current user — used by the "Connect brokerage" button.
 */
router.post("/connect-token", async (req, res, next) => {
  try {
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();

    // Demo account → keep the mock FinLink modal
    if (dev.email === "demo@finlink.dev") {
      const { linkToken, expiration } = await ensureUserApplicationAndLinkToken(dev.id, dev.email);
      return res.json({ mode: "mock", link_token: linkToken, expiration });
    }

    // Real account → SnapTrade portal
    const { createConnectionPortalUrl, isSnapTradeConfigured } = await import(
      "../services/snaptradeService.js"
    );
    if (!isSnapTradeConfigured()) {
      return res.json({
        mode: "unconfigured",
        message:
          "SnapTrade is not configured on the server. Ask the admin to set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY.",
      });
    }
    const redirectUrl = await createConnectionPortalUrl(dev);
    res.json({ mode: "snaptrade", redirect_url: redirectUrl });
  } catch (e) {
    next(e);
  }
});

/**
 * Exchanges a public_token for an Item (consumer-facing exchange).
 * Unlike /api/link/token/exchange which returns the raw access_token, this keeps the
 * access_token server-side and just returns the item_id.
 */
router.post("/exchange", async (req, res, next) => {
  try {
    const publicToken = String(req.body?.public_token ?? "");
    if (!publicToken) throw Errors.invalidPublicToken();
    let claims;
    try {
      claims = verifyPublicToken(publicToken);
    } catch {
      throw Errors.invalidPublicToken();
    }
    const consumeKey = `pt:${claims.jti}`;
    const ok = await redis.set(consumeKey, "1", "EX", 3600, "NX");
    if (!ok) throw Errors.invalidPublicToken();

    const session = await prisma.linkSession.findUnique({
      where: { publicTokenJti: claims.jti },
      include: { application: true },
    });
    if (!session) throw Errors.invalidPublicToken();
    if (session.application.developerId !== req.developerId)
      throw Errors.forbidden("Not your session");
    if (!session.institutionId) throw Errors.badRequest("Session missing institution");

    const { itemId } = await createItemFromSession({
      applicationId: session.applicationId,
      institutionId: session.institutionId,
      clientUserId: session.clientUserId,
      products: session.products,
      selectedAccountIds: session.selectedAccountIds,
    });
    await prisma.linkSession.update({
      where: { id: session.id },
      data: { publicTokenConsumed: true, itemId },
    });
    res.json({ item_id: itemId });
  } catch (e) {
    next(e);
  }
});

/**
 * Disconnect a brokerage (delete the Item and all its data).
 */
router.delete("/accounts/:itemId", async (req, res, next) => {
  try {
    const item = await prisma.item.findFirst({
      where: { id: req.params.itemId },
      include: { application: true },
    });
    if (!item) throw Errors.notFound("Item");
    if (item.application.developerId !== req.developerId)
      throw Errors.forbidden("Not your account");

    // If this item is backed by a real SnapTrade connection, revoke it there too.
    if (item.snaptradeConnectionId) {
      const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
      if (dev) {
        const { deleteSnapTradeConnection } = await import("../services/snaptradeService.js");
        try {
          await deleteSnapTradeConnection(dev, item.snaptradeConnectionId);
        } catch (err) {
          // Swallow SnapTrade errors so the local item still gets removed
          console.warn("[disconnect] SnapTrade revoke failed:", (err as Error).message);
        }
      }
    }
    await deleteItem(item.id);
    res.json({ removed: true });
  } catch (e) {
    next(e);
  }
});

export default router;
