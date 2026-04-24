/**
 * Tradier sandbox quotes client. Used by the option-quotes refresh
 * job to pull live mark + greeks + IV for every option contract
 * Beacon currently holds.
 *
 * Why Tradier (sandbox tier):
 *   * Genuinely free for personal/non-commercial use; just needs an
 *     account + token, no credit card.
 *   * Returns full Greeks (delta/gamma/theta/vega/rho), IV, bid/ask,
 *     and last in a single call.
 *   * Sandbox is rate-limited at 120 req/min — plenty for a per-user
 *     portfolio refresh, which batches up to 50 symbols per call.
 *
 * Configuration:
 *   * TRADIER_TOKEN — required. The job logs and skips when unset
 *     so deploys without the env var don't crash, just leave Greeks
 *     null until the operator sets it.
 *   * TRADIER_BASE_URL — optional. Defaults to the sandbox host;
 *     override with https://api.tradier.com/v1 when ready to swap
 *     to the production tier.
 */

import { logger } from "../logger.js";

export interface TradierQuote {
  symbol: string;
  description: string | null;
  /** Last trade price; null if the contract hasn't traded today. */
  last: number | null;
  bid: number | null;
  ask: number | null;
  /** Greeks block — every value can be null when Tradier has no
   *  recent trade data (illiquid weekly options, just-listed strikes). */
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  /** Implied volatility as a decimal: 0.30 = 30% IV. */
  iv: number | null;
  /** ISO timestamp Tradier reported for the greeks snapshot. */
  greeksAsOf: string | null;
}

export class TradierError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "TradierError";
  }
}

/**
 * Strip the OCC padding spaces. Tradier expects the 21-character form
 * with no whitespace ("AAPL250117C00200000"); our internal canonical
 * form left-pads the underlying to 6 chars ("AAPL  250117C00200000").
 */
function toTradierSymbol(occ: string): string {
  return occ.replace(/\s+/g, "");
}

/**
 * Fetch quotes (with Greeks) for a batch of OCC symbols. Tradier's
 * /markets/quotes endpoint accepts up to ~50 symbols per call; pass a
 * smaller list for safety. Returns one TradierQuote per requested
 * symbol — symbols Tradier doesn't recognize are returned with all
 * fields null, NOT omitted, so the caller can persist greeksAsOf=null
 * + leave the row in the DB for next refresh.
 */
export async function fetchOptionQuotes(
  occSymbols: string[],
): Promise<TradierQuote[]> {
  if (occSymbols.length === 0) return [];

  const token = process.env.TRADIER_TOKEN;
  if (!token) {
    // Operator hasn't configured Tradier yet. Don't crash — return
    // null-Greek placeholders so the refresh job becomes a no-op
    // until the env var lands.
    logger.warn("TRADIER_TOKEN not set; option Greeks refresh skipped");
    return occSymbols.map((s) => emptyQuote(s));
  }

  const baseUrl =
    process.env.TRADIER_BASE_URL ?? "https://sandbox.tradier.com/v1";
  // Tradier uses comma-joined symbol lists. Map our padded canonical
  // OCC to the unpadded form Tradier expects. Keep both around so we
  // can match the response back to our internal symbol downstream.
  const symbolMap = new Map<string, string>(); // tradier -> canonical
  for (const s of occSymbols) symbolMap.set(toTradierSymbol(s), s);
  const url = `${baseUrl}/markets/quotes?symbols=${encodeURIComponent([...symbolMap.keys()].join(","))}&greeks=true`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new TradierError(
      `Tradier request failed: ${(err as Error).message}`,
    );
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new TradierError("Tradier rate-limited (429)", 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new TradierError(
        `Tradier auth failed (${res.status}); check TRADIER_TOKEN`,
        res.status,
      );
    }
    throw new TradierError(
      `Tradier returned ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const body = (await res.json()) as {
    quotes?:
      | { quote: TradierRawQuote | TradierRawQuote[] }
      | string; // "no quotes" sentinel for empty responses
  };

  // Tradier replies in a few shapes: object when one symbol, array
  // when many, the literal string "no quotes" when none of the
  // requested symbols were found.
  if (typeof body.quotes === "string" || !body.quotes) {
    return [...symbolMap.values()].map((s) => emptyQuote(s));
  }
  const raw = body.quotes.quote;
  const arr = Array.isArray(raw) ? raw : [raw];

  // Build the response keyed by canonical OCC so the caller can match
  // back to OptionContract rows.
  const byCanonical = new Map<string, TradierQuote>();
  for (const q of arr) {
    const canonical = symbolMap.get(q.symbol) ?? q.symbol;
    byCanonical.set(canonical, normalizeQuote(canonical, q));
  }

  // Fill in placeholders for any symbols Tradier didn't return so
  // the response array length matches the request.
  return [...symbolMap.values()].map(
    (canonical) => byCanonical.get(canonical) ?? emptyQuote(canonical),
  );
}

interface TradierRawQuote {
  symbol: string;
  description?: string | null;
  last?: number | null;
  bid?: number | null;
  ask?: number | null;
  greeks?: {
    delta?: number | null;
    gamma?: number | null;
    theta?: number | null;
    vega?: number | null;
    mid_iv?: number | null;
    smv_vol?: number | null;
    updated_at?: string | null;
  } | null;
}

function normalizeQuote(canonical: string, q: TradierRawQuote): TradierQuote {
  const g = q.greeks ?? null;
  return {
    symbol: canonical,
    description: q.description ?? null,
    last: numOrNull(q.last),
    bid: numOrNull(q.bid),
    ask: numOrNull(q.ask),
    delta: numOrNull(g?.delta),
    gamma: numOrNull(g?.gamma),
    theta: numOrNull(g?.theta),
    vega: numOrNull(g?.vega),
    // Tradier reports two IV fields; mid_iv (smoothed mid) is the
    // one most clients want; smv_vol is the back-up "smoothed market
    // vol" used when mid_iv is unreliable.
    iv: numOrNull(g?.mid_iv) ?? numOrNull(g?.smv_vol),
    greeksAsOf: g?.updated_at ?? null,
  };
}

function emptyQuote(canonical: string): TradierQuote {
  return {
    symbol: canonical,
    description: null,
    last: null,
    bid: null,
    ask: null,
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    iv: null,
    greeksAsOf: null,
  };
}

function numOrNull(v: unknown): number | null {
  if (typeof v !== "number") return null;
  return Number.isFinite(v) ? v : null;
}

/**
 * Split a long symbol list into batches small enough for one Tradier
 * call. The /markets/quotes endpoint has no published hard limit, but
 * 50 symbols per call is the safe operating point per the community
 * docs; larger batches occasionally 414 (URI too long).
 */
export function batchSymbols(
  symbols: string[],
  batchSize = 50,
): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    out.push(symbols.slice(i, i + batchSize));
  }
  return out;
}
