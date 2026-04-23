import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  fetchQuote,
  getLastError,
  isValidSymbol,
  normalizeSymbol,
  setCors,
} from "../../_lib/yahoo.js";

/**
 * GET /api/stocks/quote/:symbol — live quote via Yahoo.
 * Cached at the edge for 30s by vercel.json's s-maxage.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers on every response
  for (const [k, v] of Object.entries(setCors())) res.setHeader(k, v);

  const raw = String(req.query.symbol ?? "").trim();
  const symbol = normalizeSymbol(raw);
  if (!isValidSymbol(symbol)) {
    return res.status(400).json({
      error: "INVALID_SYMBOL",
      message: "Symbol must match /^[A-Z]{1,6}(?:[-.][A-Z]{1,4})?$/",
    });
  }

  try {
    const quote = await fetchQuote(symbol);
    if (!quote) {
      // Surface the underlying yahoo-finance2 error via a debug header
      // so we can see why fetchQuote is returning null from the client.
      res.setHeader(
        "X-Yahoo-Debug",
        (getLastError() ?? "null returned").replace(/[\r\n\t]+/g, " ").slice(0, 400),
      );
      return res.status(200).json({
        symbol,
        name: symbol,
        exchange: null,
        currency: "USD",
        price: 0,
        previousClose: 0,
        change: 0,
        changePct: 0,
        marketCap: null,
        peRatio: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        volume: null,
        avgVolume: null,
        dividendYieldPct: null,
        beta: null,
        sector: null,
        logoUrl: null,
        isFallback: true,
        asOf: new Date().toISOString(),
      });
    }
    return res.status(200).json(quote);
  } catch (err) {
    console.error("[api/stocks/quote] failed:", err);
    return res.status(500).json({
      error: "FETCH_FAILED",
      message: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack?.slice(0, 500) : null,
    });
  }
}
