import { Router } from "express";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { requireAccessToken } from "../middleware/authAccessToken.js";
import {
  sandboxFireWebhookSchema,
  sandboxSimulateTxSchema,
  sandboxResetLoginSchema,
} from "@finlink/shared";
import { fireWebhook } from "../services/webhookService.js";
import { injectSimulatedTransactions } from "../services/transactionService.js";
import { setItemStatus } from "../services/itemService.js";
import { listInstitutions } from "../services/institutionService.js";

const router = Router();

router.post("/item/fire_webhook", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const input = sandboxFireWebhookSchema.parse(req.body);
    const event = await fireWebhook({
      applicationId: req.applicationId!,
      itemId: req.item!.id,
      code: input.webhook_code,
      extra: { new_transactions: 0 },
    });
    res.json({ webhook_fired: true, event_id: event?.id });
  } catch (e) {
    next(e);
  }
});

router.post("/item/reset_login", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    sandboxResetLoginSchema.parse(req.body);
    await setItemStatus(req.item!.id, "LOGIN_REQUIRED");
    const event = await fireWebhook({
      applicationId: req.applicationId!,
      itemId: req.item!.id,
      code: "ITEM_LOGIN_REQUIRED",
    });
    res.json({ reset: true, event_id: event?.id });
  } catch (e) {
    next(e);
  }
});

router.post("/transactions/simulate", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const input = sandboxSimulateTxSchema.parse(req.body);
    const created = await injectSimulatedTransactions(req.item!.id, input.account_id, input.count);
    const event = await fireWebhook({
      applicationId: req.applicationId!,
      itemId: req.item!.id,
      code: "TRANSACTIONS_DEFAULT_UPDATE",
      extra: { new_transactions: created },
    });
    res.json({ created, event_id: event?.id });
  } catch (e) {
    next(e);
  }
});

router.get("/institutions", async (_req, res, next) => {
  try {
    const { institutions } = await listInstitutions({ count: 100 });
    res.json({ institutions });
  } catch (e) {
    next(e);
  }
});

export default router;
