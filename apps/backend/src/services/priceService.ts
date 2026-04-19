import { prisma } from "../db.js";
import { config } from "../config.js";

/**
 * Refreshes close prices for all seeded securities. If ALPHA_VANTAGE_API_KEY is set
 * it tries the real API for up to 3 tickers (free tier limit), else applies a small
 * random jitter to existing prices.
 */
export async function refreshPrices(): Promise<{ updated: number }> {
  const securities = await prisma.security.findMany();
  let updated = 0;
  const now = new Date();

  if (config.ALPHA_VANTAGE_API_KEY) {
    const sample = securities.slice(0, 3);
    for (const s of sample) {
      try {
        const res = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.tickerSymbol}&apikey=${config.ALPHA_VANTAGE_API_KEY}`,
        );
        const json = (await res.json()) as { "Global Quote"?: { "05. price"?: string } };
        const price = parseFloat(json["Global Quote"]?.["05. price"] ?? "");
        if (isFinite(price) && price > 0) {
          await prisma.security.update({ where: { id: s.id }, data: { closePrice: price, closePriceAsOf: now } });
          updated++;
        }
      } catch {
        /* ignore per-ticker errors */
      }
    }
  }

  // Jitter the rest
  for (const s of securities) {
    if (updated > 0 && updated >= 3) {
      const skip = ["AAPL", "MSFT", "NVDA"].includes(s.tickerSymbol);
      if (skip) continue;
    }
    const jitter = 1 + (Math.random() - 0.5) * 0.02; // ±1%
    const newPrice = +(s.closePrice * jitter).toFixed(2);
    await prisma.security.update({ where: { id: s.id }, data: { closePrice: newPrice, closePriceAsOf: now } });
    updated++;
  }
  return { updated };
}
