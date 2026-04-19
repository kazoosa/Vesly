import { Router } from "express";
import { requireDeveloper } from "../middleware/authJwt.js";
import { refreshPrices } from "../services/priceService.js";

const router = Router();

router.post("/refresh", requireDeveloper, async (_req, res, next) => {
  try {
    const out = await refreshPrices();
    res.json(out);
  } catch (e) {
    next(e);
  }
});

export default router;
