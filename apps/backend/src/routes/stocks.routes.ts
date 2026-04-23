import { Router } from "express";
import { z } from "zod";
import { requireDeveloper } from "../middleware/authJwt.js";
import { Errors } from "../utils/errors.js";
import {
  getHistory,
  getNews,
  getQuote,
  isValidSymbol,
  normalizeSymbol,
  searchSymbols,
  type HistoryRange,
} from "../services/stocksService.js";

/**
 * Live stock data endpoints. Thin wrappers around stocksService —
 * validation + param plumbing + error shape. Redis TTL + coalescing
 * live in the service.
 */
const router = Router();
router.use(requireDeveloper);

function parseSymbolParam(raw: string): string {
  const normalized = normalizeSymbol(raw);
  if (!isValidSymbol(normalized)) {
    throw Errors.badRequest("Invalid symbol", { symbol: raw });
  }
  return normalized;
}

const rangeSchema = z.enum(["1d", "5d", "1mo", "3mo", "1y", "max"]);

router.get("/quote/:symbol", async (req, res, next) => {
  try {
    const symbol = parseSymbolParam(req.params.symbol);
    const quote = await getQuote(symbol);
    res.json(quote);
  } catch (e) {
    next(e);
  }
});

router.get("/history/:symbol", async (req, res, next) => {
  try {
    const symbol = parseSymbolParam(req.params.symbol);
    const parseResult = rangeSchema.safeParse(req.query.range ?? "1mo");
    if (!parseResult.success) {
      throw Errors.badRequest("Invalid range", { range: req.query.range });
    }
    const range: HistoryRange = parseResult.data;
    const history = await getHistory(symbol, range);
    res.json(history);
  } catch (e) {
    next(e);
  }
});

router.get("/news/:symbol", async (req, res, next) => {
  try {
    const symbol = parseSymbolParam(req.params.symbol);
    const limitRaw = Number(req.query.limit ?? 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(25, limitRaw)) : 10;
    const news = await getNews(symbol, limit);
    res.json({ symbol, items: news });
  } catch (e) {
    next(e);
  }
});

router.get("/search", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ results: [] });
      return;
    }
    if (q.length > 32) {
      throw Errors.badRequest("Search query too long");
    }
    const results = await searchSymbols(q, 15);
    res.json({ results });
  } catch (e) {
    next(e);
  }
});

export default router;
