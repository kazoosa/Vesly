/**
 * CSV import — parses broker-specific position/holding CSVs and creates
 * Item / Account / Holding rows matching the existing schema. This is the
 * universal fallback for brokers Plaid/SnapTrade don't cover (Fidelity,
 * Schwab, Vanguard, Robinhood).
 */
import { parse as parseCsv } from "csv-parse/sync";
import type { Developer } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library.js";
import { prisma } from "../db.js";
import { nanoid } from "nanoid";
import { hashSecret, randomToken, sha256Hex } from "../utils/crypto.js";
import { Errors } from "../utils/errors.js";
import { logger } from "../logger.js";
import { classifyActivity, type ActivityType } from "./activityClassifier.js";

export type Broker =
  | "fidelity"
  | "schwab"
  | "vanguard"
  | "robinhood"
  | "td_ameritrade"
  | "webull"
  | "ibkr";
export type CsvKind = "positions" | "activity";
export type { ActivityType };

interface ParsedPosition {
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  avgCost?: number;
  type?: string;
}

interface ParsedResult {
  accountName: string;
  accountMask: string | null;
  positions: ParsedPosition[];
}

interface ParsedActivity {
  accountNumber: string;
  accountName: string;
  runDate: Date;
  action: string;
  type: ActivityType;
  ticker: string;
  description: string;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
}

/** Institution ID each broker maps to in our seeded Institutions table. */
const INSTITUTION_MAP: Record<Broker, string> = {
  fidelity: "ins_10",
  schwab: "ins_9",
  vanguard: "ins_11",
  robinhood: "ins_12",
  td_ameritrade: "ins_13",
  webull: "ins_14",
  ibkr: "ins_15",
};

/** Human-friendly labels. */
export const BROKER_LABELS: Record<Broker, string> = {
  fidelity: "Fidelity",
  schwab: "Charles Schwab",
  vanguard: "Vanguard",
  robinhood: "Robinhood",
  td_ameritrade: "TD Ameritrade",
  webull: "Webull",
  ibkr: "Interactive Brokers",
};

/* ---------------------------------------------------------------- parsers */

function cleanNumber(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[$,"\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function cleanTicker(raw: string | undefined | null): string {
  return String(raw ?? "").trim().toUpperCase();
}

/**
 * Fidelity "Portfolio_Positions_*.csv" export format.
 * Typical headers: Account Number, Account Name, Symbol, Description,
 * Quantity, Last Price, Last Price Change, Current Value,
 * Today's Gain/Loss Dollar, ..., Cost Basis Total, Average Cost Basis, Type
 */
function parseFidelity(csv: string): ParsedResult[] {
  const rows = parseCsv(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const grouped = new Map<string, ParsedResult>();
  for (const r of rows) {
    const accNum = r["Account Number"] ?? r["Account"] ?? "";
    const accName = r["Account Name"] ?? r["Account Name/Number"] ?? "Fidelity";
    const ticker = cleanTicker(r["Symbol"]);
    if (!ticker || ticker === "PENDING ACTIVITY") continue;
    const quantity = cleanNumber(r["Quantity"]);
    if (quantity === 0) continue;

    const key = accNum || accName;
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = {
        accountName: accName || "Fidelity account",
        accountMask: accNum ? accNum.slice(-4) : null,
        positions: [],
      };
      grouped.set(key, bucket);
    }

    bucket.positions.push({
      ticker,
      name: r["Description"] ?? ticker,
      quantity,
      price: cleanNumber(r["Last Price"]),
      avgCost: cleanNumber(r["Average Cost Basis"]),
      type: r["Type"] ?? undefined,
    });
  }
  return [...grouped.values()];
}

/**
 * Charles Schwab "Positions_*.csv" format.
 * Typical headers: "Symbol", "Description", "Quantity", "Price", "Market Value",
 * "Cost Basis", "Security Type"
 * First row sometimes contains account metadata and must be skipped if
 * "Symbol" is not the first column in the heading row.
 */
function parseSchwab(csv: string): ParsedResult[] {
  // Schwab prepends some header lines like "Positions for account XXXXXX as of ..."
  // before the actual data. Strip anything before the line that starts with "Symbol" or '"Symbol"'.
  const lines = csv.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^\"?Symbol\"?,/.test(l));
  const effective = startIdx >= 0 ? lines.slice(startIdx).join("\n") : csv;

  const rows = parseCsv(effective, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const positions: ParsedPosition[] = [];
  for (const r of rows) {
    const ticker = cleanTicker(r["Symbol"]);
    if (!ticker || ticker === "CASH & CASH INVESTMENTS" || ticker === "ACCOUNT TOTAL")
      continue;
    const quantity = cleanNumber(r["Quantity"]);
    if (quantity === 0) continue;
    const price = cleanNumber(r["Price"] ?? r["Market Value"]);
    const costBasis = cleanNumber(r["Cost Basis"]);
    positions.push({
      ticker,
      name: r["Description"] ?? ticker,
      quantity,
      price,
      avgCost: quantity > 0 ? costBasis / quantity : price,
      type: r["Security Type"] ?? undefined,
    });
  }

  if (positions.length === 0) return [];
  return [
    {
      accountName: "Schwab Brokerage",
      accountMask: null,
      positions,
    },
  ];
}

/**
 * Vanguard "VG_Positions_*.csv" format.
 * Typical headers: Account Number, Investment Name, Symbol, Shares,
 * Share Price, Total Value
 */
function parseVanguard(csv: string): ParsedResult[] {
  const rows = parseCsv(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const grouped = new Map<string, ParsedResult>();
  for (const r of rows) {
    const accNum = r["Account Number"] ?? "";
    const ticker = cleanTicker(r["Symbol"]);
    if (!ticker) continue;
    const quantity = cleanNumber(r["Shares"]);
    if (quantity === 0) continue;

    const key = accNum || "vanguard";
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = {
        accountName: `Vanguard ${accNum ? "#" + accNum.slice(-4) : "Account"}`,
        accountMask: accNum ? accNum.slice(-4) : null,
        positions: [],
      };
      grouped.set(key, bucket);
    }

    bucket.positions.push({
      ticker,
      name: r["Investment Name"] ?? ticker,
      quantity,
      price: cleanNumber(r["Share Price"]),
    });
  }
  return [...grouped.values()];
}

/**
 * Robinhood doesn't offer a holdings CSV — only transaction history.
 * Users paste their holdings manually or export via a third-party tool.
 * For now we accept the same 3-column minimal format (Symbol, Quantity, Price).
 */
function parseRobinhood(csv: string): ParsedResult[] {
  const rows = parseCsv(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const positions: ParsedPosition[] = [];
  for (const r of rows) {
    const ticker = cleanTicker(r["Symbol"] ?? r["Ticker"]);
    if (!ticker) continue;
    const quantity = cleanNumber(r["Quantity"] ?? r["Shares"]);
    if (quantity === 0) continue;
    const price = cleanNumber(r["Price"] ?? r["Market Value"] ?? r["Current Price"]);
    positions.push({
      ticker,
      name: r["Name"] ?? r["Description"] ?? ticker,
      quantity,
      price,
      avgCost: cleanNumber(r["Average Cost"]) || price,
    });
  }

  if (positions.length === 0) return [];
  return [{ accountName: "Robinhood", accountMask: null, positions }];
}

function getParser(broker: Broker): (csv: string) => ParsedResult[] {
  switch (broker) {
    case "fidelity":
      return parseFidelity;
    case "schwab":
      return parseSchwab;
    case "vanguard":
      return parseVanguard;
    case "robinhood":
      return parseRobinhood;
    case "td_ameritrade":
      return parseTdAmeritrade;
    case "webull":
      return parseWebull;
    case "ibkr":
      return parseIbkr;
  }
}

/**
 * TD Ameritrade "Account Positions" CSV.
 * Typical headers: Symbol, Description, Qty, Price, Mkt Value, Avg Cost
 *  (older Schwab-acquisition era exports use "Quantity" instead of "Qty"
 *   and may include "Account" in the first lines as metadata).
 */
function parseTdAmeritrade(csv: string): ParsedResult[] {
  const rows = parseCsv(stripBom(csv), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const positions: ParsedPosition[] = [];
  for (const r of rows) {
    const ticker = cleanTicker(r["Symbol"] ?? r["SYMBOL"]);
    if (!ticker || ticker === "TOTAL" || ticker === "CASH") continue;
    const quantity = cleanNumber(r["Qty"] ?? r["Quantity"] ?? r["Shares"]);
    if (quantity === 0) continue;
    const price = cleanNumber(
      r["Price"] ?? r["Last Price"] ?? r["Mkt Value"] ?? r["Market Value"],
    );
    const avg = cleanNumber(r["Avg Cost"] ?? r["Average Cost"] ?? r["Cost"]);
    positions.push({
      ticker,
      name: r["Description"] ?? ticker,
      quantity,
      price,
      avgCost: avg || price,
    });
  }
  if (positions.length === 0) return [];
  return [{ accountName: "TD Ameritrade", accountMask: null, positions }];
}

/**
 * Webull "Positions" CSV.
 * Typical headers: Name, Symbol, Quantity, Price, Cost Price, Market Value
 *  (Webull also exports an "Orders" CSV with: Time in Force, Filled,
 *   Status, etc. — handled by parseWebullActivity below).
 */
function parseWebull(csv: string): ParsedResult[] {
  const rows = parseCsv(stripBom(csv), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const positions: ParsedPosition[] = [];
  for (const r of rows) {
    const ticker = cleanTicker(r["Symbol"] ?? r["Ticker"]);
    if (!ticker) continue;
    const quantity = cleanNumber(r["Quantity"] ?? r["Qty"]);
    if (quantity === 0) continue;
    const price = cleanNumber(r["Price"] ?? r["Last Price"] ?? r["Market Price"]);
    const cost = cleanNumber(r["Cost Price"] ?? r["Cost"] ?? r["Average Cost"]);
    positions.push({
      ticker,
      name: r["Name"] ?? r["Description"] ?? ticker,
      quantity,
      price,
      avgCost: cost || price,
    });
  }
  if (positions.length === 0) return [];
  return [{ accountName: "Webull", accountMask: null, positions }];
}

/**
 * Interactive Brokers "Activity Statement" / "Portfolio Snapshot" CSV.
 * IBKR Flex Queries produce CSVs with headers like:
 *   Symbol, Asset Class, Quantity, MarkPrice, CostBasisPrice, PositionValue
 * Their full Activity Statement format is multi-section, so we look at
 * standard portfolio-snapshot rows and ignore lines whose first column
 * is a section marker (e.g. "Statement", "BOS", "EOS").
 */
function parseIbkr(csv: string): ParsedResult[] {
  // IBKR statements often prepend non-data sections — find the line
  // whose first column begins with "Symbol" and parse from there.
  const lines = stripBom(csv).split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^"?(?:Symbol|Ticker|Conid)"?,/i.test(l.trim()));
  const effective = startIdx >= 0 ? lines.slice(startIdx).join("\n") : csv;

  const rows = parseCsv(effective, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const positions: ParsedPosition[] = [];
  for (const r of rows) {
    const ticker = cleanTicker(r["Symbol"] ?? r["Ticker"]);
    if (!ticker || ticker === "TOTAL") continue;
    // Skip non-equity rows (FX, futures, options) — we don't model them.
    const assetClass = (r["Asset Class"] ?? r["AssetClass"] ?? "").toUpperCase();
    if (assetClass && !["STK", "ETF", "FUND", "MF"].some((k) => assetClass.includes(k))) {
      continue;
    }
    const quantity = cleanNumber(r["Quantity"] ?? r["Qty"]);
    if (quantity === 0) continue;
    const price = cleanNumber(
      r["MarkPrice"] ?? r["Mark Price"] ?? r["Price"] ?? r["Last Price"],
    );
    const cost = cleanNumber(r["CostBasisPrice"] ?? r["Cost Basis Price"] ?? r["Cost Basis"]);
    positions.push({
      ticker,
      name: r["Description"] ?? r["Listing Exchange"] ?? ticker,
      quantity,
      price,
      avgCost: cost || price,
    });
  }
  if (positions.length === 0) return [];
  return [{ accountName: "Interactive Brokers", accountMask: null, positions }];
}

/* -------------------------------------------------------- activity parser */

/**
 * Parse a Fidelity "Accounts_History" / "Activity" CSV. Header fingerprint
 * is picked up separately by {@link detectCsvKind}; this function assumes
 * the caller has already confirmed the shape.
 *
 * Typical headers: Run Date, Account Name, Account Number, Action, Symbol,
 * Description, Security Type, Quantity, Price, Commission, Fees, Amount,
 * Settlement Date.
 */
function parseFidelityActivity(csv: string): ParsedActivity[] {
  const rows = parseCsv(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const out: ParsedActivity[] = [];
  for (const r of rows) {
    const action = (r["Action"] ?? "").trim();
    if (!action) continue;

    const type = classifyActivity(action);
    if (!type) {
      logger.warn({ action }, "csv activity: unrecognised action, skipping row");
      continue;
    }

    const runDateRaw = (r["Run Date"] ?? r["Trade Date"] ?? "").trim();
    if (!runDateRaw) continue;
    const runDate = parseFidelityDate(runDateRaw);
    if (!runDate) continue;

    const accountNumber = (r["Account Number"] ?? r["Account"] ?? "").trim();
    const accountName = (r["Account Name"] ?? "Fidelity").trim();
    const ticker = cleanTicker(r["Symbol"]) || "CASH";
    const description = (r["Description"] ?? r["Security Description"] ?? ticker).trim();
    const commission = cleanNumber(r["Commission"]);
    const feesCol = cleanNumber(r["Fees"]);

    out.push({
      accountNumber,
      accountName,
      runDate,
      action,
      type,
      ticker,
      description,
      quantity: Math.abs(cleanNumber(r["Quantity"])),
      price: cleanNumber(r["Price"]),
      amount: Math.abs(cleanNumber(r["Amount"])),
      fees: commission + feesCol,
    });
  }
  return out;
}

/** Fidelity's Run Date column is `MM/DD/YYYY`. */
function parseFidelityDate(raw: string): Date | null {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, mm, dd, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Tolerant date parser used by the generic activity importer. Accepts
 * `MM/DD/YYYY`, `YYYY-MM-DD`, ISO timestamps, and the `MM/DD/YYYY HH:MM:SS`
 * shape that TD/Webull use. Returns null when nothing parses cleanly so
 * callers can skip the row instead of writing garbage timestamps.
 */
function parseFlexibleDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // MM/DD/YYYY (with optional HH:MM[:SS])
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const [, mm, dd, yyyy] = us;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Generic activity/transaction CSV parser used by every broker except
 * Fidelity (which has its own dedicated parser above). Accepts a wide
 * set of common column aliases — date/symbol/ticker/quantity/price/
 * amount/action — so most exports parse without per-broker code.
 *
 * The classifier in {@link classifyActivity} decides whether each row
 * is a buy/sell/dividend/etc. Rows whose action doesn't classify are
 * logged and skipped (never thrown), matching the Fidelity behaviour.
 */
function parseGenericActivity(broker: Broker, csv: string): ParsedActivity[] {
  const rows = parseCsv(stripBom(csv), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const out: ParsedActivity[] = [];
  for (const r of rows) {
    const action = (
      r["Action"] ??
      r["Activity"] ??
      r["Transaction Type"] ??
      r["Type"] ??
      r["Side"] ??
      ""
    ).trim();
    if (!action) continue;

    const type = classifyActivity(action);
    if (!type) {
      logger.warn({ action, broker }, "csv activity: unrecognised action, skipping row");
      continue;
    }

    const dateRaw =
      r["Date"] ??
      r["Run Date"] ??
      r["Trade Date"] ??
      r["Settlement Date"] ??
      r["Filled Time"] ??
      r["Time"] ??
      "";
    const runDate = parseFlexibleDate(dateRaw);
    if (!runDate) continue;

    const accountNumber = (r["Account Number"] ?? r["Account"] ?? "").trim();
    const accountName = (r["Account Name"] ?? BROKER_LABELS[broker]).trim();
    const ticker = cleanTicker(r["Symbol"] ?? r["Ticker"] ?? r["Instrument"]) || "CASH";
    const description = (
      r["Description"] ??
      r["Security Description"] ??
      r["Name"] ??
      ticker
    ).trim();
    const commission = cleanNumber(r["Commission"] ?? r["Commission/Fees"]);
    const feesCol = cleanNumber(r["Fees"] ?? r["Reg Fee"] ?? r["SEC Fee"]);

    out.push({
      accountNumber,
      accountName,
      runDate,
      action,
      type,
      ticker,
      description,
      quantity: Math.abs(cleanNumber(r["Quantity"] ?? r["Filled"] ?? r["Shares"] ?? r["Qty"])),
      price: cleanNumber(r["Price"] ?? r["Avg Price"] ?? r["Avg Fill Price"]),
      amount: Math.abs(cleanNumber(r["Amount"] ?? r["Net Amount"] ?? r["Total"])),
      fees: commission + feesCol,
    });
  }
  return out;
}

/* -------------------------------------------------------------- public API */

/**
 * Parse a positions CSV without touching the DB — used by the frontend
 * preview step for holdings imports.
 */
export function previewCsv(broker: Broker, csv: string): ParsedResult[] {
  const parser = getParser(broker);
  try {
    return parser(stripBom(csv));
  } catch (err) {
    logger.warn({ err, broker }, "CSV parse failed");
    throw Errors.badRequest(
      `Couldn't parse that CSV. Make sure you're uploading the standard ${BROKER_LABELS[broker]} positions export.`,
    );
  }
}

/**
 * Parse an activity CSV for preview. Fidelity uses its dedicated parser
 * (which knows about the multi-section file shape); every other broker
 * routes through the column-alias-driven generic parser.
 */
export function previewActivityCsv(broker: Broker, csv: string): ParsedActivity[] {
  try {
    if (broker === "fidelity") return parseFidelityActivity(stripBom(csv));
    return parseGenericActivity(broker, csv);
  } catch (err) {
    logger.warn({ err, broker }, "CSV activity parse failed");
    throw Errors.badRequest(
      `Couldn't parse that activity CSV. Check the columns include date, symbol, action, quantity, price, and amount.`,
    );
  }
}

/**
 * Strip a UTF-8 BOM prefix if the browser/editor added one. Excel in
 * particular writes CSVs with `\uFEFF` at the start, which breaks both
 * substring matching on the first column name and CSV parsers that
 * don't auto-strip it.
 */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Normalise a header row for fingerprint matching: strip BOM, trim,
 * lower-case, collapse runs of whitespace, and strip surrounding
 * quotes on each column. Makes `has("account number")` robust against
 * `"Account  Number"`, `"ACCOUNT NUMBER"`, `Account Number,,,` etc.
 */
function normaliseHeader(header: string): string {
  return stripBom(header)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort broker detection from CSV headers.
 *
 * Reads only the first non-empty line (the header row) and matches
 * against the fingerprints each broker's export uses. Returns
 * `null` when the CSV doesn't match any known format; callers
 * should fall back to a manual picker.
 *
 * Recognises BOTH positions/holdings exports and activity/transaction
 * exports for the same broker — the CSV kind is distinguished
 * separately by {@link detectCsvKind}.
 */
export function detectBroker(csv: string): Broker | null {
  const raw = stripBom(csv);
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!firstLine) return null;
  const header = normaliseHeader(firstLine);
  const has = (needle: string) => header.includes(needle.toLowerCase());

  // IBKR's Activity Statement and Portfolio Snapshot share a unique
  // "MarkPrice" / "CostBasisPrice" pair seen nowhere else.
  if ((has("markprice") || has("mark price")) && has("symbol")) return "ibkr";
  if (has("costbasisprice") || has("cost basis price")) return "ibkr";
  if (has("conid")) return "ibkr"; // IBKR's contract ID column

  // Webull's positions header includes "Cost Price" (not "Cost Basis"
  // like other brokers) and a "Name" column that other brokers call
  // "Description".
  if (has("cost price") && (has("symbol") || has("ticker"))) return "webull";

  // TD Ameritrade uses "Qty" (rare) and "Mkt Value" (very rare). The
  // older positions export also has "Avg Cost".
  if ((has("qty") || has("quantity")) && (has("mkt value") || has("avg cost"))) {
    return "td_ameritrade";
  }

  // Fidelity activity export — "Run Date" + "Action" is a strong
  // fingerprint and must be checked before the Schwab branch (which
  // also matches on "Security Type").
  if (has("run date") && has("action")) return "fidelity";

  // Fidelity's Portfolio_Positions export
  if (has("account number") && has("cost basis total")) return "fidelity";

  // Vanguard — starts with "Fund Account Number" OR has the
  // "Trade Date" column seen on their Positions export
  if (has("fund account number") || (has("account number") && has("trade date"))) {
    return "vanguard";
  }

  // Schwab — Security Type + Cost Basis WITHOUT the Fidelity-style
  // "Account Number" column
  if (has("security type") && has("cost basis") && !has("account number")) {
    return "schwab";
  }

  // Robinhood doesn't export positions natively, so the docs tell
  // users to build a minimal 3-column CSV. Detect that narrow
  // shape: header is exactly "symbol,quantity,price" (any order).
  // Accept "ticker" as an alias for symbol and "shares" for quantity.
  const cols = header
    .split(",")
    .map((c) => c.replace(/^["'\s]+|["'\s]+$/g, ""));
  if (cols.length === 3) {
    const hasSymbol = cols.some((c) => c === "symbol" || c === "ticker");
    const hasQty = cols.some((c) => c === "quantity" || c === "shares");
    const hasPrice = cols.some((c) => c === "price");
    if (hasSymbol && hasQty && hasPrice) return "robinhood";
  }

  return null;
}

/**
 * Detect whether the CSV is a positions/holdings export or an activity
 * (transaction history) export. Currently recognises Fidelity's activity
 * shape by the presence of both "Run Date" and "Action" columns; returns
 * "positions" for everything else that looks CSV-shaped, and null when the
 * CSV is empty or malformed.
 */
export function detectCsvKind(csv: string): CsvKind | null {
  const firstLine = stripBom(csv).split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!firstLine) return null;
  const header = normaliseHeader(firstLine);
  if (header.includes("run date") && header.includes("action")) return "activity";
  return "positions";
}

/**
 * Import a CSV into the DB. Accepts either a positions export (holdings)
 * or an activity export (transactions + dividends); the CSV kind is
 * auto-detected and routed accordingly.
 *
 * Wrapped in try/catch that logs the full stack via logger.error and
 * rethrows as a readable badRequest. Without this, any unexpected
 * Prisma / parser error surfaces to the client as a generic 500
 * "Internal server error" which tells us and the user nothing.
 */
export async function importCsv(
  developer: Developer,
  broker: Broker,
  csv: string,
): Promise<{
  itemId: string;
  accounts: number;
  holdings: number;
  transactions: number;
  dividends: number;
  kind: CsvKind;
}> {
  try {
    return await importCsvInner(developer, broker, csv);
  } catch (err) {
    logger.error(
      { err, developerId: developer.id, broker },
      "importCsv failed",
    );
    // Prisma unique-constraint violations have a P2002 code — turn them
    // into a readable 400 instead of a generic 500. Any other Prisma or
    // unknown error falls through so the global error handler surfaces
    // the real bug (500 "Internal server error") rather than hiding it
    // behind a fake 400.
    if (err instanceof PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        const target = Array.isArray(err.meta?.target)
          ? (err.meta!.target as string[]).join(", ")
          : String(err.meta?.target ?? "");
        throw Errors.badRequest(
          `Your CSV has duplicate rows for ${target || "a row"} — combine lots into one row and retry.`,
        );
      }
      throw err;
    }
    if (err instanceof Error) {
      const status = (err as { status?: number }).status;
      if (status && status >= 400 && status < 500) throw err;
    }
    throw err;
  }
}

async function importCsvInner(
  developer: Developer,
  broker: Broker,
  csv: string,
): Promise<{
  itemId: string;
  accounts: number;
  holdings: number;
  transactions: number;
  dividends: number;
  kind: CsvKind;
}> {
  csv = stripBom(csv);
  const kind = detectCsvKind(csv) ?? "positions";

  // Shared setup — institution, application, and item rows. These are
  // idempotent and safe to run outside the write transaction.
  const institutionId = INSTITUTION_MAP[broker];
  await prisma.institution.upsert({
    where: { id: institutionId },
    update: {},
    create: {
      id: institutionId,
      name: BROKER_LABELS[broker],
      primaryColor: brokerColor(broker),
      supportedProducts: ["investments"],
      routingNumbers: [],
    },
  });

  const application = await ensureInternalApplication(developer);

  const itemClientUserId = `csv_${developer.id}`;
  let item = await prisma.item.findFirst({
    where: {
      applicationId: application.id,
      institutionId,
      clientUserId: itemClientUserId,
    },
  });
  if (!item) {
    item = await prisma.item.create({
      data: {
        applicationId: application.id,
        institutionId,
        clientUserId: itemClientUserId,
        accessTokenHash: sha256Hex(`csv-${randomToken(16)}`),
        status: "GOOD",
        products: ["investments"],
      },
    });
  }

  if (kind === "activity") {
    return importActivityCsv(developer, broker, csv, item.id);
  }
  return importPositionsCsv(developer, broker, csv, item.id);
}

async function importPositionsCsv(
  developer: Developer,
  broker: Broker,
  csv: string,
  itemId: string,
) {
  const parsed = previewCsv(broker, csv);
  if (parsed.length === 0) {
    throw Errors.badRequest("No holdings found in that file.");
  }

  // Wrap wipe + recreate in a single transaction so a partial failure
  // rolls everything back instead of leaving orphan accounts.
  // Default Prisma timeout is 5 s — large positions CSVs with hundreds
  // of holdings blow through that, and when the transaction times out
  // the writes ARE rolled back but the thrown error falls through to
  // the global 500 handler. Bumping the timeout to 30 s covers the
  // common case; anything larger should be chunked.
  const result = await prisma.$transaction(async (tx) => {
    const existingAccounts = await tx.account.findMany({
      where: { itemId },
      select: { id: true },
    });
    if (existingAccounts.length > 0) {
      const accIds = existingAccounts.map((a) => a.id);
      await tx.investmentHolding.deleteMany({ where: { accountId: { in: accIds } } });
      await tx.investmentTransaction.deleteMany({ where: { accountId: { in: accIds } } });
      await tx.account.deleteMany({ where: { id: { in: accIds } } });
    }

    let accountsTouched = 0;
    let holdingsCreated = 0;
    for (const group of parsed) {
      const account = await tx.account.create({
        data: {
          itemId,
          name: group.accountName,
          officialName: BROKER_LABELS[broker],
          mask: group.accountMask ?? "0000",
          type: "investment",
          subtype: "brokerage",
          currentBalance: group.positions.reduce((s, p) => s + p.quantity * p.price, 0),
          availableBalance: group.positions.reduce((s, p) => s + p.quantity * p.price, 0),
          isoCurrencyCode: "USD",
        },
      });
      accountsTouched++;

      // Many brokers (Fidelity, Schwab, IBKR) export multiple lots of the
      // same security as separate rows. The InvestmentHolding table has
      // a unique (accountId, securityId) constraint, so inserting both
      // rows triggers a P2002 collision that surfaces as "Your CSV has
      // duplicate rows for accountId, securityId — combine lots into one
      // row and retry." even when the CSV is structurally fine.
      //
      // Combine duplicate tickers within each account: sum quantity, sum
      // cost basis, and recompute avgCost. Use the latest non-zero price.
      const merged = new Map<string, typeof group.positions[number]>();
      for (const pos of group.positions) {
        const key = (pos.ticker ?? "").toUpperCase();
        if (!key) continue;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { ...pos });
          continue;
        }
        const totalQty = existing.quantity + pos.quantity;
        const existingBasis = (existing.avgCost ?? existing.price) * existing.quantity;
        const incomingBasis = (pos.avgCost ?? pos.price) * pos.quantity;
        existing.quantity = totalQty;
        existing.avgCost = totalQty > 0 ? (existingBasis + incomingBasis) / totalQty : pos.price;
        if (pos.price > 0) existing.price = pos.price;
      }

      for (const pos of merged.values()) {
        const security = await upsertSecurityWithTx(tx, pos);
        // Use upsert keyed on the (accountId, securityId) unique so the
        // import stays idempotent even if a previous disconnect didn't
        // cascade cleanly — without this, leftover holdings from a stale
        // account (or a Prisma migration that didn't apply onDelete:
        // Cascade in prod) trigger the misleading "duplicate rows for
        // accountId, securityId" error and lock the user out of import.
        await tx.investmentHolding.upsert({
          where: {
            accountId_securityId: { accountId: account.id, securityId: security.id },
          },
          create: {
            accountId: account.id,
            securityId: security.id,
            quantity: pos.quantity,
            institutionPrice: pos.price,
            institutionPriceAsOf: new Date(),
            institutionValue: pos.quantity * pos.price,
            costBasis: (pos.avgCost ?? pos.price) * pos.quantity,
            isoCurrencyCode: "USD",
          },
          update: {
            quantity: pos.quantity,
            institutionPrice: pos.price,
            institutionPriceAsOf: new Date(),
            institutionValue: pos.quantity * pos.price,
            costBasis: (pos.avgCost ?? pos.price) * pos.quantity,
          },
        });
        holdingsCreated++;
      }
    }
    return { accountsTouched, holdingsCreated };
  }, { timeout: 30_000, maxWait: 10_000 });

  logger.info(
    {
      developerId: developer.id,
      broker,
      kind: "positions",
      accountsTouched: result.accountsTouched,
      holdingsCreated: result.holdingsCreated,
    },
    "CSV import complete",
  );

  return {
    itemId,
    accounts: result.accountsTouched,
    holdings: result.holdingsCreated,
    transactions: 0,
    dividends: 0,
    kind: "positions" as const,
  };
}

async function importActivityCsv(
  developer: Developer,
  broker: Broker,
  csv: string,
  itemId: string,
) {
  const activities =
    broker === "fidelity"
      ? parseFidelityActivity(csv)
      : parseGenericActivity(broker, csv);
  if (activities.length === 0) {
    throw Errors.badRequest("No recognised transactions found in that file.");
  }

  // Group activities by accountNumber so we attach them to one Account
  // row per brokerage account referenced in the file.
  const byAccount = new Map<string, ParsedActivity[]>();
  for (const act of activities) {
    const key = act.accountNumber || act.accountName || "default";
    const bucket = byAccount.get(key);
    if (bucket) bucket.push(act);
    else byAccount.set(key, [act]);
  }

  const result = await prisma.$transaction(async (tx) => {
    let accountsTouched = 0;
    let transactionsUpserted = 0;
    let dividendsUpserted = 0;

    for (const [, bucket] of byAccount) {
      const first = bucket[0]!;
      const mask = (first.accountNumber || "").slice(-4) || "0000";

      // Compute a running cash-flow estimate from the activities. Without
      // this, activity-only accounts (no prior positions import) had
      // currentBalance hardcoded to 0 and every Net Worth / per-account
      // value rendered as $0.00. For mixed accounts (positions + activity)
      // we keep the higher of the existing balance and the cash-flow
      // estimate so a positions snapshot's mark-to-market value isn't
      // overwritten by a partial activity history.
      const cashFlow = bucket.reduce((sum, a) => {
        const amt = Number(a.amount) || 0;
        if (a.type === "buy" || a.type === "fee") return sum - amt;
        // sell, dividend, interest, transfer all flow money in.
        return sum + amt;
      }, 0);

      // Find an existing CSV-sourced account with the same mask under
      // this item, else create one. Activity imports attach to prior
      // positions accounts when possible so holdings + transactions
      // share the same Account row.
      let account = await tx.account.findFirst({
        where: { itemId, mask },
      });
      if (!account) {
        account = await tx.account.create({
          data: {
            itemId,
            name: first.accountName || `${BROKER_LABELS[broker]} Account`,
            officialName: BROKER_LABELS[broker],
            mask,
            type: "investment",
            subtype: "brokerage",
            currentBalance: cashFlow,
            availableBalance: cashFlow,
            isoCurrencyCode: "USD",
          },
        });
        accountsTouched++;
      } else {
        // Mixed account: bump balance if cash-flow estimate exceeds the
        // current snapshot. Never lower a real positions-derived balance.
        if (cashFlow > Number(account.currentBalance ?? 0)) {
          account = await tx.account.update({
            where: { id: account.id },
            data: { currentBalance: cashFlow, availableBalance: cashFlow },
          });
        }
      }

      for (let i = 0; i < bucket.length; i++) {
        const act = bucket[i]!;
        const security = await upsertSecurityWithTx(tx, {
          ticker: act.ticker,
          name: act.description,
          quantity: 0,
          price: act.price,
        });

        const runDateKey = act.runDate.toISOString().slice(0, 10);
        const actionKey = act.action.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40);
        const externalId =
          `csv_${developer.id}_${broker}_${runDateKey}_${actionKey}_${act.ticker}_${act.amount.toFixed(2)}_${i}`;

        await tx.investmentTransaction.upsert({
          where: { snaptradeOrderId: externalId },
          update: {},
          create: {
            accountId: account.id,
            securityId: security.id,
            snaptradeOrderId: externalId,
            date: act.runDate,
            name: act.description || `${act.type} ${act.ticker}`,
            type: act.type,
            quantity: act.quantity,
            price: act.price,
            amount: act.amount,
            fees: act.fees,
            isoCurrencyCode: "USD",
          },
        });
        if (act.type === "dividend") dividendsUpserted++;
        else transactionsUpserted++;
      }
    }

    return { accountsTouched, transactionsUpserted, dividendsUpserted };
  }, { timeout: 30_000, maxWait: 10_000 });

  logger.info(
    {
      developerId: developer.id,
      broker,
      kind: "activity",
      accountsTouched: result.accountsTouched,
      transactionsUpserted: result.transactionsUpserted,
      dividendsUpserted: result.dividendsUpserted,
    },
    "CSV import complete",
  );

  return {
    itemId,
    accounts: result.accountsTouched,
    holdings: 0,
    transactions: result.transactionsUpserted,
    dividends: result.dividendsUpserted,
    kind: "activity" as const,
  };
}

/* --------------------------------------------------------------- internals */

async function ensureInternalApplication(developer: Developer) {
  const existing = await prisma.application.findFirst({ where: { developerId: developer.id } });
  if (existing) return existing;
  return prisma.application.create({
    data: {
      developerId: developer.id,
      name: `${developer.email}'s Portfolio`,
      clientId: `cli_${nanoid(24)}`,
      clientSecretHash: await hashSecret(nanoid(40)),
      redirectUris: [],
      allowedProducts: ["investments"],
      environment: "sandbox",
    },
  });
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function upsertSecurity(pos: ParsedPosition) {
  return upsertSecurityWithTx(prisma, pos);
}

async function upsertSecurityWithTx(
  tx: PrismaTx | typeof prisma,
  pos: ParsedPosition,
) {
  const normalizedType = classifyType(pos.type);
  return tx.security.upsert({
    where: { tickerSymbol: pos.ticker },
    update: {
      name: pos.name,
      closePrice: pos.price,
      closePriceAsOf: new Date(),
      ...(normalizedType ? { type: normalizedType } : {}),
    },
    create: {
      tickerSymbol: pos.ticker,
      name: pos.name,
      type: normalizedType ?? "equity",
      closePrice: pos.price,
      closePriceAsOf: new Date(),
      isoCurrencyCode: "USD",
    },
  });
}

function classifyType(t?: string): string | null {
  if (!t) return null;
  const s = t.toLowerCase();
  if (s.includes("etf")) return "etf";
  if (s.includes("mutual")) return "mutual_fund";
  if (s.includes("bond") || s.includes("fixed")) return "fixed_income";
  if (s.includes("cash") || s.includes("money market")) return "cash";
  if (s.includes("stock") || s.includes("equity") || s.includes("common")) return "equity";
  return null;
}

function brokerColor(b: Broker): string {
  switch (b) {
    case "fidelity":
      return "#42a047";
    case "schwab":
      return "#00a0df";
    case "vanguard":
      return "#960000";
    case "robinhood":
      return "#c0ff00";
    case "td_ameritrade":
      return "#76b82a";
    case "webull":
      return "#1668e3";
    case "ibkr":
      return "#d81222";
  }
}
