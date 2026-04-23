import { Router } from "express";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { signDeveloperAccess, signDeveloperRefresh } from "../utils/jwt.js";
import { redis } from "../redis.js";
import { Errors } from "../utils/errors.js";

/**
 * Public (no-auth) diagnostic endpoints for the demo account.
 *
 * The existence of the demo account, the presence of its items, and
 * the presence of investment holdings tied to those items are the
 * three things that determine whether the landing's "Try the demo"
 * button produces a populated dashboard or an empty one. Rather than
 * guessing, we expose a single read-only endpoint that reports all
 * three plus the reference-data counts, so we (and anyone debugging)
 * can `curl` the backend once and see exactly what state it's in.
 */

const DEMO_EMAIL = "demo@finlink.dev";

const router = Router();

router.get("/status", async (_req, res, next) => {
  try {
    const demo = await prisma.developer.findUnique({
      where: { email: DEMO_EMAIL },
      select: { id: true, name: true, createdAt: true },
    });

    if (!demo) {
      return res.json({
        demoDeveloperExists: false,
        applicationCount: 0,
        itemCount: 0,
        investmentHoldingCount: 0,
        investmentTransactionCount: 0,
        institutionCount: await prisma.institution.count(),
        securityCount: await prisma.security.count(),
        serverTimeMs: Date.now(),
        environment: config.ENVIRONMENT,
      });
    }

    const apps = await prisma.application.findMany({
      where: { developerId: demo.id },
      select: { id: true },
    });
    const items = apps.length
      ? await prisma.item.findMany({
          where: { applicationId: { in: apps.map((a) => a.id) } },
          select: { id: true },
        })
      : [];
    const itemIds = items.map((i) => i.id);

    const [holdingsCount, investmentTxCount, institutionCount, securityCount] = await Promise.all([
      itemIds.length
        ? prisma.investmentHolding.count({ where: { account: { itemId: { in: itemIds } } } })
        : Promise.resolve(0),
      itemIds.length
        ? prisma.investmentTransaction.count({ where: { account: { itemId: { in: itemIds } } } })
        : Promise.resolve(0),
      prisma.institution.count(),
      prisma.security.count(),
    ]);

    res.json({
      demoDeveloperExists: true,
      demoDeveloperId: demo.id,
      demoCreatedAt: demo.createdAt,
      applicationCount: apps.length,
      itemCount: items.length,
      investmentHoldingCount: holdingsCount,
      investmentTransactionCount: investmentTxCount,
      institutionCount,
      securityCount,
      serverTimeMs: Date.now(),
      environment: config.ENVIRONMENT,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Issue a session for the shared demo account without a password.
 * The demo is deliberately unreachable via /api/auth/login; this is
 * the only way in, and it's used by the /demo page on the dashboard.
 */
router.post("/session", async (_req, res, next) => {
  try {
    const developer = await prisma.developer.findUnique({ where: { email: DEMO_EMAIL } });
    if (!developer) throw Errors.unauthorized("Demo account not provisioned");
    const access = signDeveloperAccess(developer.id, developer.email);
    const { token: refresh, jti } = signDeveloperRefresh(developer.id, developer.email);
    await redis.set(`refresh:${developer.id}:${jti}`, "1", "EX", 30 * 24 * 3600);
    res.json({
      developer: { id: developer.id, email: developer.email, name: developer.name },
      access_token: access,
      refresh_token: refresh,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
