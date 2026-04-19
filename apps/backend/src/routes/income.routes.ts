import { Router } from "express";
import { requireAccessToken } from "../middleware/authAccessToken.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { getIncomeSummary, getIncomePaystubs } from "../services/incomeService.js";
import { Errors } from "../utils/errors.js";
import { config } from "../config.js";

const router = Router();

router.get("/verification/summary", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const summary = await getIncomeSummary(req.item!.id);
    if (!summary) throw Errors.notFound("Income");
    res.json({ income: summary, environment: config.ENVIRONMENT });
  } catch (e) {
    next(e);
  }
});

router.get("/verification/paystubs", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const stubs = await getIncomePaystubs(req.item!.id);
    if (!stubs) throw Errors.notFound("Income");
    res.json({ income: stubs, environment: config.ENVIRONMENT });
  } catch (e) {
    next(e);
  }
});

export default router;
