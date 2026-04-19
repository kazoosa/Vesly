import type { HoldingDTO, InvestmentTransactionDTO, SecurityDTO } from "@finlink/shared";
import { prisma } from "../db.js";

export async function listHoldings(itemId: string): Promise<{ holdings: HoldingDTO[]; securities: SecurityDTO[] }> {
  const accounts = await prisma.account.findMany({ where: { itemId, type: "investment" }, select: { id: true } });
  const accIds = accounts.map((a: { id: string }) => a.id);
  if (accIds.length === 0) return { holdings: [], securities: [] };

  const holdings = await prisma.investmentHolding.findMany({
    where: { accountId: { in: accIds } },
    include: { security: true },
    orderBy: { institutionValue: "desc" },
  });

  const securityMap = new Map<string, SecurityDTO>();
  const holdingsOut: HoldingDTO[] = holdings.map((h: (typeof holdings)[number]) => {
    if (!securityMap.has(h.securityId)) {
      securityMap.set(h.securityId, {
        security_id: h.security.id,
        ticker_symbol: h.security.tickerSymbol,
        name: h.security.name,
        type: h.security.type as SecurityDTO["type"],
        close_price: h.security.closePrice,
        close_price_as_of: h.security.closePriceAsOf.toISOString().slice(0, 10),
        isin: h.security.isin,
        cusip: h.security.cusip,
        exchange: h.security.exchange,
        iso_currency_code: h.security.isoCurrencyCode,
      });
    }
    return {
      account_id: h.accountId,
      security_id: h.securityId,
      quantity: h.quantity,
      institution_price: h.institutionPrice,
      institution_price_as_of: h.institutionPriceAsOf.toISOString().slice(0, 10),
      institution_value: h.institutionValue,
      cost_basis: h.costBasis,
      iso_currency_code: h.isoCurrencyCode,
    };
  });

  return { holdings: holdingsOut, securities: [...securityMap.values()] };
}

export async function listInvestmentTransactions(
  itemId: string,
  opts: { startDate?: Date; endDate?: Date; count?: number; offset?: number } = {},
): Promise<{ transactions: InvestmentTransactionDTO[]; securities: SecurityDTO[]; total: number }> {
  const accounts = await prisma.account.findMany({ where: { itemId, type: "investment" }, select: { id: true } });
  const accIds = accounts.map((a: { id: string }) => a.id);
  if (accIds.length === 0) return { transactions: [], securities: [], total: 0 };

  const where = {
    accountId: { in: accIds },
    ...(opts.startDate || opts.endDate
      ? { date: { gte: opts.startDate ?? undefined, lte: opts.endDate ?? undefined } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.investmentTransaction.findMany({
      where,
      include: { security: true },
      orderBy: { date: "desc" },
      skip: opts.offset ?? 0,
      take: opts.count ?? 250,
    }),
    prisma.investmentTransaction.count({ where }),
  ]);

  const securityMap = new Map<string, SecurityDTO>();
  const transactions: InvestmentTransactionDTO[] = rows.map((t: (typeof rows)[number]) => {
    if (!securityMap.has(t.securityId)) {
      securityMap.set(t.securityId, {
        security_id: t.security.id,
        ticker_symbol: t.security.tickerSymbol,
        name: t.security.name,
        type: t.security.type as SecurityDTO["type"],
        close_price: t.security.closePrice,
        close_price_as_of: t.security.closePriceAsOf.toISOString().slice(0, 10),
        isin: t.security.isin,
        cusip: t.security.cusip,
        exchange: t.security.exchange,
        iso_currency_code: t.security.isoCurrencyCode,
      });
    }
    return {
      investment_transaction_id: t.id,
      account_id: t.accountId,
      security_id: t.securityId,
      date: t.date.toISOString().slice(0, 10),
      name: t.name,
      type: t.type as InvestmentTransactionDTO["type"],
      quantity: t.quantity,
      price: t.price,
      amount: t.amount,
      fees: t.fees,
      iso_currency_code: t.isoCurrencyCode,
    };
  });

  return { transactions, securities: [...securityMap.values()], total };
}

export async function getSecurity(id: string): Promise<SecurityDTO | null> {
  const s = await prisma.security.findUnique({ where: { id } });
  if (!s) return null;
  return {
    security_id: s.id,
    ticker_symbol: s.tickerSymbol,
    name: s.name,
    type: s.type as SecurityDTO["type"],
    close_price: s.closePrice,
    close_price_as_of: s.closePriceAsOf.toISOString().slice(0, 10),
    isin: s.isin,
    cusip: s.cusip,
    exchange: s.exchange,
    iso_currency_code: s.isoCurrencyCode,
  };
}
