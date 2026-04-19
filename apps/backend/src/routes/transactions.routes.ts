import { Router } from "express";
import { requireAccessToken } from "../middleware/authAccessToken.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { transactionsGetSchema, transactionsSyncSchema } from "@finlink/shared";
import {
  listTransactions,
  syncTransactions,
  toTransactionDTO,
} from "../services/transactionService.js";
import { prisma } from "../db.js";
import { Errors } from "../utils/errors.js";
import { fireWebhook } from "../services/webhookService.js";
import { config } from "../config.js";

const router = Router();

router.get("/", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const input = transactionsGetSchema.parse(req.query);
    const offset = input.cursor ? Number(Buffer.from(input.cursor, "base64url").toString("utf8")) || 0 : 0;
    const out = await listTransactions({
      itemId: req.item!.id,
      startDate: input.start_date ? new Date(input.start_date) : undefined,
      endDate: input.end_date ? new Date(input.end_date) : undefined,
      accountId: input.account_id,
      category: input.category,
      count: input.count,
      offset,
    });
    const nextOffset = offset + input.count;
    const nextCursor = nextOffset < out.total ? Buffer.from(String(nextOffset), "utf8").toString("base64url") : null;
    res.json({
      transactions: out.transactions,
      total_transactions: out.total,
      next_cursor: nextCursor,
      environment: config.ENVIRONMENT,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/sync", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const input = transactionsSyncSchema.parse(req.query);
    const out = await syncTransactions(req.item!.id, input.cursor, input.count);
    res.json({ ...out, environment: config.ENVIRONMENT });
  } catch (e) {
    next(e);
  }
});

router.post("/refresh", rateLimiter, requireAccessToken, async (req, res) => {
  await fireWebhook({
    applicationId: req.applicationId!,
    itemId: req.item!.id,
    code: "TRANSACTIONS_DEFAULT_UPDATE",
    extra: { new_transactions: 0 },
  });
  res.json({ request_id: req.requestId });
});

router.get("/:id", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { itemId: req.item!.id },
      select: { id: true },
    });
    const tx = await prisma.transaction.findFirst({
      where: { id: req.params.id, accountId: { in: accounts.map((a: { id: string }) => a.id) } },
    });
    if (!tx) throw Errors.notFound("Transaction");
    res.json({ transaction: toTransactionDTO(tx) });
  } catch (e) {
    next(e);
  }
});

export default router;
