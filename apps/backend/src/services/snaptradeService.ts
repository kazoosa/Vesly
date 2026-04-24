/**
 * SnapTrade integration.
 *
 * Free tier covers 5 brokerage connections per end-user — enough for a personal
 * portfolio tracker across Fidelity / Schwab / Robinhood / etc.
 *
 * Docs: https://docs.snaptrade.com/docs
 */
import { Snaptrade } from "snaptrade-typescript-sdk";
import { randomUUID } from "node:crypto";
import type { Developer } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { Errors } from "../utils/errors.js";
import { classifyActivity } from "./activityClassifier.js";

let clientInstance: Snaptrade | null = null;

export function isSnapTradeConfigured(): boolean {
  return Boolean(config.SNAPTRADE_CLIENT_ID && config.SNAPTRADE_CONSUMER_KEY);
}

function client(): Snaptrade {
  if (!isSnapTradeConfigured()) {
    throw Errors.badRequest(
      "SnapTrade is not configured. Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY in the backend environment.",
    );
  }
  if (!clientInstance) {
    clientInstance = new Snaptrade({
      clientId: config.SNAPTRADE_CLIENT_ID,
      consumerKey: config.SNAPTRADE_CONSUMER_KEY,
    });
  }
  return clientInstance;
}

/**
 * Registers the developer with SnapTrade on first call and caches
 * { userId, userSecret } on the row. Idempotent.
 */
export async function ensureSnapTradeUser(
  developer: Developer,
): Promise<{ userId: string; userSecret: string }> {
  if (developer.snaptradeUserId && developer.snaptradeUserSecret) {
    return {
      userId: developer.snaptradeUserId,
      userSecret: developer.snaptradeUserSecret,
    };
  }
  const st = client();
  const userId = developer.id; // stable unique per-developer
  const res = await st.authentication.registerSnapTradeUser({ userId });
  const userSecret = res.data?.userSecret;
  if (!userSecret) throw Errors.badRequest("SnapTrade registration failed — no userSecret returned");
  await prisma.developer.update({
    where: { id: developer.id },
    data: { snaptradeUserId: userId, snaptradeUserSecret: userSecret },
  });
  logger.info({ developerId: developer.id }, "registered SnapTrade user");
  return { userId, userSecret };
}

/**
 * Generates a connection-portal URL the frontend can open in an iframe/popup.
 * The SnapTrade portal handles broker selection + login + MFA.
 */
export async function createConnectionPortalUrl(
  developer: Developer,
  opts: { customRedirect?: string; connectionType?: "read" | "trade" } = {},
): Promise<string> {
  const st = client();
  const { userId, userSecret } = await ensureSnapTradeUser(developer);
  const res = await st.authentication.loginSnapTradeUser({
    userId,
    userSecret,
    customRedirect: opts.customRedirect,
    connectionType: opts.connectionType ?? "read",
  });
  const data = res.data as { redirectURI?: string };
  if (!data?.redirectURI) throw Errors.badRequest("SnapTrade login failed — no redirect URI");
  return data.redirectURI;
}

/**
 * Pulls all connections + accounts + positions + orders for a developer
 * and upserts into our existing Prisma tables. Safe to call multiple times.
 */
export async function syncDeveloper(developer: Developer): Promise<{
  connections: number;
  accounts: number;
  holdings: number;
  transactions: number;
  raw_activities: number;
  skipped_unknown: number;
  skipped_labels: string[];
}> {
  const st = client();
  const { userId, userSecret } = await ensureSnapTradeUser(developer);

  // Each developer gets an implicit internal "application" to own their items.
  const application = await ensureInternalApplication(developer);

  const connRes = await st.connections.listBrokerageAuthorizations({ userId, userSecret });
  const connections = (connRes.data as unknown as Array<Record<string, unknown>>) ?? [];

  let accountsCount = 0;
  let holdingsCount = 0;
  let txCount = 0;
  // Tracking the raw counts SnapTrade returns vs what we wrote, so the
  // sync result can tell the user "SnapTrade returned 247 activities but
  // 247 were unrecognised types" vs "SnapTrade returned 0" — those two
  // failure modes need different fixes.
  let rawActivitiesFetched = 0;
  let skippedUnknownTotal = 0;
  const skippedUnknownLabels = new Set<string>();

  for (const conn of connections) {
    const connId = String(conn.id);
    const brokerage = conn.brokerage as { slug?: string; name?: string; aws_s3_logo_url?: string } | undefined;
    const brokerSlug = brokerage?.slug ?? "unknown";
    const brokerName = brokerage?.name ?? brokerSlug;

    // Upsert Institution (keyed by "st_<slug>" to avoid colliding with seeded ins_* IDs)
    const institutionId = `st_${brokerSlug.toLowerCase()}`;
    await prisma.institution.upsert({
      where: { id: institutionId },
      update: { name: brokerName },
      create: {
        id: institutionId,
        name: brokerName,
        primaryColor: hashColor(brokerName),
        supportedProducts: ["investments", "balance", "identity"],
        routingNumbers: [],
      },
    });

    // Upsert Item (one per SnapTrade connection)
    const item = await prisma.item.upsert({
      where: { snaptradeConnectionId: connId },
      update: {
        status: conn.disabled ? "ERROR" : "GOOD",
      },
      create: {
        applicationId: application.id,
        institutionId,
        clientUserId: developer.id,
        accessTokenHash: `snaptrade:${connId}`, // placeholder, never used as a real access token
        snaptradeConnectionId: connId,
        status: conn.disabled ? "ERROR" : "GOOD",
        products: ["investments", "balance", "identity"],
      },
    });

    // Accounts under this connection
    const accRes = await st.accountInformation.listUserAccounts({ userId, userSecret });
    const allAccounts = (accRes.data as unknown as Array<Record<string, unknown>>) ?? [];
    const accountsForConn = allAccounts.filter(
      (a) => String(a.brokerage_authorization) === connId,
    );

    for (const acc of accountsForConn) {
      const accId = String(acc.id);
      const balance = (acc.balance as { total?: { amount?: number } } | undefined)?.total?.amount ?? 0;
      const accountName = String(acc.name ?? "Brokerage Account");
      const accountMask = String(
        acc.number ?? "0000",
      ).slice(-4);

      const account = await prisma.account.upsert({
        where: { snaptradeAccountId: accId },
        update: {
          currentBalance: balance,
          availableBalance: balance,
          name: accountName,
          mask: accountMask,
        },
        create: {
          itemId: item.id,
          snaptradeAccountId: accId,
          name: accountName,
          officialName: String(acc.institution_name ?? ""),
          mask: accountMask,
          type: "investment",
          subtype: "brokerage",
          currentBalance: balance,
          availableBalance: balance,
          isoCurrencyCode: "USD",
        },
      });
      accountsCount++;

      // --- Positions ---
      const posRes = await st.accountInformation.getUserAccountPositions({
        userId,
        userSecret,
        accountId: accId,
      });
      const positions = (posRes.data as unknown as Array<Record<string, unknown>>) ?? [];

      // Remove stale holdings — simplest approach: wipe + recreate per sync
      await prisma.investmentHolding.deleteMany({ where: { accountId: account.id } });

      for (const pos of positions) {
        const symbol = pos.symbol as
          | {
              symbol?: { symbol?: string; description?: string; type?: { description?: string } };
              price?: number;
              units?: number;
              average_purchase_price?: number;
            }
          | undefined;
        const ticker = symbol?.symbol?.symbol ?? String(pos.symbol ?? "").toUpperCase();
        if (!ticker) continue;
        const security = await upsertSecurity(ticker, symbol?.symbol?.description ?? ticker, symbol?.price ?? 0, symbol?.symbol?.type?.description);
        const quantity = Number(pos.units ?? symbol?.units ?? 0);
        const price = Number(pos.price ?? symbol?.price ?? 0);
        const avgCost = Number(pos.average_purchase_price ?? symbol?.average_purchase_price ?? price);
        const value = quantity * price;
        const costBasis = quantity * avgCost;

        await prisma.investmentHolding.create({
          data: {
            accountId: account.id,
            securityId: security.id,
            quantity,
            institutionPrice: price,
            institutionPriceAsOf: new Date(),
            institutionValue: value,
            costBasis,
            isoCurrencyCode: "USD",
          },
        });
        holdingsCount++;
      }

      // --- Orders / activities ---
      // SnapTrade's getActivities defaults to a short rolling window when
      // no dates are passed, which drops most historical dividends and
      // transactions. Pass an explicit lookback so first-time syncs pull
      // in the full user history.
      //
      // Notes from debugging Robinhood returning zero:
      //  * The `accounts` parameter is a comma-separated string of account
      //    IDs. Some SnapTrade SDK versions reject a single bare ID and
      //    return [] silently. Omitting the filter and pulling all
      //    activities for the user (we already iterate per-account, so
      //    we filter client-side via act.account.id) is more reliable.
      //  * Multi-year first-time pulls have been observed to return [] for
      //    Robinhood specifically; default the window to 1 year now and let
      //    follow-up syncs extend it via SNAPTRADE_HISTORY_YEARS=5 if the
      //    operator wants the full back-history.
      const years = parseInt(process.env.SNAPTRADE_HISTORY_YEARS ?? "1", 10);
      const today = new Date();
      const startDate = new Date(today);
      startDate.setFullYear(today.getFullYear() - years);
      const actRes = await st.transactionsAndReporting.getActivities({
        userId,
        userSecret,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: today.toISOString().slice(0, 10),
      });
      const allActivities = (actRes.data as unknown as Array<Record<string, unknown>>) ?? [];
      // Client-side filter to this account, since we dropped the server filter.
      const activities = allActivities.filter((a) => {
        const acctRef = a.account as { id?: string } | string | undefined;
        const id = typeof acctRef === "string" ? acctRef : acctRef?.id;
        return !id || id === accId; // include rows with no account ref (cash divs etc.)
      });
      rawActivitiesFetched += activities.length;
      logger.info(
        { accountId: accId, activityCount: activities.length, totalReturned: allActivities.length },
        "snaptrade activities fetched",
      );

      let skippedUnknown = 0;
      for (const act of activities) {
        const rawType = String(act.type ?? act.action ?? "").toUpperCase().trim();
        const mapped = mapActivityType(rawType);
        if (!mapped) {
          // Don't silently drop — log the raw label so ops can see what
          // the classifier is missing and we can extend coverage.
          skippedUnknown++;
          skippedUnknownTotal++;
          if (rawType) {
            skippedUnknownLabels.add(rawType);
            logger.warn({ rawType, accountId: accId }, "snaptrade: unrecognised activity type");
          }
          continue;
        }

        const { ticker, description } = extractSnapTradeSymbol(act);
        const price = safeNumber(act.price);
        const units = safeNumber(act.units);
        const amount = Math.abs(safeNumber(act.amount, price * units));
        const fees = Math.abs(safeNumber(act.fee));

        // Prefer trade_date; fall back to settlement_date; last resort
        // is `new Date()` so we never fail outright (a misdated row is
        // better than losing the row entirely — operator can reconcile).
        const date = parseIsoDate(act.trade_date) ?? parseIsoDate(act.settlement_date) ?? new Date();
        const tradeDateKey = date.toISOString().slice(0, 10);

        const security = await upsertSecurity(ticker, description, price);

        // Use SnapTrade's id when present; fall back to a deterministic
        // composite so we never silently drop rows and re-syncs remain
        // idempotent via the unique snaptradeOrderId constraint.
        const rawId = String(act.id ?? "").trim();
        const orderId = rawId
          || `snaptrade_${accId}_${tradeDateKey}_${mapped}_${ticker}_${amount.toFixed(2)}`;

        try {
          await prisma.investmentTransaction.upsert({
            where: { snaptradeOrderId: orderId },
            update: {},
            create: {
              accountId: account.id,
              securityId: security.id,
              snaptradeOrderId: orderId,
              date,
              name: String(act.description ?? description ?? `${mapped} ${ticker}`),
              type: mapped,
              quantity: Math.abs(units),
              price,
              amount,
              fees,
              isoCurrencyCode: extractCurrency(act.currency) ?? "USD",
            },
          });
          txCount++;
        } catch (err) {
          logger.warn({ err, orderId }, "failed to upsert activity");
        }
      }
      if (skippedUnknown > 0) {
        logger.info(
          { accountId: accId, skippedUnknown },
          "snaptrade activities skipped (unrecognised type)",
        );
      }
    }
  }

  logger.info(
    {
      developerId: developer.id,
      connections: connections.length,
      accountsCount,
      holdingsCount,
      txCount,
      rawActivitiesFetched,
      skippedUnknownTotal,
      skippedUnknownLabels: [...skippedUnknownLabels],
    },
    "SnapTrade sync complete",
  );

  return {
    connections: connections.length,
    accounts: accountsCount,
    holdings: holdingsCount,
    transactions: txCount,
    // Diagnostics so the UI can distinguish "broker returned nothing" from
    // "broker returned activities but Beacon's classifier didn't recognise
    // their type labels".
    raw_activities: rawActivitiesFetched,
    skipped_unknown: skippedUnknownTotal,
    skipped_labels: [...skippedUnknownLabels],
  };
}

export async function deleteSnapTradeConnection(developer: Developer, connectionId: string) {
  const st = client();
  const { userId, userSecret } = await ensureSnapTradeUser(developer);
  await st.connections.removeBrokerageAuthorization({
    userId,
    userSecret,
    authorizationId: connectionId,
  });
  await prisma.item.deleteMany({ where: { snaptradeConnectionId: connectionId } });
}

/**
 * Creates (or returns existing) the internal Application row each Developer
 * owns. SnapTrade-sourced Items hang off this application.
 */
async function ensureInternalApplication(developer: Developer) {
  const existing = await prisma.application.findFirst({ where: { developerId: developer.id } });
  if (existing) return existing;
  const { nanoid } = await import("nanoid");
  const { hashSecret } = await import("../utils/crypto.js");
  return prisma.application.create({
    data: {
      developerId: developer.id,
      name: `${developer.email}'s Portfolio`,
      clientId: `cli_${nanoid(24)}`,
      clientSecretHash: await hashSecret(nanoid(40)),
      redirectUris: [],
      allowedProducts: ["investments", "balance", "identity"],
      environment: "sandbox",
    },
  });
}

async function upsertSecurity(
  ticker: string,
  name: string,
  price: number,
  typeDescription?: string,
) {
  const normalizedType = classifySecurityType(typeDescription);
  return prisma.security.upsert({
    where: { tickerSymbol: ticker },
    update: {
      name,
      closePrice: price,
      closePriceAsOf: new Date(),
      ...(normalizedType ? { type: normalizedType } : {}),
    },
    create: {
      tickerSymbol: ticker,
      name,
      type: normalizedType ?? "equity",
      closePrice: price,
      closePriceAsOf: new Date(),
      isoCurrencyCode: "USD",
    },
  });
}

function classifySecurityType(desc?: string): string | null {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (d.includes("etf")) return "etf";
  if (d.includes("mutual")) return "mutual_fund";
  if (d.includes("bond") || d.includes("fixed")) return "fixed_income";
  if (d.includes("cash")) return "cash";
  if (d.includes("stock") || d.includes("equity") || d.includes("common")) return "equity";
  return null;
}

function mapActivityType(t: string): string | null {
  // SPLIT is known and intentionally unsupported — log it so ops can
  // see the drop; everything else delegates to the shared classifier
  // used by the CSV importer, keeping the two paths in lockstep.
  if (t === "SPLIT") {
    logger.warn("snaptrade SPLIT activity skipped — schema support deferred");
    return null;
  }
  return classifyActivity(t);
}

/**
 * Pull a ticker + description out of SnapTrade's nested `symbol` field.
 * SnapTrade ships at least three shapes for this field across their
 * various activity endpoints:
 *   1. `symbol: "AAPL"` (bare string on some older responses)
 *   2. `symbol: { symbol: "AAPL", description: "APPLE INC" }`
 *   3. `symbol: { symbol: { symbol: "AAPL", description: "APPLE INC" } }`
 * Plus each level can be null. Return a "CASH" sentinel when the row
 * is a non-security transaction (dividend on closed position, fee, etc.)
 * so we never write a null ticker to the DB.
 */
function extractSnapTradeSymbol(act: Record<string, unknown>): { ticker: string; description: string } {
  const raw = act.symbol;
  if (typeof raw === "string" && raw.trim()) {
    const t = raw.trim().toUpperCase();
    return { ticker: t, description: t };
  }
  if (raw && typeof raw === "object") {
    const level1 = raw as { symbol?: unknown; description?: unknown };
    if (typeof level1.symbol === "string" && level1.symbol.trim()) {
      const t = level1.symbol.trim().toUpperCase();
      const d = typeof level1.description === "string" && level1.description ? level1.description : t;
      return { ticker: t, description: d };
    }
    if (level1.symbol && typeof level1.symbol === "object") {
      const level2 = level1.symbol as { symbol?: unknown; description?: unknown };
      if (typeof level2.symbol === "string" && level2.symbol.trim()) {
        const t = level2.symbol.trim().toUpperCase();
        const d = typeof level2.description === "string" && level2.description ? level2.description : t;
        return { ticker: t, description: d };
      }
    }
  }
  return { ticker: "CASH", description: "Cash" };
}

/** `Number(x)` but tolerant of null, undefined, and non-numeric strings. */
function safeNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse a SnapTrade date string; return null if missing or malformed. */
function parseIsoDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** SnapTrade currency can be `{ code: "USD" }` or `"USD"` or null. */
function extractCurrency(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string" && v.trim()) return v.trim().toUpperCase();
  if (typeof v === "object") {
    const code = (v as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim().toUpperCase();
  }
  return null;
}

function hashColor(name: string): string {
  const palette = [
    "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899",
    "#06b6d4", "#14b8a6", "#f97316", "#a855f7", "#84cc16",
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}
