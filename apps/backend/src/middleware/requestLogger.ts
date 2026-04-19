import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";
import { logger } from "../logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const latency = Date.now() - req.startTime;
    logger.info(
      { reqId: req.requestId, method: req.method, path: req.path, status: res.statusCode, latencyMs: latency },
      "http",
    );

    // Only persist API traffic under /api/* and not docs
    if (req.path.startsWith("/api/") && !req.path.startsWith("/api/docs")) {
      prisma.apiLog
        .create({
          data: {
            applicationId: req.applicationId ?? null,
            itemId: req.item?.id ?? null,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            latencyMs: latency,
            requestId: req.requestId,
          },
        })
        .catch(() => {
          /* best effort */
        });
    }
  });
  next();
}
