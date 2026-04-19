import type { Request, Response, NextFunction } from "express";
import { redis } from "../redis.js";
import { sha256Hex } from "../utils/crypto.js";
import { Errors } from "../utils/errors.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

/**
 * Sliding-window rate limit per access token (or per IP if unauth).
 * Uses a Redis sorted set, members are timestamps.
 */
export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "test") return next();
  let key: string;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length);
    key = `rl:at:${sha256Hex(token).slice(0, 16)}`;
  } else if (typeof req.body?.access_token === "string") {
    key = `rl:at:${sha256Hex(req.body.access_token as string).slice(0, 16)}`;
  } else {
    key = `rl:ip:${req.ip}`;
  }
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, cutoff);
  multi.zadd(key, now, `${now}:${Math.random()}`);
  multi.zcard(key);
  multi.pexpire(key, WINDOW_MS + 1000);
  try {
    const results = (await multi.exec()) as Array<[Error | null, unknown]>;
    const count = Number(results[2]?.[1] ?? 0);
    if (count > MAX_REQUESTS) {
      res.setHeader("Retry-After", Math.ceil(WINDOW_MS / 1000).toString());
      return next(Errors.rateLimit());
    }
    res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, MAX_REQUESTS - count)));
  } catch {
    // Redis hiccup — fail open
  }
  next();
}
