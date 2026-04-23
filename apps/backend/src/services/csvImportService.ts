/**
 * CSV import — parses broker-specific position/holding CSVs and creates
 * Item / Account / Holding rows matching the existing schema. This is the
 * universal fallback for brokers Plaid/SnapTrade don't cover (Fidelity,
 * Schwab, Vanguard, Robinhood).
 */
import { parse as parseCsv } from "csv-parse/sync";
import type { Developer } from "@prisma/client";
import { prisma } from "../db.js";
import { nanoid } from "nanoid";
import { hashSecret, randomToken, sha256Hex } from "../utils/crypto.js";
import { Errors } from "../utils/errors.js";
import { logger } from "../logger.js";

export type Broker = "fidelity" | "schwab" | "vanguard" | "robinhood";

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

/** Institution ID each broker maps to in our seeded Institutions table. */
const INSTITUTION_MAP: Record<Broker, string> = {
  fidelity: "ins_10",
  schwab: "ins_9",
  vanguard: "ins_11",
  robinhood: "ins_12",
};

/** Human-friendly labels. */
export const BROKER_LABELS: Record<Broker, string> = {
  fidelity: "Fidelity",
  schwab: "Charles Schwab",
  vanguard: "Vanguard",
  robinhood: "Robinhood",
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
  }
}

/* -------------------------------------------------------------- public API */

/**
 * Parse a CSV without touching the DB — used by the frontend preview step.
 */
export function previewCsv(broker: Broker, csv: string): ParsedResult[] {
  const parser = getParser(broker);
  try {
    return parser(csv);
  } catch (err) {
    logger.warn({ err, broker }, "CSV parse failed");
    throw Errors.badRequest(
      `Couldn't parse that CSV. Make sure you're uploading the standard ${BROKER_LABELS[broker]} positions export.`,
    );
  }
}

/**
 * Best-effort broker detection from CSV headers.
 *
 * Reads only the first non-empty line (the header row) and matches
 * against the fingerprints each broker's export uses. Returns
 * `null` when the CSV doesn't match any known format; callers
 * should fall back to a manual picker.
 *
 * The checks are intentionally narrow — we'd rather return null and
 * ask than misclassify a CSV and dump it into the wrong parser.
 */
export function detectBroker(csv: string): Broker | null {
  const firstLine = csv.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!firstLine) return null;
  const header = firstLine.toLowerCase();
  const has = (needle: string) => header.includes(needle.toLowerCase());

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
  const cols = header.split(",").map((c) => c.trim());
  if (
    cols.length === 3 &&
    cols.includes("symbol") &&
    cols.includes("quantity") &&
    cols.includes("price")
  ) {
    return "robinhood";
  }

  return null;
}

/**
 * Import a CSV into the DB. Creates a new Item per broker (reusing an
 * existing one if a CSV import for that broker is already present for this
 * user) and replaces its holdings to match the uploaded file.
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
): Promise<{ itemId: string; accounts: number; holdings: number }> {
  try {
    return await importCsvInner(developer, broker, csv);
  } catch (err) {
    logger.error(
      { err, developerId: developer.id, broker },
      "importCsv failed",
    );
    if (err instanceof Error) {
      // Re-throw as a 400 so the frontend shows the real reason.
      // ApiError thrown inside importCsvInner (via Errors.badRequest)
      // already has a status; pass it through unchanged.
      const status = (err as { status?: number }).status;
      if (status && status >= 400 && status < 500) throw err;
      throw Errors.badRequest(err.message || "CSV import failed");
    }
    throw Errors.badRequest("CSV import failed");
  }
}

async function importCsvInner(
  developer: Developer,
  broker: Broker,
  csv: string,
): Promise<{ itemId: string; accounts: number; holdings: number }> {
  const parsed = previewCsv(broker, csv);
  if (parsed.length === 0) {
    throw Errors.badRequest("No holdings found in that file.");
  }

  const institutionId = INSTITUTION_MAP[broker];
  // Ensure institution exists (Vanguard may be missing in older seeds)
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

  // One Item per broker per user (CSV-sourced items are keyed by institution)
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

  let accountsTouched = 0;
  let holdingsCreated = 0;

  // Wipe old accounts + holdings for this item so re-import is idempotent
  const existingAccounts = await prisma.account.findMany({
    where: { itemId: item.id },
    select: { id: true },
  });
  if (existingAccounts.length > 0) {
    const accIds = existingAccounts.map((a) => a.id);
    await prisma.investmentHolding.deleteMany({ where: { accountId: { in: accIds } } });
    await prisma.investmentTransaction.deleteMany({ where: { accountId: { in: accIds } } });
    await prisma.account.deleteMany({ where: { id: { in: accIds } } });
  }

  for (const group of parsed) {
    const account = await prisma.account.create({
      data: {
        itemId: item.id,
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

    for (const pos of group.positions) {
      const security = await upsertSecurity(pos);
      await prisma.investmentHolding.create({
        data: {
          accountId: account.id,
          securityId: security.id,
          quantity: pos.quantity,
          institutionPrice: pos.price,
          institutionPriceAsOf: new Date(),
          institutionValue: pos.quantity * pos.price,
          costBasis: (pos.avgCost ?? pos.price) * pos.quantity,
          isoCurrencyCode: "USD",
        },
      });
      holdingsCreated++;
    }
  }

  logger.info(
    { developerId: developer.id, broker, accountsTouched, holdingsCreated },
    "CSV import complete",
  );

  return { itemId: item.id, accounts: accountsTouched, holdings: holdingsCreated };
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

async function upsertSecurity(pos: ParsedPosition) {
  const normalizedType = classifyType(pos.type);
  return prisma.security.upsert({
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
  }
}
