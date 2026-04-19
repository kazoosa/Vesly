import { Router } from "express";
import { requireAccessToken } from "../middleware/authAccessToken.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import {
  listHoldings,
  listInvestmentTransactions,
  getSecurity,
} from "../services/investmentService.js";
import { Errors } from "../utils/errors.js";
import { config } from "../config.js";

const router = Router();

router.get("/holdings", rateLimiter, requireAccessToken, async (req, res) => {
  const out = await listHoldings(req.item!.id);
  res.json({ ...out, item_id: req.item!.id, environment: config.ENVIRONMENT });
});

router.get("/transactions", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const startDate = req.query.start_date ? new Date(String(req.query.start_date)) : undefined;
    const endDate = req.query.end_date ? new Date(String(req.query.end_date)) : undefined;
    const count = Math.min(500, Number(req.query.count ?? 250));
    const offset = Number(req.query.offset ?? 0);
    const out = await listInvestmentTransactions(req.item!.id, { startDate, endDate, count, offset });
    res.json({
      investment_transactions: out.transactions,
      securities: out.securities,
      total: out.total,
      item_id: req.item!.id,
      environment: config.ENVIRONMENT,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/securities/:id", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const sec = await getSecurity(String(req.params.id));
    if (!sec) throw Errors.notFound("Security");
    res.json({ security: sec });
  } catch (e) {
    next(e);
  }
});

export default router;
