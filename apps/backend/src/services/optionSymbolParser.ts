/**
 * Parses option contract symbols from every shape Beacon currently
 * imports from, into a normalized OptionSpec the importers can persist
 * as an OptionContract row.
 *
 * Three strategies, tried in order:
 *
 *   1. Fidelity-style:  "-AMAT260424C400" / " -AMAT260424C400"
 *      Leading dash (and possibly leading space) marks the row as an
 *      option in Fidelity's positions CSV; strike is plain decimal.
 *
 *   2. OCC standard:    "AMAT  260424C00400000"
 *      The official format used by the Options Clearing Corporation
 *      and by most APIs (Tradier included). Strike is multiplied by
 *      1000 so two implied decimal places: 00400000 -> 400.00,
 *      00037500 -> 37.50.
 *
 *   3. SnapTrade structured: { option_symbol: "...", strike_price,
 *      expiration_date, option_type } — no parsing, just read the
 *      fields and normalize them.
 *
 * All three strategies converge on a single OccSymbol in the result,
 * which gives us a stable identity across brokers. Two brokers
 * exporting the same contract under different shapes will resolve to
 * the same `occSymbol` and therefore the same OptionContract row.
 */

export type OptionType = "call" | "put";

export interface OptionSpec {
  underlyingTicker: string;
  optionType: OptionType;
  strike: number;
  expiry: Date; // UTC midnight on the expiration date
  occSymbol: string; // canonical, e.g. "AMAT  260424C00400000"
  /** Standard equity option = 100. Mini = 10. Caller can override. */
  multiplier: number;
}

/**
 * Try every known shape; return null if nothing matches. Callers are
 * expected to fall back to "treat this row as a regular equity" when
 * null is returned, NOT to throw — many CSVs mix options and stocks
 * row-by-row and the parser should never gate the entire import on
 * one unrecognized symbol.
 */
export function parseOptionSymbol(input: unknown): OptionSpec | null {
  if (input == null) return null;

  // SnapTrade-style structured object — the only path that doesn't
  // need to parse a symbol string.
  if (typeof input === "object") {
    const fromStructured = parseStructured(input as Record<string, unknown>);
    if (fromStructured) return fromStructured;
    return null;
  }

  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  // Fidelity strips leading whitespace + uses a leading dash to mark
  // the option rows. After cleanTicker(), we get either "-AMAT260424C400"
  // or "AMAT260424C400". Either way, strip a single leading dash before
  // matching.
  const compact = raw.replace(/^-/, "");

  // Strategy 2 FIRST (try OCC before Fidelity): the OCC format is
  // strictly 8-digit strike with implied 3 decimals. Trying it first
  // means an unpadded Tradier-style OCC string (e.g. "AAPL260117C00037500")
  // doesn't get mis-matched by the looser Fidelity regex (which would
  // happily read 00037500 as the integer 37500).
  //
  // Underlying is left-padded to 6 chars with spaces in the canonical
  // form, but real-world inputs sometimes drop the padding (Tradier
  // returns "AMAT240419C00040000" with no spaces). Accept both via the
  // \s+ -> "" pre-pass.
  const occMatch = compact
    .replace(/\s+/g, "")
    .match(/^([A-Z][A-Z.]{0,5})(\d{6})([CP])(\d{8})$/);
  if (occMatch) {
    const [, ticker, dateStr, cp, strikeStr] = occMatch;
    const expiry = parseYymmdd(dateStr);
    if (expiry) {
      const strike = parseInt(strikeStr, 10) / 1000;
      if (Number.isFinite(strike)) {
        return {
          underlyingTicker: ticker,
          optionType: cp === "C" ? "call" : "put",
          strike,
          expiry,
          occSymbol: toOccSymbol(ticker, expiry, cp as "C" | "P", strike),
          multiplier: 100,
        };
      }
    }
  }

  // Strategy 1: Fidelity-style (compact, no padding, plain decimal strike).
  // Strike is the user-visible value: "400", "82.5", "1.50". Reject any
  // strike that's exactly 8 digits — that's an OCC string the OCC
  // strategy above should have caught (and means we're matching the
  // wrong format). Underlying tickers can include letters and dots
  // (BRK.B). Date is YYMMDD.
  // Example: AMAT260424C400 -> AMAT, 26-04-24, CALL, 400
  const fidelityMatch = compact.match(/^([A-Z][A-Z.]{0,5})(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (fidelityMatch) {
    const [, ticker, dateStr, cp, strikeStr] = fidelityMatch;
    // Refuse to interpret a leading-zero, 8-digit strike as Fidelity-
    // style — it's almost certainly an OCC string that the OCC regex
    // didn't catch (e.g. unusual ticker length). Strikes that big with
    // leading zeros don't exist in the wild.
    if (/^0\d{7}$/.test(strikeStr)) return null;
    const expiry = parseYymmdd(dateStr);
    if (expiry) {
      const strike = parseFloat(strikeStr);
      if (Number.isFinite(strike)) {
        return {
          underlyingTicker: ticker,
          optionType: cp === "C" ? "call" : "put",
          strike,
          expiry,
          occSymbol: toOccSymbol(ticker, expiry, cp as "C" | "P", strike),
          multiplier: 100,
        };
      }
    }
  }

  return null;
}

/**
 * Parse SnapTrade's structured option payload. Their schema across
 * different broker integrations carries the option metadata in any of
 * a handful of nested places:
 *
 *   pos.symbol.option_symbol = "AMAT240419C00040000"
 *   pos.symbol.strike_price  = 400
 *   pos.symbol.expiration_date = "2026-04-24"
 *   pos.symbol.option_type   = "CALL" | "PUT"
 *
 * Or, for some integrations:
 *   pos.symbol.symbol.option_symbol = ...
 *
 * If an `option_symbol` is present we ALSO parse it via Strategy 2
 * above as a sanity check; the structured fields are always the
 * source of truth for strike/expiry, but the OCC string is what we
 * persist for cross-broker identity.
 */
function parseStructured(obj: Record<string, unknown>): OptionSpec | null {
  // Walk through every place SnapTrade nests the option payload. The
  // dedicated options endpoint (listOptionHoldings) returns:
  //
  //   { symbol: { option_symbol: { ticker, option_type, strike_price,
  //               expiration_date, is_mini_option,
  //               underlying_symbol: { symbol, ... } }, ... }, ... }
  //
  // The activities endpoint sometimes returns a flat string at
  // pos.option_symbol or pos.symbol.option_symbol. We try every level
  // and accept option_symbol as EITHER a string (OCC) or a structured
  // object.
  const candidates: Record<string, unknown>[] = [obj];
  if (obj.symbol && typeof obj.symbol === "object") {
    candidates.push(obj.symbol as Record<string, unknown>);
    const inner = (obj.symbol as Record<string, unknown>).symbol;
    if (inner && typeof inner === "object") {
      candidates.push(inner as Record<string, unknown>);
    }
    const innerOpt = (obj.symbol as Record<string, unknown>).option_symbol;
    if (innerOpt && typeof innerOpt === "object") {
      candidates.push(innerOpt as Record<string, unknown>);
    }
  }
  if (obj.option_symbol && typeof obj.option_symbol === "object") {
    candidates.push(obj.option_symbol as Record<string, unknown>);
  }

  for (const c of candidates) {
    // option_symbol may be a string (legacy) or an object (current SDK).
    const optionSymbolStr = stringOr(c.option_symbol);
    const optionSymbolObj =
      c.option_symbol && typeof c.option_symbol === "object"
        ? (c.option_symbol as Record<string, unknown>)
        : null;

    const strike = numberOr(c.strike_price ?? c.strike ?? optionSymbolObj?.strike_price);
    const expiryRaw = stringOr(
      c.expiration_date ?? c.expiration ?? optionSymbolObj?.expiration_date,
    );
    const optionType = optionTypeFrom(
      c.option_type ?? c.type ?? optionSymbolObj?.option_type,
    );

    // underlying may be a string OR an UnderlyingSymbol object with a
    // .symbol field. Try both.
    const underlyingRaw = c.underlying_symbol ?? c.underlying ?? optionSymbolObj?.underlying_symbol;
    let underlying = stringOr(underlyingRaw);
    if (!underlying && underlyingRaw && typeof underlyingRaw === "object") {
      underlying = stringOr((underlyingRaw as Record<string, unknown>).symbol);
    }

    // Mini options have 10 shares per contract instead of 100. The SDK
    // exposes this as `is_mini_option: boolean` on OptionsSymbol.
    const isMini = (c.is_mini_option ?? optionSymbolObj?.is_mini_option) === true;
    const multiplier = isMini ? 10 : 100;

    // Strategy A: option_symbol is a string OCC ticker.
    if (optionSymbolStr) {
      const fromOcc = parseOptionSymbol(optionSymbolStr);
      if (fromOcc) {
        return {
          ...fromOcc,
          strike: strike ?? fromOcc.strike,
          expiry: expiryRaw ? parseIsoDate(expiryRaw) ?? fromOcc.expiry : fromOcc.expiry,
          optionType: optionType ?? fromOcc.optionType,
          multiplier,
        };
      }
    }

    // Strategy B: option_symbol is the OptionsSymbol object — its
    // `ticker` field is the OCC string.
    if (optionSymbolObj) {
      const occTicker = stringOr(optionSymbolObj.ticker);
      if (occTicker) {
        const fromOcc = parseOptionSymbol(occTicker);
        if (fromOcc) {
          return {
            ...fromOcc,
            strike: strike ?? fromOcc.strike,
            expiry: expiryRaw ? parseIsoDate(expiryRaw) ?? fromOcc.expiry : fromOcc.expiry,
            optionType: optionType ?? fromOcc.optionType,
            multiplier,
          };
        }
      }
    }

    // Strategy C: no OCC string anywhere, but we have all four
    // components — reconstruct the OCC from them.
    if (strike != null && expiryRaw && optionType && underlying) {
      const expiry = parseIsoDate(expiryRaw);
      if (!expiry) continue;
      const cp = optionType === "call" ? "C" : "P";
      return {
        underlyingTicker: underlying.toUpperCase(),
        optionType,
        strike,
        expiry,
        occSymbol: toOccSymbol(underlying.toUpperCase(), expiry, cp, strike),
        multiplier,
      };
    }
  }

  return null;
}

/** YYMMDD -> Date at UTC midnight. Returns null on garbage. */
function parseYymmdd(s: string): Date | null {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(2, 4), 10);
  const dd = parseInt(s.slice(4, 6), 10);
  // Two-digit years roll over at 70: 70-99 -> 1970-1999, 00-69 -> 2000-2069.
  // Options dated before the 70s don't exist in any meaningful sense, and
  // this matches Tradier / OCC conventions.
  const fullYear = yy >= 70 ? 1900 + yy : 2000 + yy;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(Date.UTC(fullYear, mm - 1, dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO yyyy-mm-dd or yyyy-mm-ddThh:mm:ss... -> Date at UTC midnight. */
function parseIsoDate(s: string): Date | null {
  const iso = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const fallback = new Date(s);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Build the canonical OCC symbol: underlying left-padded with spaces
 * to 6 chars, YYMMDD, C|P, strike × 1000 zero-padded to 8 digits.
 *
 *   AMAT, 2026-04-24, CALL, 400.00 -> "AMAT  260424C00400000"
 */
function toOccSymbol(
  ticker: string,
  expiry: Date,
  cp: "C" | "P",
  strike: number,
): string {
  const yy = String(expiry.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(expiry.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(expiry.getUTCDate()).padStart(2, "0");
  const strikeRaw = Math.round(strike * 1000);
  const strikeStr = String(strikeRaw).padStart(8, "0");
  const tickerPad = ticker.padEnd(6, " ");
  return `${tickerPad}${yy}${mm}${dd}${cp}${strikeStr}`;
}

function stringOr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function numberOr(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function optionTypeFrom(v: unknown): OptionType | null {
  if (typeof v !== "string") return null;
  const u = v.trim().toUpperCase();
  if (u === "CALL" || u === "C") return "call";
  if (u === "PUT" || u === "P") return "put";
  return null;
}
