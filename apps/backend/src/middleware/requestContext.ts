import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";
import type { prisma } from "../db.js";

type ItemShape = NonNullable<Awaited<ReturnType<typeof prisma.item.findUnique>>>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      developerId?: string;
      applicationId?: string;
      item?: ItemShape;
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.requestId = (req.headers["x-request-id"] as string) || nanoid();
  req.startTime = Date.now();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
