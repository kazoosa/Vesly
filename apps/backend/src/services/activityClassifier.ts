/**
 * Single source of truth for mapping a raw broker activity label onto
 * our transaction type vocabulary. Both the CSV importer (Fidelity's
 * `Action` column) and the SnapTrade sync (`type` / `action` field)
 * route through this classifier so the two import paths stay in sync
 * — historically they drifted apart and each had its own allow-list
 * with different blind spots.
 *
 * Callers must upper-case the raw label first (or let the classifier
 * do it — both forms are supported) and handle a `null` return by
 * logging and skipping the row, never by throwing. Unknown actions
 * are safe to extend; reorg/split events are intentionally skipped
 * until the schema grows a dedicated type for them.
 */

export type ActivityType =
  | "buy"
  | "sell"
  | "dividend"
  | "dividend_reinvested"
  | "interest"
  | "fee"
  | "transfer";

/**
 * Income-style activity types — used by reporting queries so reinvested
 * dividends, capital-gain distributions, and return-of-capital all roll
 * up into the "dividends / income" line the user sees on the Dividends
 * page, even when they're represented as distinct DB rows. Exported so
 * the read layer and the importer agree on exactly one definition.
 */
export const DIVIDEND_INCOME_TYPES: ActivityType[] = ["dividend", "dividend_reinvested"];

export function classifyActivity(rawLabel: string | null | undefined): ActivityType | null {
  if (!rawLabel) return null;
  const a = String(rawLabel).trim().toUpperCase();
  if (!a) return null;

  // DIVIDEND + REINVEST first (either order): SnapTrade ships
  // DIVIDEND_REINVESTED, Fidelity ships REINVESTMENT (usually on a
  // dividend row) — both mean "the broker paid a dividend and
  // immediately used the cash to buy more shares". We model them as a
  // distinct type so the share-count replay can add shares (like a
  // buy) AND the dividend reports can still count them as income.
  // Previously these were collapsed into "buy" and disappeared from
  // the user's dividend totals entirely — a real problem for
  // income-focused investors using DRIP.
  if (
    (a.includes("DIVIDEND") && a.includes("REINVEST")) ||
    a === "DIVIDEND_REINVESTED" ||
    a === "DIVIDEND_REINVESTMENT" ||
    a === "DRIP"
  )
    return "dividend_reinvested";

  // Non-dividend reinvestments (e.g. interest reinvested into a money
  // market) still look like buys to the cost-basis replay.
  if (a.includes("REINVEST") || a === "REI") return "buy";

  // Capital gain distributions from mutual funds behave like dividends
  // for reporting purposes. Catch both "CAPITAL GAIN" and the shorter
  // "CAP GAIN" / "CAP GN" that some exports use.
  if (a.includes("CAPITAL GAIN") || a.includes("CAP GAIN") || a.includes("CAP GN"))
    return "dividend";

  // Dividend umbrella — qualified, non-qualified, cash, stock, the
  // literal label DIV, and the DIS/DISTRIBUTION variants SnapTrade
  // returns for some European brokers.
  if (
    a.includes("DIVIDEND") ||
    a === "DIV" ||
    a === "CASH_DIVIDEND" ||
    a === "STOCK_DIVIDEND" ||
    a === "QUALIFIED_DIVIDEND" ||
    a === "NON_QUALIFIED_DIVIDEND" ||
    a === "DIS" ||
    a.includes("DISTRIBUTION") ||
    a.includes("RETURN OF CAPITAL") ||
    a === "ROC"
  )
    return "dividend";

  if (a.includes("BOUGHT") || a === "BUY" || a === "PURCHASED" || a === "PURCHASE") return "buy";
  if (a.includes("SOLD") || a === "SELL" || a === "SALE") return "sell";

  if (a.includes("INTEREST")) return "interest";

  if (a.includes("FEE") || a === "TAX" || a.includes("COMMISSION")) return "fee";

  if (
    a.includes("CONTRIBUTION") ||
    a.includes("WITHDRAWAL") ||
    a.includes("TRANSFER") ||
    a === "DEPOSIT" ||
    a === "TRANSFER_IN" ||
    a === "TRANSFER_OUT"
  )
    return "transfer";

  return null;
}
