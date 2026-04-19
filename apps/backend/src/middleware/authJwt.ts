import type { Request, Response, NextFunction } from "express";
import { verifyDeveloperToken } from "../utils/jwt.js";
import { Errors } from "../utils/errors.js";

export function requireDeveloper(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(Errors.unauthorized("Missing bearer token"));
  const token = header.slice("Bearer ".length);
  try {
    const claims = verifyDeveloperToken(token);
    if (claims.type !== "access") return next(Errors.unauthorized("Wrong token type"));
    req.developerId = claims.sub;
    next();
  } catch {
    next(Errors.unauthorized("Invalid or expired token"));
  }
}
