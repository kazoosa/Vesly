import { Router } from "express";
import { requireAccessToken } from "../middleware/authAccessToken.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { getIdentityForItem } from "../services/identityService.js";
import { Errors } from "../utils/errors.js";
import { config } from "../config.js";

const router = Router();

router.get("/", rateLimiter, requireAccessToken, async (req, res, next) => {
  try {
    const ident = await getIdentityForItem(req.item!.id);
    if (!ident) throw Errors.notFound("Identity");
    res.json({ identity: ident, environment: config.ENVIRONMENT });
  } catch (e) {
    next(e);
  }
});

export default router;
