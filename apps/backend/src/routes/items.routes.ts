import { Router } from "express";
import { requireAccessToken } from "../middleware/authAccessToken.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { deleteItem, updateItemWebhook } from "../services/itemService.js";
import { fireWebhook } from "../services/webhookService.js";
import { config } from "../config.js";

const router = Router();

router.get("/:item_id", rateLimiter, requireAccessToken, async (req, res) => {
  const item = req.item!;
  res.json({
    item: {
      item_id: item.id,
      institution_id: item.institutionId,
      webhook: item.webhookUrl,
      products: item.products,
      status: item.status,
      consent_expires_at: item.consentExpiresAt,
    },
    environment: config.ENVIRONMENT,
  });
});

router.delete("/:item_id", rateLimiter, requireAccessToken, async (req, res) => {
  await deleteItem(req.item!.id);
  res.json({ removed: true });
});

router.post("/:item_id/webhook", rateLimiter, requireAccessToken, async (req, res) => {
  const webhookUrl = (req.body?.webhook as string | undefined) ?? null;
  const updated = await updateItemWebhook(req.item!.id, webhookUrl);
  res.json({ item_id: updated.id, webhook: updated.webhookUrl });
});

router.post("/:item_id/refresh", rateLimiter, requireAccessToken, async (req, res) => {
  // Fire a webhook asynchronously — in sandbox data doesn't actually change.
  await fireWebhook({
    applicationId: req.applicationId!,
    itemId: req.item!.id,
    code: "TRANSACTIONS_DEFAULT_UPDATE",
    extra: { new_transactions: 0 },
  });
  res.json({ request_id: req.requestId });
});

export default router;
