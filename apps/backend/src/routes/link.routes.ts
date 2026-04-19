import { Router } from "express";
import {
  linkTokenCreateSchema,
  publicTokenExchangeSchema,
  sessionSelectInstitutionSchema,
  sessionCredentialsSchema,
  sessionMfaSchema,
  sessionFinalizeSchema,
} from "@finlink/shared";
import { prisma } from "../db.js";
import { requireClientAuth } from "../middleware/authClient.js";
import { Errors } from "../utils/errors.js";
import {
  createLinkSession,
  resolveSessionByLinkToken,
  finalizeSession,
} from "../services/linkSessionService.js";
import { verifyPublicToken } from "../utils/jwt.js";
import { createItemFromSession } from "../services/itemService.js";
import { redis } from "../redis.js";
import { generateAccounts } from "../utils/mockDataGenerator.js";
import { config } from "../config.js";

const router = Router();

/**
 * POST /api/link/token/create
 * Developer-auth'd. Returns link_token.
 */
router.post("/token/create", requireClientAuth, async (req, res, next) => {
  try {
    const input = linkTokenCreateSchema.parse(req.body);
    const app = await prisma.application.findUnique({ where: { id: req.applicationId! } });
    if (!app) throw Errors.invalidClient();
    // Validate products subset
    for (const p of input.products) {
      if (!app.allowedProducts.includes(p)) {
        throw Errors.badRequest(`Product ${p} not allowed for this application`);
      }
    }
    const { linkToken, expiration } = await createLinkSession({
      applicationId: app.id,
      clientUserId: input.user.client_user_id,
      products: input.products,
      clientName: input.client_name,
      webhookUrl: input.webhook,
      redirectUri: input.redirect_uri,
    });
    res.status(200).json({
      link_token: linkToken,
      expiration,
      request_id: req.requestId,
      environment: config.ENVIRONMENT,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/link/token/exchange — public_token → access_token.
 * No auth (public_token itself is proof).
 */
router.post("/token/exchange", async (req, res, next) => {
  try {
    const { public_token } = publicTokenExchangeSchema.parse(req.body);
    let claims;
    try {
      claims = verifyPublicToken(public_token);
    } catch {
      throw Errors.invalidPublicToken();
    }

    // Single-use: atomic redis SET NX with short TTL
    const consumeKey = `pt:${claims.jti}`;
    const ok = await redis.set(consumeKey, "1", "EX", 3600, "NX");
    if (!ok) throw Errors.invalidPublicToken();

    const session = await prisma.linkSession.findUnique({
      where: { publicTokenJti: claims.jti },
    });
    if (!session) throw Errors.invalidPublicToken();
    if (session.publicTokenConsumed) throw Errors.invalidPublicToken();
    if (!session.institutionId) throw Errors.badRequest("Session missing institution");

    const { itemId, accessToken } = await createItemFromSession({
      applicationId: session.applicationId,
      institutionId: session.institutionId,
      clientUserId: session.clientUserId,
      products: session.products,
      selectedAccountIds: session.selectedAccountIds,
      webhookUrl: session.webhookUrl,
    });
    await prisma.linkSession.update({
      where: { id: session.id },
      data: { publicTokenConsumed: true, itemId },
    });

    res.json({
      access_token: accessToken,
      item_id: itemId,
      request_id: req.requestId,
      environment: config.ENVIRONMENT,
    });
  } catch (e) {
    next(e);
  }
});

/* ────────── Session endpoints consumed by the Link UI modal ────────── */

router.get("/session", async (req, res, next) => {
  try {
    const token = String(req.query.token ?? "");
    if (!token) throw Errors.invalidLinkToken();
    const session = await resolveSessionByLinkToken(token);
    res.json({
      session_id: session.id,
      client_name: session.clientName,
      products: session.products,
      status: session.status,
      institution_id: session.institutionId,
      mfa_required: session.mfaRequired,
      credential_attempts: session.credentialAttempts,
      expires_at: session.expiresAt,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/session/select_institution", async (req, res, next) => {
  try {
    const input = sessionSelectInstitutionSchema.parse(req.body);
    const institution = await prisma.institution.findUnique({ where: { id: input.institution_id } });
    if (!institution) throw Errors.notFound("Institution");
    await prisma.linkSession.update({
      where: { id: input.session_id },
      data: {
        institutionId: institution.id,
        status: "INSTITUTION_SELECTED",
      },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/session/submit_credentials", async (req, res, next) => {
  try {
    const input = sessionCredentialsSchema.parse(req.body);
    const session = await prisma.linkSession.findUnique({ where: { id: input.session_id } });
    if (!session) throw Errors.notFound("Session");
    // Sandbox: any credentials succeed unless specifically marked "user_bad"
    if (input.username === "user_bad") {
      const attempts = session.credentialAttempts + 1;
      await prisma.linkSession.update({
        where: { id: session.id },
        data: { credentialAttempts: attempts },
      });
      if (attempts >= 3) {
        return res.status(400).json({
          error_type: "ITEM_ERROR",
          error_code: "INVALID_CREDENTIALS",
          attempts_remaining: 0,
        });
      }
      return res.status(400).json({
        error_type: "ITEM_ERROR",
        error_code: "INVALID_CREDENTIALS",
        attempts_remaining: 3 - attempts,
      });
    }
    // Randomly trigger MFA (deterministic from institution+user)
    const seed = `${session.institutionId}:${session.clientUserId}`;
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const mfaRequired = h % 2 === 0;
    await prisma.linkSession.update({
      where: { id: session.id },
      data: {
        status: mfaRequired ? "MFA_PENDING" : "ACCOUNTS_SELECTED",
        mfaRequired,
      },
    });
    res.json({ mfa_required: mfaRequired });
  } catch (e) {
    next(e);
  }
});

router.post("/session/submit_mfa", async (req, res, next) => {
  try {
    const input = sessionMfaSchema.parse(req.body);
    // Sandbox: any 6-digit code passes except 000000
    if (input.code === "000000") {
      return res.status(400).json({ error_type: "ITEM_ERROR", error_code: "INVALID_MFA" });
    }
    await prisma.linkSession.update({
      where: { id: input.session_id },
      data: { mfaSatisfied: true, status: "ACCOUNTS_SELECTED" },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/session/:id/preview_accounts", async (req, res, next) => {
  try {
    const session = await prisma.linkSession.findUnique({ where: { id: req.params.id } });
    if (!session) throw Errors.notFound("Session");
    // Preview: generate deterministic account shapes based on session id + institution.
    // These IDs are stored on the session and are real Account rows after finalize.
    const accounts = generateAccounts({ itemId: session.id, products: session.products });
    res.json({
      accounts: accounts.map((a) => ({
        id: a.data.id,
        name: a.data.name,
        mask: a.data.mask,
        type: a.data.type,
        subtype: a.data.subtype,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.post("/session/finalize", async (req, res, next) => {
  try {
    const input = sessionFinalizeSchema.parse(req.body);
    await prisma.linkSession.update({
      where: { id: input.session_id },
      data: {
        selectedAccountIds: input.account_ids,
        status: "CONSENT_GRANTED",
      },
    });
    const { publicToken } = await finalizeSession(input.session_id);
    res.json({ public_token: publicToken });
  } catch (e) {
    next(e);
  }
});

export default router;
