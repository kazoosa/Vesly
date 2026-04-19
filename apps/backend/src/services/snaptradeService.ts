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
      const actRes = await st.transactionsAndReporting.getActivities({
        userId,
        userSecret,
        accounts: accId,
      });
      const activities = (actRes.data as unknown as Array<Record<string, unknown>>) ?? [];

      for (const act of activities) {
        const orderId = String(act.id ?? "");
        if (!orderId) continue;
        const rawType = String(act.type ?? act.action ?? "").toUpperCase();
        const mapped = mapActivityType(rawType);
        if (!mapped) continue;

        const symbol = act.symbol as
          | { symbol?: string | { symbol?: string; description?: string } }
          | undefined;
        const ticker =
          typeof symbol?.symbol === "string"
            ? symbol.symbol
            : symbol?.symbol?.symbol ?? "CASH";
        const description =
          typeof symbol?.symbol === "string"
            ? ticker
            : symbol?.symbol?.description ?? ticker;
        const price = Number(act.price ?? 0);
        const security = await upsertSecurity(ticker, description, price);

        const date = act.trade_date
          ? new Date(String(act.trade_date))
          : act.settlement_date
          ? new Date(String(act.settlement_date))
          : new Date();

        try {
          await prisma.investmentTransaction.upsert({
            where: { snaptradeOrderId: orderId },
            update: {},
            create: {
              accountId: account.id,
              securityId: security.id,
              snaptradeOrderId: orderId,
              date,
              name: String(act.description ?? `${mapped} ${ticker}`),
              type: mapped,
              quantity: Math.abs(Number(act.units ?? 0)),
              price,
              amount: Math.abs(Number(act.amount ?? price * Number(act.units ?? 0))),
              fees: Math.abs(Number(act.fee ?? 0)),
              isoCurrencyCode: String((act.currency as { code?: string } | undefined)?.code ?? "USD"),
            },
          });
          txCount++;
        } catch (err) {
          logger.warn({ err, orderId }, "failed to upsert activity");
        }
      }
    }
  }

  logger.info(
    { developerId: developer.id, connections: connections.length, accountsCount, holdingsCount, txCount },
    "SnapTrade sync complete",
  );

  return {
    connections: connections.length,
    accounts: accountsCount,
    holdings: holdingsCount,
    transactions: txCount,
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
  switch (t) {
    case "BUY":
    case "PURCHASED":
      return "buy";
    case "SELL":
    case "SOLD":
      return "sell";
    case "DIVIDEND":
    case "DIV":
      return "dividend";
    case "INTEREST":
      return "interest";
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
    case "TRANSFER":
    case "DEPOSIT":
    case "WITHDRAWAL":
      return "transfer";
    case "FEE":
    case "TAX":
      return "fee";
    default:
      return null; // skip unknown types (splits, reorg, etc.) — safe to extend later
  }
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
