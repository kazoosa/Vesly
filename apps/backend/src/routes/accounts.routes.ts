import { Router } from "express";
import { requireAccessToken } from "../middleware/authAccessToken.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { listAccountsByItem, refreshBalances } from "../services/accountService.js";
import { config } from "../config.js";

const router = Router();

router.get("/", rateLimiter, requireAccessToken, async (req, res) => {
  const accounts = await listAccountsByItem(req.item!.id);
  res.json({
    accounts,
    item: { item_id: req.item!.id, institution_id: req.item!.institutionId },
    environment: config.ENVIRONMENT,
  });
});

router.get("/balance", rateLimiter, requireAccessToken, async (req, res) => {
  const accounts = await refreshBalances(req.item!.id);
  res.json({
    accounts,
    item: { item_id: req.item!.id, institution_id: req.item!.institutionId },
    environment: config.ENVIRONMENT,
  });
});

export default router;
