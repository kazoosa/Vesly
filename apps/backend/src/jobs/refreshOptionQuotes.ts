/**
 * Refreshes live mark + Greeks + IV for every option contract
 * Beacon currently holds. Pulls from Tradier's quotes endpoint in
 * batches of 50 symbols, then writes the results back to the
 * OptionContract row + parent Security.closePrice.
 *
 * Triggered three ways:
 *   1. After every SnapTrade sync that wrote any option holdings
 *      (immediate, fire-and-forget — see snaptradeService.ts).
 *   2. After every CSV import that produced option holdings.
 *   3. By an external cron job (e.g. Render Cron) calling this
 *      directly via a small CLI shim — once an hour during market
 *      hours is the recommended cadence.
 *
 * The function is safe to call concurrently for different developers
 * (each touches only its own contracts); concurrent calls for the
 * SAME developer race on the optionContract.update at the end, but
 * the writes are idempotent (last-writer-wins on the same fields).
 */

import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { fetchOptionQuotes, batchSymbols, TradierError } from "../services/tradierClient.js";

export interface RefreshResult {
  refreshed: number;
  skipped: number;
  errored: number;
  durationMs: number;
}

/**
 * Refresh quotes for every non-zero option holding belonging to the
 * given developer. Pass `developerId: null` to refresh ALL non-zero
 * option holdings across every developer (use case: nightly cron).
 */
export async function refreshOptionQuotes(
  developerId: string | null = null,
): Promise<RefreshResult> {
  const start = Date.now();

  // Find every option contract with at least one open holding (filter
  // by developer when scoped, otherwise all developers). DISTINCT on
  // occSymbol so we only quote each contract once even if many
  // accounts hold it.
  const contracts = await prisma.optionContract.findMany({
    where: {
      occSymbol: { not: null },
      security: {
        holdings: {
          some: {
            quantity: { not: 0 },
            ...(developerId
              ? {
                  account: {
                    item: { application: { developerId } },
                  },
                }
              : {}),
          },
        },
      },
    },
    select: { id: true, occSymbol: true, securityId: true },
  });

  if (contracts.length === 0) {
    return { refreshed: 0, skipped: 0, errored: 0, durationMs: Date.now() - start };
  }

  const symbols = contracts.map((c) => c.occSymbol!).filter(Boolean);
  const symbolToContract = new Map<string, { id: string; securityId: string }>();
  for (const c of contracts) {
    if (c.occSymbol) symbolToContract.set(c.occSymbol, { id: c.id, securityId: c.securityId });
  }

  let refreshed = 0;
  let errored = 0;
  let skipped = 0;

  for (const batch of batchSymbols(symbols, 50)) {
    let quotes;
    try {
      quotes = await fetchOptionQuotes(batch);
    } catch (err) {
      // 429 is the most common failure (sandbox 120/min); log and
      // skip the rest of the batches so we don't pile up retries.
      // Next refresh tick (cron or sync) will pick up where we left off.
      if (err instanceof TradierError && err.status === 429) {
        logger.warn(
          { batchSize: batch.length, refreshedSoFar: refreshed },
          "tradier rate-limited; aborting refresh, will retry next tick",
        );
        return {
          refreshed,
          skipped: skipped + (symbols.length - refreshed - errored),
          errored,
          durationMs: Date.now() - start,
        };
      }
      logger.warn({ err, batchSize: batch.length }, "tradier batch failed; skipping batch");
      errored += batch.length;
      continue;
    }

    for (const q of quotes) {
      const meta = symbolToContract.get(q.symbol);
      if (!meta) {
        skipped++;
        continue;
      }
      // Mark price preference: Tradier's `last` if available;
      // otherwise the bid/ask midpoint; otherwise leave unchanged
      // (don't overwrite a known good price with null).
      let mark: number | null = q.last;
      if (mark == null && q.bid != null && q.ask != null) {
        mark = (q.bid + q.ask) / 2;
      }
      const greeksAsOf = q.greeksAsOf ? new Date(q.greeksAsOf) : new Date();
      try {
        await prisma.$transaction(async (tx) => {
          await tx.optionContract.update({
            where: { id: meta.id },
            data: {
              delta: q.delta,
              gamma: q.gamma,
              theta: q.theta,
              vega: q.vega,
              iv: q.iv,
              greeksAsOf,
            },
          });
          if (mark != null) {
            await tx.security.update({
              where: { id: meta.securityId },
              data: { closePrice: mark, closePriceAsOf: greeksAsOf },
            });
          }
        });
        refreshed++;
      } catch (err) {
        logger.warn(
          { err, symbol: q.symbol },
          "tradier refresh: failed to persist quote; continuing",
        );
        errored++;
      }
    }
  }

  const durationMs = Date.now() - start;
  logger.info(
    { developerId, refreshed, skipped, errored, durationMs, totalContracts: contracts.length },
    "option quotes refresh complete",
  );
  return { refreshed, skipped, errored, durationMs };
}
