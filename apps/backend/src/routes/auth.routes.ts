import { Router } from "express";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from "@finlink/shared";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../utils/crypto.js";
import {
  signDeveloperAccess,
  signDeveloperRefresh,
  verifyDeveloperToken,
} from "../utils/jwt.js";
import { redis } from "../redis.js";
import { Errors } from "../utils/errors.js";
import { requireDeveloper } from "../middleware/authJwt.js";

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new developer account
 */
router.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const existing = await prisma.developer.findUnique({ where: { email: input.email } });
    if (existing) throw Errors.conflict("Email already registered");
    const developer = await prisma.developer.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      },
    });

    const access = signDeveloperAccess(developer.id, developer.email);
    const { token: refresh, jti } = signDeveloperRefresh(developer.id, developer.email);
    await redis.set(`refresh:${developer.id}:${jti}`, "1", "EX", 30 * 24 * 3600);
    res.status(201).json({
      developer: { id: developer.id, email: developer.email, name: developer.name },
      access_token: access,
      refresh_token: refresh,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const developer = await prisma.developer.findUnique({ where: { email: input.email } });
    if (!developer) throw Errors.unauthorized("Invalid credentials");
    const ok = await verifyPassword(input.password, developer.passwordHash);
    if (!ok) throw Errors.unauthorized("Invalid credentials");
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

router.post("/refresh", async (req, res, next) => {
  try {
    const { refresh_token } = refreshSchema.parse(req.body);
    let claims;
    try {
      claims = verifyDeveloperToken(refresh_token);
    } catch {
      throw Errors.unauthorized("Invalid refresh token");
    }
    if (claims.type !== "refresh") throw Errors.unauthorized("Wrong token type");
    const key = `refresh:${claims.sub}:${claims.jti}`;
    const exists = await redis.get(key);
    if (!exists) throw Errors.unauthorized("Refresh token revoked");
    await redis.del(key);
    const access = signDeveloperAccess(claims.sub, claims.email);
    const { token: refresh, jti } = signDeveloperRefresh(claims.sub, claims.email);
    await redis.set(`refresh:${claims.sub}:${jti}`, "1", "EX", 30 * 24 * 3600);
    res.json({ access_token: access, refresh_token: refresh });
  } catch (e) {
    next(e);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const { refresh_token } = refreshSchema.parse(req.body);
    try {
      const claims = verifyDeveloperToken(refresh_token);
      await redis.del(`refresh:${claims.sub}:${claims.jti}`);
    } catch {
      /* ignore */
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/auth/me — current user info.
 */
router.get("/me", requireDeveloper, async (req, res, next) => {
  try {
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    res.json({
      developer: { id: dev.id, email: dev.email, name: dev.name, created_at: dev.createdAt },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH /api/auth/me — update profile (currently just name).
 */
router.patch("/me", requireDeveloper, async (req, res, next) => {
  try {
    const input = updateProfileSchema.parse(req.body);
    const dev = await prisma.developer.update({
      where: { id: req.developerId! },
      data: { name: input.name },
    });
    res.json({
      developer: { id: dev.id, email: dev.email, name: dev.name },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/auth/change-password — verifies current, rotates hash, invalidates
 * all refresh tokens for the user.
 */
router.post("/change-password", requireDeveloper, async (req, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    const ok = await verifyPassword(input.current_password, dev.passwordHash);
    if (!ok) {
      return res.status(400).json({
        error_type: "VALIDATION_ERROR",
        error_code: "WRONG_PASSWORD",
        error_message: "Current password is incorrect.",
        fields: { current_password: "Current password is incorrect" },
        request_id: req.requestId,
        environment: process.env.ENVIRONMENT ?? "sandbox",
      });
    }
    await prisma.developer.update({
      where: { id: dev.id },
      data: { passwordHash: await hashPassword(input.new_password) },
    });
    // Invalidate every refresh token for this user
    await invalidateAllRefreshTokens(dev.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/auth/sign-out-all — invalidates every refresh token across devices.
 */
router.post("/sign-out-all", requireDeveloper, async (req, res, next) => {
  try {
    await invalidateAllRefreshTokens(req.developerId!);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/auth/me — nuke the account. Requires typed-email confirmation
 * matching the logged-in user. Cascades to all applications/items/etc.
 */
router.delete("/me", requireDeveloper, async (req, res, next) => {
  try {
    const input = deleteAccountSchema.parse(req.body);
    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    if (input.confirm_email.toLowerCase() !== dev.email.toLowerCase()) {
      return res.status(400).json({
        error_type: "VALIDATION_ERROR",
        error_code: "WRONG_CONFIRMATION",
        error_message: "Type your email exactly to confirm deletion.",
        fields: { confirm_email: "Does not match your account email" },
      });
    }
    await invalidateAllRefreshTokens(dev.id);
    await prisma.developer.delete({ where: { id: dev.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

async function invalidateAllRefreshTokens(developerId: string) {
  const keys = await redis.keys(`refresh:${developerId}:*`);
  if (keys.length > 0) await redis.del(...keys);
}

export default router;
