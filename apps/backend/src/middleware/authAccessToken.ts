import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";
import { sha256Hex } from "../utils/crypto.js";
import { Errors } from "../utils/errors.js";

/**
 * Extracts access_token from Authorization Bearer or body.access_token.
 * Looks up the Item, attaches it + application id.
 */
export async function requireAccessToken(req: Request, _res: Response, next: NextFunction) {
  let token: string | undefined;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    token = header.slice("Bearer ".length);
  } else if (typeof req.body?.access_token === "string") {
    token = req.body.access_token;
  } else if (typeof req.query?.access_token === "string") {
    token = req.query.access_token;
  }
  if (!token) return next(Errors.invalidAccessToken());
  const hash = sha256Hex(token);
  const item = await prisma.item.findUnique({ where: { accessTokenHash: hash } });
  if (!item) return next(Errors.invalidAccessToken());
  if (item.status === "ERROR") return next(Errors.itemError(item.status));
  req.item = item;
  req.applicationId = item.applicationId;
  next();
}
