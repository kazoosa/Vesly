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
import { parseOptionSymbol, type OptionSpec } from "./optionSymbolParser.js";

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
      try {
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

      let holdingsSkipped = 0;
      for (const pos of positions) {
        // SnapTrade's `symbol` field has at least four shapes across
        // brokers and product lines — older bare strings, the typical
        // nested {symbol:{symbol,description}}, the deeply nested
        // {symbol:{symbol:{symbol,description}}}, and the universal
        // case where only `raw_symbol` carries the ticker. Try them
        // all before giving up.
        const { ticker, description, typeDesc, embeddedPrice, embeddedUnits, embeddedAvg, option } =
          extractPositionSymbol(pos);

        const quantity = Number(pos.units ?? embeddedUnits ?? 0);
        const price = Number(pos.price ?? embeddedPrice ?? 0);
        const avgCost = Number(
          pos.average_purchase_price ?? embeddedAvg ?? price,
        );
        // Apply contract multiplier for options (×100 standard equity).
        // institutionPrice stays as the per-contract premium (matches
        // what the broker shows on the position screen); value and
        // costBasis carry the full dollar exposure.
        const mult = option?.multiplier ?? 1;
        const value = quantity * price * mult;
        const costBasis = quantity * avgCost * mult;

        if (!ticker) {
          // Don't silently drop — log the unrecognised shape so we can
          // extend extractPositionSymbol for the broker that produced
          // it. Without this, less-common tickers (e.g. YieldMax ETFs
          // like ULTY whose symbol object SnapTrade nests differently)
          // would never appear as holdings even though their dividend
          // history did.
          holdingsSkipped++;
          logger.warn(
            { accountId: accId, posKeys: Object.keys(pos) },
            "snaptrade: could not extract ticker from position; skipping",
          );
          continue;
        }

        try {
          const security = await upsertSecurity(ticker, description, price, typeDesc, option);
          // upsert keyed on (accountId, securityId) so a stale row from
          // a previous partial sync doesn't trigger P2002 and abort.
          await prisma.investmentHolding.upsert({
            where: {
              accountId_securityId: { accountId: account.id, securityId: security.id },
            },
            create: {
              accountId: account.id,
              securityId: security.id,
              quantity,
              institutionPrice: price,
              institutionPriceAsOf: new Date(),
              institutionValue: value,
              costBasis,
              isoCurrencyCode: "USD",
            },
            update: {
              quantity,
              institutionPrice: price,
              institutionPriceAsOf: new Date(),
              institutionValue: value,
              costBasis,
            },
          });
          holdingsCount++;
        } catch (err) {
          // Per-row failure shouldn't kill the whole sync — the user
          // sees "Sync failed" but the connection actually completed.
          // Log and continue so other holdings still land.
          holdingsSkipped++;
          logger.warn(
            { err, accountId: accId, ticker },
            "snaptrade: failed to upsert holding; continuing",
          );
        }
      }
      if (holdingsSkipped > 0) {
        logger.info(
          { accountId: accId, holdingsSkipped },
          "snaptrade positions: skipped rows during sync",
        );
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

        // Option detection on activity rows so a BUY/SELL on an option
        // contract creates the OptionContract row alongside the Security
        // — same path the position-sync uses. parseOptionSymbol returns
        // null for plain equity tickers, no-op for those.
        const actOption = parseOptionSymbol(act.symbol) ?? parseOptionSymbol(ticker) ?? undefined;
        const security = await upsertSecurity(ticker, description, price, undefined, actOption);

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
      } catch (err) {
        // Per-account failure used to bubble out as a 500 even though
        // the connection had landed and most accounts had synced
        // successfully. Log the failure so ops can see which account
        // and broker hit it, but keep going so the user's other
        // accounts (and the rest of the sync result) still complete.
        logger.error(
          { err, accountId: String(acc.id ?? "unknown"), connectionId: connId },
          "snaptrade: per-account sync failed; continuing with next account",
        );
      }
    }
  }

  // Auto-sweep expired options across all of this developer's
  // connected accounts. SnapTrade reports option lifecycle events
  // unevenly across brokers — some return OPTIONEXPIRATION as an
  // activity row, many don't. Without this sweep an expired contract
  // would linger on the holdings page indefinitely. The synthetic
  // option_expired transaction is idempotent via snaptradeOrderId.
  const sweptCount = await sweepExpiredOptions(developer.id);
  if (sweptCount > 0) {
    logger.info(
      { developerId: developer.id, sweptCount },
      "snaptrade post-sync: swept expired options",
    );
  }

  // Fire-and-forget: refresh Tradier Greeks for any option contracts
  // this user holds. Doesn't block the sync response — the user gets
  // their holdings + transactions back immediately, Greeks land on
  // the next page render. Errors are absorbed (logged in the job
  // itself) so a Tradier outage can't break the SnapTrade flow.
  void (async () => {
    try {
      const { refreshOptionQuotes } = await import("../jobs/refreshOptionQuotes.js");
      const result = await refreshOptionQuotes(developer.id);
      if (result.refreshed > 0 || result.errored > 0) {
        logger.info(
          { developerId: developer.id, ...result },
          "snaptrade post-sync: tradier refresh",
        );
      }
    } catch (err) {
      logger.warn({ err, developerId: developer.id }, "tradier post-sync refresh failed");
    }
  })();

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
 * Find every option position belonging to this developer whose
 * contract has already expired but still carries non-zero shares,
 * write a synthetic option_expired transaction, and zero the
 * holding. Idempotent: a deterministic snaptradeOrderId means
 * re-running the sync won't write duplicate ledger entries.
 *
 * Called from syncDeveloper after the regular sync completes; also
 * exported so the CSV importer (Phase 2's auto-sweep) and a future
 * cron job can reuse the same logic.
 */
export async function sweepExpiredOptions(developerId: string): Promise<number> {
  const now = new Date();
  // Pull every non-zero holding under this developer whose security
  // is an expired option contract. The JOIN through item -> account
  // is wide; relying on Prisma's relation filters keeps it readable.
  const expiredHoldings = await prisma.investmentHolding.findMany({
    where: {
      quantity: { not: 0 },
      account: {
        item: { application: { developerId } },
      },
      security: {
        type: "option",
        optionContract: { expiry: { lt: now } },
      },
    },
    include: {
      security: { include: { optionContract: true } },
      account: true,
    },
  });

  if (expiredHoldings.length === 0) return 0;

  let swept = 0;
  for (const h of expiredHoldings) {
    const oc = h.security.optionContract;
    if (!oc) continue;
    const sweepDateKey = oc.expiry.toISOString().slice(0, 10);
    const externalId = `snaptrade_sweep_${h.accountId}_${sweepDateKey}_OPTION_EXPIRED_${h.security.tickerSymbol}_${h.quantity}`;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.investmentTransaction.upsert({
          where: { snaptradeOrderId: externalId },
          update: {},
          create: {
            accountId: h.accountId,
            securityId: h.securityId,
            snaptradeOrderId: externalId,
            date: oc.expiry,
            name: `${h.security.tickerSymbol} expired`,
            type: "option_expired",
            quantity: -h.quantity,
            price: 0,
            amount: 0,
            fees: 0,
            isoCurrencyCode: "USD",
          },
        });
        // Zero the holding rather than deleting — keeps the
        // (accountId, securityId) row available for repeat-sync
        // idempotence and matches what the CSV path does.
        await tx.investmentHolding.update({
          where: { id: h.id },
          data: {
            quantity: 0,
            institutionValue: 0,
            costBasis: 0,
            institutionPriceAsOf: now,
          },
        });
      });
      swept++;
    } catch (err) {
      logger.warn(
        { err, holdingId: h.id, ticker: h.security.tickerSymbol },
        "sweepExpiredOptions: failed to sweep one holding; continuing",
      );
    }
  }
  return swept;
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
  option?: OptionSpec,
) {
  // Option path: upsert the underlying first, the option Security
  // second, then the OptionContract row. Same shape the CSV importer
  // uses (csvImportService.ts -> upsertSecurityWithTx) so the two
  // import paths stay in lockstep.
  if (option) {
    const underlying = await prisma.security.upsert({
      where: { tickerSymbol: option.underlyingTicker },
      update: {},
      create: {
        tickerSymbol: option.underlyingTicker,
        name: option.underlyingTicker,
        type: "equity",
        closePrice: 0,
        closePriceAsOf: new Date(),
        isoCurrencyCode: "USD",
      },
    });
    const optionSec = await prisma.security.upsert({
      where: { tickerSymbol: ticker },
      update: {
        name,
        closePrice: price,
        closePriceAsOf: new Date(),
        type: "option",
      },
      create: {
        tickerSymbol: ticker,
        name,
        type: "option",
        closePrice: price,
        closePriceAsOf: new Date(),
        isoCurrencyCode: "USD",
      },
    });
    await prisma.optionContract.upsert({
      where: { securityId: optionSec.id },
      update: {
        underlyingId: underlying.id,
        optionType: option.optionType,
        strike: option.strike,
        expiry: option.expiry,
        multiplier: option.multiplier,
        occSymbol: option.occSymbol,
      },
      create: {
        securityId: optionSec.id,
        underlyingId: underlying.id,
        optionType: option.optionType,
        strike: option.strike,
        expiry: option.expiry,
        multiplier: option.multiplier,
        occSymbol: option.occSymbol,
      },
    });
    return optionSec;
  }
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

/**
 * Position-shape symbol extractor. SnapTrade nests this differently
 * than activities, AND the shape varies per broker. Try every known
 * path; return ticker="" so the caller logs a warning rather than
 * defaulting to a junk ticker that would silently land in the DB.
 *
 * Known shapes from real responses:
 *   * pos.symbol = "AAPL"
 *   * pos.symbol = { symbol: "AAPL", description: "Apple Inc." }
 *   * pos.symbol = { symbol: { symbol: "AAPL", description: "Apple Inc.",
 *                              type: { description: "Common Stock" } },
 *                    price: ..., units: ..., average_purchase_price: ... }
 *   * pos.symbol = { raw_symbol: "ULTY", description: "..." } — seen on
 *     YieldMax ETFs and a handful of other newer issues that lack the
 *     usual normalised symbol wrapper. This was the ULTY case where
 *     dividends imported but the holding silently got dropped.
 */
function extractPositionSymbol(pos: Record<string, unknown>): {
  ticker: string;
  description: string;
  typeDesc?: string;
  embeddedPrice?: number;
  embeddedUnits?: number;
  embeddedAvg?: number;
  option?: OptionSpec;
} {
  // Option detection runs FIRST: SnapTrade nests strike_price /
  // expiration_date / option_type alongside option_symbol on option
  // positions. Recognised contracts get a normalized OptionSpec; the
  // ticker we return is the canonical OCC string so the same contract
  // landed via Fidelity CSV and SnapTrade reconciles to one Security
  // row downstream.
  const option = parseOptionSymbol(pos.symbol);
  if (option) {
    const desc =
      stringDeepFromObject(pos.symbol, ["description"]) ?? option.occSymbol;
    return {
      ticker: option.occSymbol,
      description: desc,
      typeDesc: "option",
      embeddedPrice: numberDeepFromObject(pos, ["price"]),
      embeddedUnits: numberDeepFromObject(pos, ["units"]),
      embeddedAvg: numberDeepFromObject(pos, ["average_purchase_price"]),
      option,
    };
  }

  const raw = pos.symbol;
  // Bare string at the top level
  if (typeof raw === "string" && raw.trim()) {
    const t = raw.trim().toUpperCase();
    return { ticker: t, description: t };
  }
  if (raw && typeof raw === "object") {
    const level1 = raw as Record<string, unknown>;
    // pos.symbol.symbol as a bare string (one level of nesting)
    if (typeof level1.symbol === "string" && level1.symbol.trim()) {
      return {
        ticker: String(level1.symbol).trim().toUpperCase(),
        description:
          typeof level1.description === "string" && level1.description
            ? String(level1.description)
            : String(level1.symbol).trim().toUpperCase(),
      };
    }
    // pos.symbol.raw_symbol — newer SnapTrade shape for ETFs
    if (typeof level1.raw_symbol === "string" && level1.raw_symbol.trim()) {
      return {
        ticker: String(level1.raw_symbol).trim().toUpperCase(),
        description:
          typeof level1.description === "string" && level1.description
            ? String(level1.description)
            : String(level1.raw_symbol).trim().toUpperCase(),
      };
    }
    // Two-level nesting (the most common modern shape)
    if (level1.symbol && typeof level1.symbol === "object") {
      const level2 = level1.symbol as Record<string, unknown>;
      const ticker =
        (typeof level2.symbol === "string" && level2.symbol.trim()) ||
        (typeof level2.raw_symbol === "string" && level2.raw_symbol.trim()) ||
        "";
      if (ticker) {
        const description =
          typeof level2.description === "string" && level2.description
            ? String(level2.description)
            : String(ticker).toUpperCase();
        const typeObj = level2.type as { description?: string } | undefined;
        return {
          ticker: String(ticker).toUpperCase(),
          description,
          typeDesc: typeObj?.description,
          embeddedPrice:
            typeof level1.price === "number" ? level1.price : undefined,
          embeddedUnits:
            typeof level1.units === "number" ? level1.units : undefined,
          embeddedAvg:
            typeof level1.average_purchase_price === "number"
              ? level1.average_purchase_price
              : undefined,
        };
      }
    }
  }
  return { ticker: "", description: "" };
}

/** `Number(x)` but tolerant of null, undefined, and non-numeric strings. */
function safeNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Walk an unknown SnapTrade object up to two levels of nesting to find
 * the first non-empty string at any of the given keys. Used by the
 * option-aware path to pick out a "description" wherever the broker
 * decided to put it.
 */
function stringDeepFromObject(o: unknown, keys: string[]): string | undefined {
  if (!o || typeof o !== "object") return undefined;
  const obj = o as Record<string, unknown>;
  for (const k of keys) {
    if (typeof obj[k] === "string" && (obj[k] as string).trim()) return obj[k] as string;
  }
  for (const k of Object.keys(obj)) {
    if (obj[k] && typeof obj[k] === "object") {
      const inner = stringDeepFromObject(obj[k], keys);
      if (inner) return inner;
    }
  }
  return undefined;
}
function numberDeepFromObject(o: unknown, keys: string[]): number | undefined {
  if (!o || typeof o !== "object") return undefined;
  const obj = o as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
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
