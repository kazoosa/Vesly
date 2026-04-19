import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";
import { verifySecret } from "../utils/crypto.js";
import { Errors } from "../utils/errors.js";

/**
 * Verifies client_id + secret from body. Used for /link/token/create.
 */
export async function requireClientAuth(req: Request, _res: Response, next: NextFunction) {
  const clientId = (req.body?.client_id as string | undefined) ?? (req.headers["plaid-client-id"] as string | undefined);
  const secret = (req.body?.secret as string | undefined) ?? (req.headers["plaid-secret"] as string | undefined);
  if (!clientId || !secret) return next(Errors.invalidClient());
  const app = await prisma.application.findUnique({ where: { clientId } });
  if (!app) return next(Errors.invalidClient());
  const ok = await verifySecret(secret, app.clientSecretHash);
  if (!ok) return next(Errors.invalidClient());
  req.applicationId = app.id;
  next();
}
