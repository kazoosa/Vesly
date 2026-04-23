/**
 * Aggregation across ALL items owned by a developer/user (via their applications).
 * Consumer portfolio app queries these.
 */
import { prisma } from "../db.js";

async function getUserItemIds(developerId: string): Promise<string[]> {
  const apps = await prisma.application.findMany({
    where: { developerId },
    select: { id: true },
  });
  const appIds = apps.map((a: { id: string }) => a.id);
  if (appIds.length === 0) return [];
  const items = await prisma.item.findMany({
    where: { applicationId: { in: appIds } },
    select: { id: true },
  });
  return items.map((i: { id: string }) => i.id);
}

export async function getPortfolioSummary(developerId: string) {
  const itemIds = await getUserItemIds(developerId);
  if (itemIds.length === 0) {
    return {
      total_value: 0,
      cost_basis: 0,
      unrealized_pl: 0,
      unrealized_pl_pct: 0,
      day_change: 0,
      day_change_pct: 0,
      connected_count: 0,
      holdings_count: 0,
      tx_count_30d: 0,
      ytd_dividends: 0,
    };
  }
  const accounts = await prisma.account.findMany({
    where: { itemId: { in: itemIds }, type: "investment" },
    select: { id: true },
  });
  const accIds = accounts.map((a: { id: string }) => a.id);

  const holdings = await prisma.investmentHolding.findMany({
    where: { accountId: { in: accIds } },
  });
  const totalValue = holdings.reduce(
    (s: number, h: { institutionValue: number }) => s + h.institutionValue,
    0,
  );
  const costBasis = holdings.reduce(
    (s: number, h: { costBasis: number }) => s + h.costBasis,
    0,
  );
  const unrealizedPl = totalValue - costBasis;
  const unrealizedPlPct = costBasis > 0 ? (unrealizedPl / costBasis) * 100 : 0;

  // Deterministic "day change" derived from a sine over totalValue so it's stable
  const seed = Math.floor(totalValue * 1000) % 1000;
  const dayChangePct = ((seed % 400) - 200) / 100; // ±2.00%
  const dayChange = +(totalValue * (dayChangePct / 100)).toFixed(2);

  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const dividends = await prisma.investmentTransaction.aggregate({
    _sum: { amount: true },
    where: {
      accountId: { in: accIds },
      type: "dividend",
      date: { gte: ytdStart },
    },
  });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
  const txCount = await prisma.investmentTransaction.count({
    where: { accountId: { in: accIds }, date: { gte: thirtyDaysAgo } },
  });

  return {
    total_value: +totalValue.toFixed(2),
    cost_basis: +costBasis.toFixed(2),
    unrealized_pl: +unrealizedPl.toFixed(2),
    unrealized_pl_pct: +unrealizedPlPct.toFixed(2),
    day_change: dayChange,
    day_change_pct: +dayChangePct.toFixed(2),
    connected_count: itemIds.length,
    holdings_count: holdings.length,
    tx_count_30d: txCount,
    ytd_dividends: +(dividends._sum.amount ?? 0).toFixed(2),
  };
}

export async function getPortfolioHoldings(developerId: string) {
  const itemIds = await getUserItemIds(developerId);
  if (itemIds.length === 0) return { holdings: [], total_value: 0 };

  const accounts = await prisma.account.findMany({
    where: { itemId: { in: itemIds }, type: "investment" },
    include: { item: { include: { institution: true } } },
  });
  const accIds = accounts.map((a: { id: string }) => a.id);
  const accountMap = new Map(accounts.map((a: typeof accounts[number]) => [a.id, a]));

  const rows = await prisma.investmentHolding.findMany({
    where: { accountId: { in: accIds } },
    include: { security: true },
  });

  // Group by ticker (consolidating across brokerages)
  const byTicker = new Map<
    string,
    {
      ticker_symbol: string;
      name: string;
      type: string;
      exchange: string | null;
      close_price: number;
      quantity: number;
      cost_basis: number;
      market_value: number;
      locations: Array<{ institution: string; institution_color: string; account_name: string; quantity: number; value: number }>;
    }
  >();

  for (const h of rows) {
    const acc = accountMap.get(h.accountId)!;
    const key = h.security.tickerSymbol;
    const entry = byTicker.get(key) ?? {
      ticker_symbol: h.security.tickerSymbol,
      name: h.security.name,
      type: h.security.type,
      exchange: h.security.exchange,
      close_price: h.security.closePrice,
      quantity: 0,
      cost_basis: 0,
      market_value: 0,
      locations: [],
    };
    entry.quantity += h.quantity;
    entry.cost_basis += h.costBasis;
    entry.market_value += h.institutionValue;
    entry.locations.push({
      institution: acc.item.institution.name,
      institution_color: acc.item.institution.primaryColor,
      account_name: acc.name,
      quantity: h.quantity,
      value: h.institutionValue,
    });
    byTicker.set(key, entry);
  }

  const totalValue = [...byTicker.values()].reduce((s, e) => s + e.market_value, 0);

  const holdings = [...byTicker.values()]
    .map((e) => {
      const pl = e.market_value - e.cost_basis;
      const plPct = e.cost_basis > 0 ? (pl / e.cost_basis) * 100 : 0;
      return {
        ticker_symbol: e.ticker_symbol,
        name: e.name,
        type: e.type,
        exchange: e.exchange,
        quantity: +e.quantity.toFixed(4),
        avg_cost: e.quantity > 0 ? +(e.cost_basis / e.quantity).toFixed(2) : 0,
        close_price: e.close_price,
        market_value: +e.market_value.toFixed(2),
        cost_basis: +e.cost_basis.toFixed(2),
        unrealized_pl: +pl.toFixed(2),
        unrealized_pl_pct: +plPct.toFixed(2),
        weight_pct: totalValue > 0 ? +((e.market_value / totalValue) * 100).toFixed(2) : 0,
        locations: e.locations,
      };
    })
    .sort((a, b) => b.market_value - a.market_value);

  return { holdings, total_value: +totalValue.toFixed(2) };
}

export async function getPortfolioTransactions(
  developerId: string,
  opts: { type?: string; ticker?: string; count?: number; offset?: number } = {},
) {
  const itemIds = await getUserItemIds(developerId);
  if (itemIds.length === 0) return { transactions: [], total: 0 };

  const accounts = await prisma.account.findMany({
    where: { itemId: { in: itemIds }, type: "investment" },
    include: { item: { include: { institution: true } } },
  });
  const accIds = accounts.map((a: { id: string }) => a.id);
  const accountMap = new Map(accounts.map((a: typeof accounts[number]) => [a.id, a]));

  const where: Record<string, unknown> = { accountId: { in: accIds } };
  if (opts.type) where.type = opts.type;

  const [rows, total] = await Promise.all([
    prisma.investmentTransaction.findMany({
      where,
      include: { security: true },
      orderBy: { date: "desc" },
      skip: opts.offset ?? 0,
      take: opts.count ?? 100,
    }),
    prisma.investmentTransaction.count({ where }),
  ]);

  const filtered = opts.ticker
    ? rows.filter((r: (typeof rows)[number]) => r.security.tickerSymbol.toUpperCase() === opts.ticker!.toUpperCase())
    : rows;

  const transactions = filtered.map((t: (typeof rows)[number]) => {
    const acc = accountMap.get(t.accountId)!;
    return {
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      type: t.type,
      ticker_symbol: t.security.tickerSymbol,
      security_name: t.security.name,
      quantity: t.quantity,
      price: t.price,
      amount: t.amount,
      fees: t.fees,
      institution: acc.item.institution.name,
      institution_color: acc.item.institution.primaryColor,
      account_name: acc.name,
    };
  });

  return { transactions, total };
}

export async function getPortfolioDividends(developerId: string) {
  const itemIds = await getUserItemIds(developerId);
  if (itemIds.length === 0)
    return { by_month: [], by_ticker: [], ytd_total: 0, lifetime_total: 0 };

  const accounts = await prisma.account.findMany({
    where: { itemId: { in: itemIds }, type: "investment" },
    select: { id: true },
  });
  const accIds = accounts.map((a: { id: string }) => a.id);

  const rows = await prisma.investmentTransaction.findMany({
    where: { accountId: { in: accIds }, type: "dividend" },
    include: { security: true },
    orderBy: { date: "asc" },
  });

  const lifetime = rows.reduce((s: number, r: (typeof rows)[number]) => s + r.amount, 0);
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const ytd = rows.filter((r: (typeof rows)[number]) => r.date >= ytdStart).reduce((s: number, r: (typeof rows)[number]) => s + r.amount, 0);

  // By month — last 12 months
  const byMonthMap = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonthMap.set(key, 0);
  }
  for (const r of rows) {
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
    if (byMonthMap.has(key)) byMonthMap.set(key, (byMonthMap.get(key) ?? 0) + r.amount);
  }
  const byMonth = [...byMonthMap.entries()].map(([month, amount]) => ({
    month,
    amount: +amount.toFixed(2),
  }));

  // By ticker — all time
  const byTickerMap = new Map<string, { ticker_symbol: string; name: string; total: number; payments: number }>();
  for (const r of rows) {
    const entry = byTickerMap.get(r.security.tickerSymbol) ?? {
      ticker_symbol: r.security.tickerSymbol,
      name: r.security.name,
      total: 0,
      payments: 0,
    };
    entry.total += r.amount;
    entry.payments += 1;
    byTickerMap.set(r.security.tickerSymbol, entry);
  }
  const byTicker = [...byTickerMap.values()]
    .map((e) => ({ ...e, total: +e.total.toFixed(2) }))
    .sort((a, b) => b.total - a.total);

  return {
    by_month: byMonth,
    by_ticker: byTicker,
    ytd_total: +ytd.toFixed(2),
    lifetime_total: +lifetime.toFixed(2),
  };
}

export async function getPortfolioAllocation(developerId: string) {
  const { holdings, total_value } = await getPortfolioHoldings(developerId);

  const byTicker = holdings.map((h) => ({
    label: h.ticker_symbol,
    value: h.market_value,
    weight_pct: h.weight_pct,
    color: tickerColor(h.ticker_symbol),
  }));

  // By institution (aggregate all holdings per brokerage)
  const byInstMap = new Map<string, { label: string; color: string; value: number }>();
  for (const h of holdings) {
    for (const loc of h.locations) {
      const entry = byInstMap.get(loc.institution) ?? {
        label: loc.institution,
        color: loc.institution_color,
        value: 0,
      };
      entry.value += loc.value;
      byInstMap.set(loc.institution, entry);
    }
  }
  const byInstitution = [...byInstMap.values()]
    .map((e) => ({
      ...e,
      value: +e.value.toFixed(2),
      weight_pct: total_value > 0 ? +((e.value / total_value) * 100).toFixed(2) : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // By asset class (security.type)
  const byTypeMap = new Map<string, number>();
  for (const h of holdings) {
    byTypeMap.set(h.type, (byTypeMap.get(h.type) ?? 0) + h.market_value);
  }
  const byType = [...byTypeMap.entries()].map(([label, value]) => ({
    label,
    value: +value.toFixed(2),
    weight_pct: total_value > 0 ? +((value / total_value) * 100).toFixed(2) : 0,
    color: typeColor(label),
  }));

  return { by_ticker: byTicker, by_institution: byInstitution, by_type: byType, total_value };
}

export async function getConnectedAccounts(developerId: string) {
  const itemIds = await getUserItemIds(developerId);
  if (itemIds.length === 0) return { accounts: [] };

  const accounts = await prisma.account.findMany({
    where: { itemId: { in: itemIds } },
    include: { item: { include: { institution: true } } },
    orderBy: { currentBalance: "desc" },
  });
  return {
    accounts: accounts.map((a: (typeof accounts)[number]) => ({
      id: a.id,
      name: a.name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      current_balance: a.currentBalance,
      institution: a.item.institution.name,
      institution_color: a.item.institution.primaryColor,
      institution_id: a.item.institutionId,
      item_id: a.itemId,
      iso_currency_code: a.isoCurrencyCode,
    })),
  };
}

/**
 * Generates a link_token for the logged-in user's implicit app.
 * Auto-creates a single default app if the user doesn't have one.
 */
export async function ensureUserApplicationAndLinkToken(
  developerId: string,
  developerEmail: string,
) {
  let app = await prisma.application.findFirst({ where: { developerId } });
  if (!app) {
    const { nanoid } = await import("nanoid");
    const { hashSecret } = await import("../utils/crypto.js");
    app = await prisma.application.create({
      data: {
        developerId,
        name: `${developerEmail}'s Portfolio`,
        clientId: `cli_${nanoid(24)}`,
        clientSecretHash: await hashSecret(nanoid(40)),
        redirectUris: [],
        allowedProducts: [
          "transactions",
          "auth",
          "balance",
          "identity",
          "investments",
          "income",
        ],
        environment: "sandbox",
      },
    });
  }
  const { createLinkSession } = await import("./linkSessionService.js");
  return createLinkSession({
    applicationId: app.id,
    clientUserId: developerId,
    products: ["investments", "balance", "identity"],
    clientName: "All Account Stocks",
  });
}

function tickerColor(ticker: string): string {
  const colors = [
    "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
    "#ec4899", "#06b6d4", "#14b8a6", "#f97316", "#a855f7",
    "#84cc16", "#0ea5e9", "#eab308", "#d946ef", "#6366f1",
  ];
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length]!;
}

function typeColor(t: string): string {
  switch (t) {
    case "equity":
      return "#10b981";
    case "etf":
      return "#3b82f6";
    case "mutual_fund":
      return "#f59e0b";
    case "fixed_income":
      return "#8b5cf6";
    case "cash":
      return "#64748b";
    default:
      return "#94a3b8";
  }
}

/* ------------------------------------------------------------------
   Per-symbol aggregate for the Stocks detail view.

   Fans out everything the right-rail panels need in a single DB round
   trip: position summary, FIFO closed-lot pairing, win-rate stats,
   dividend calendar, held-in breakdown, activity feed, and the
   symbol's share of the overall portfolio.

   `type` on InvestmentTransaction is conventionally "buy" | "sell" |
   "dividend"; anything else is treated as activity but not paired
   into lots.
   ------------------------------------------------------------------ */

export interface ClosedLot {
  openedDate: string;
  closedDate: string;
  shares: number;
  costPerShare: number;
  sellPerShare: number;
  realizedPl: number;
  realizedPlPct: number;
  heldDays: number;
  outcome: "win" | "loss" | "breakeven";
}

export interface OpenLot {
  accountId: string;
  institutionName: string;
  institutionColor: string;
  accountName: string;
  acquiredDate: string;
  shares: number;
  costPerShare: number;
  costBasis: number;
  currentValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
}

export async function getPortfolioBySymbol(developerId: string, rawSymbol: string) {
  const symbol = rawSymbol.trim().toUpperCase();

  const security = await prisma.security.findUnique({
    where: { tickerSymbol: symbol },
  });
  if (!security) {
    // Let the caller decide whether to 404 or just show the market-only
    // view (the frontend tolerates an empty position payload).
    return {
      symbol,
      securityId: null,
      securityName: symbol,
      exchange: null,
      closePrice: 0,
      empty: true,
    };
  }

  const itemIds = await getUserItemIds(developerId);
  const accounts = await prisma.account.findMany({
    where: { itemId: { in: itemIds }, type: "investment" },
    include: { item: { include: { institution: true } } },
  });
  type AccountWithItem = (typeof accounts)[number];
  const accountIds = accounts.map((a: { id: string }) => a.id);
  const accountMap = new Map<string, AccountWithItem>(
    accounts.map((a: AccountWithItem) => [a.id, a]),
  );

  // Current holdings for this symbol across all brokerages
  const holdings = await prisma.investmentHolding.findMany({
    where: { accountId: { in: accountIds }, securityId: security.id },
  });

  // Every transaction (buy / sell / dividend / other) for this symbol,
  // ordered by date ascending — required for FIFO closed-lot pairing.
  type Txn = {
    id: string;
    accountId: string;
    securityId: string;
    date: Date;
    name: string;
    type: string;
    quantity: number;
    price: number;
    amount: number;
    fees: number;
  };
  const txns = (await prisma.investmentTransaction.findMany({
    where: { accountId: { in: accountIds }, securityId: security.id },
    orderBy: { date: "asc" },
  })) as unknown as Txn[];

  // --------- Position (current holdings) ---------------------------------

  let sharesHeld = 0;
  let costBasis = 0;
  let marketValue = 0;
  const heldInMap = new Map<
    string,
    { institutionName: string; institutionColor: string; accountName: string; shares: number; value: number }
  >();
  const openLotsByAccount: OpenLot[] = [];

  for (const h of holdings) {
    sharesHeld += h.quantity;
    costBasis += h.costBasis;
    marketValue += h.institutionValue;
    const acc = accountMap.get(h.accountId)!;
    const key = acc.item.institutionId + "::" + acc.id;
    heldInMap.set(key, {
      institutionName: acc.item.institution.name,
      institutionColor: acc.item.institution.primaryColor,
      accountName: acc.name,
      shares: h.quantity,
      value: h.institutionValue,
    });
    const perShareCost = h.quantity > 0 ? h.costBasis / h.quantity : 0;
    const unrealized = h.institutionValue - h.costBasis;
    openLotsByAccount.push({
      accountId: acc.id,
      institutionName: acc.item.institution.name,
      institutionColor: acc.item.institution.primaryColor,
      accountName: acc.name,
      acquiredDate: h.createdAt.toISOString(),
      shares: +h.quantity.toFixed(4),
      costPerShare: +perShareCost.toFixed(4),
      costBasis: +h.costBasis.toFixed(2),
      currentValue: +h.institutionValue.toFixed(2),
      unrealizedPl: +unrealized.toFixed(2),
      unrealizedPlPct: h.costBasis > 0 ? +((unrealized / h.costBasis) * 100).toFixed(2) : 0,
    });
  }

  const unrealizedPl = marketValue - costBasis;
  const unrealizedPlPct = costBasis > 0 ? (unrealizedPl / costBasis) * 100 : 0;
  const avgCostPerShare = sharesHeld > 0 ? costBasis / sharesHeld : 0;

  // --------- FIFO closed-lot pairing -------------------------------------

  // Queue of open lot candidates (in chronological order). Each sell
  // matches against the oldest open lots, splitting as needed.
  type OpenQueueEntry = { shares: number; pricePerShare: number; date: Date };
  const openQueue: OpenQueueEntry[] = [];
  const closedLots: ClosedLot[] = [];

  for (const t of txns) {
    if (t.type === "buy" && t.quantity > 0) {
      openQueue.push({
        shares: t.quantity,
        pricePerShare: t.price,
        date: t.date,
      });
    } else if (t.type === "sell" && t.quantity > 0) {
      let remaining = t.quantity;
      while (remaining > 1e-9 && openQueue.length > 0) {
        const lot = openQueue[0];
        const matched = Math.min(lot.shares, remaining);
        const realized = (t.price - lot.pricePerShare) * matched;
        const cost = lot.pricePerShare * matched;
        const pct = cost > 0 ? (realized / cost) * 100 : 0;
        const heldDays = Math.max(
          0,
          Math.round((t.date.getTime() - lot.date.getTime()) / 86_400_000),
        );
        closedLots.push({
          openedDate: lot.date.toISOString(),
          closedDate: t.date.toISOString(),
          shares: +matched.toFixed(4),
          costPerShare: +lot.pricePerShare.toFixed(4),
          sellPerShare: +t.price.toFixed(4),
          realizedPl: +realized.toFixed(2),
          realizedPlPct: +pct.toFixed(2),
          heldDays,
          outcome: realized > 0.01 ? "win" : realized < -0.01 ? "loss" : "breakeven",
        });
        lot.shares -= matched;
        remaining -= matched;
        if (lot.shares <= 1e-9) openQueue.shift();
      }
      // If the user sold more than we have open lots for, ignore the
      // surplus (could be a short or data gap) — skip without pairing.
    }
  }

  // --------- Realized P/L aggregates -------------------------------------

  const now = new Date();
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  let realizedLifetime = 0;
  let realizedYtd = 0;
  const monthlyPl = new Map<string, number>(); // key: YYYY-MM
  let heldDaysSum = 0;

  for (const lot of closedLots) {
    realizedLifetime += lot.realizedPl;
    const closedDate = new Date(lot.closedDate);
    if (closedDate >= ytdStart) realizedYtd += lot.realizedPl;
    heldDaysSum += lot.heldDays;
    const key = `${closedDate.getFullYear()}-${String(closedDate.getMonth() + 1).padStart(2, "0")}`;
    monthlyPl.set(key, (monthlyPl.get(key) ?? 0) + lot.realizedPl);
  }

  // Last 12 months in order (for the mini bar chart)
  const byMonth: Array<{ month: string; pl: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.push({ month: key, pl: +(monthlyPl.get(key) ?? 0).toFixed(2) });
  }

  // --------- Win-rate stats ---------------------------------------------

  const wins = closedLots.filter((l) => l.outcome === "win");
  const losses = closedLots.filter((l) => l.outcome === "loss");
  const avgWin = wins.length > 0 ? wins.reduce((s, l) => s + l.realizedPl, 0) / wins.length : 0;
  const avgLoss =
    losses.length > 0 ? losses.reduce((s, l) => s + l.realizedPl, 0) / losses.length : 0;
  const payoffRatio = avgLoss < 0 ? Math.abs(avgWin / avgLoss) : 0;
  const bestTrade = closedLots.reduce<ClosedLot | null>(
    (best, l) => (!best || l.realizedPl > best.realizedPl ? l : best),
    null,
  );
  const worstTrade = closedLots.reduce<ClosedLot | null>(
    (worst, l) => (!worst || l.realizedPl < worst.realizedPl ? l : worst),
    null,
  );
  const winStats = {
    winRate: closedLots.length > 0 ? +((wins.length / closedLots.length) * 100).toFixed(1) : 0,
    winCount: wins.length,
    lossCount: losses.length,
    avgWin: +avgWin.toFixed(2),
    avgLoss: +avgLoss.toFixed(2),
    payoffRatio: +payoffRatio.toFixed(2),
    bestTrade: bestTrade ? +bestTrade.realizedPl.toFixed(2) : 0,
    worstTrade: worstTrade ? +worstTrade.realizedPl.toFixed(2) : 0,
  };

  // --------- Portfolio weight -------------------------------------------

  const allHoldings = await prisma.investmentHolding.findMany({
    where: { accountId: { in: accountIds } },
    select: { institutionValue: true },
  });
  const totalPortfolioValue = allHoldings.reduce(
    (s: number, h: { institutionValue: number }) => s + h.institutionValue,
    0,
  );

  // --------- Dividends --------------------------------------------------

  const divTxns = txns.filter((t) => t.type === "dividend");
  const divYtd = divTxns
    .filter((t) => t.date >= ytdStart)
    .reduce((s, t) => s + t.amount, 0);
  const divLifetime = divTxns.reduce((s, t) => s + t.amount, 0);
  const trailing12mStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const annualized = divTxns
    .filter((t) => t.date >= trailing12mStart)
    .reduce((s, t) => s + t.amount, 0);
  const yieldPct = marketValue > 0 ? (annualized / marketValue) * 100 : 0;

  // Quarterly buckets for the calendar (last 4 quarters)
  type QuarterKey = "Q1" | "Q2" | "Q3" | "Q4";
  const byQuarter: Array<{
    quarter: QuarterKey;
    year: number;
    status: "PAID" | "UPCOMING";
    perShare: number;
    totalPaid: number;
    exDate: string | null;
    payDate: string | null;
    yieldPct: number | null;
  }> = [];
  for (let q = 3; q >= 0; q--) {
    const d = new Date(now.getFullYear(), now.getMonth() - q * 3, 1);
    const quarter = (["Q1", "Q2", "Q3", "Q4"] as QuarterKey[])[Math.floor(d.getMonth() / 3)];
    const year = d.getFullYear();
    const qStart = new Date(year, Math.floor(d.getMonth() / 3) * 3, 1);
    const qEnd = new Date(year, Math.floor(d.getMonth() / 3) * 3 + 3, 0);
    const qTxns = divTxns.filter((t) => t.date >= qStart && t.date <= qEnd);
    const totalPaid = qTxns.reduce((s, t) => s + t.amount, 0);
    const perShare = sharesHeld > 0 ? totalPaid / sharesHeld : 0;
    const last = qTxns[qTxns.length - 1];
    byQuarter.push({
      quarter,
      year,
      status: qTxns.length > 0 || qEnd < now ? "PAID" : "UPCOMING",
      perShare: +perShare.toFixed(3),
      totalPaid: +totalPaid.toFixed(2),
      exDate: last ? new Date(last.date.getTime() - 86_400_000).toISOString() : null,
      payDate: last ? last.date.toISOString() : null,
      yieldPct:
        marketValue > 0 && totalPaid > 0 ? +((totalPaid / marketValue) * 100).toFixed(2) : null,
    });
  }
  const nextPaymentDate = divTxns.length > 0
    ? new Date(divTxns[divTxns.length - 1].date.getTime() + 91 * 86_400_000).toISOString()
    : null;

  // --------- Activity feed ----------------------------------------------

  const activity = txns.map((t) => {
    const acc = accountMap.get(t.accountId);
    return {
      id: t.id,
      date: t.date.toISOString(),
      type:
        t.type === "buy" || t.type === "sell" || t.type === "dividend"
          ? t.type
          : "other",
      shares: +t.quantity.toFixed(4),
      pricePerShare: +t.price.toFixed(4),
      amount: +t.amount.toFixed(2),
      name: t.name,
      institutionName: acc?.item.institution.name ?? "",
      institutionColor: acc?.item.institution.primaryColor ?? "#64748b",
      accountName: acc?.name ?? "",
    };
  });

  return {
    symbol,
    securityId: security.id,
    securityName: security.name,
    exchange: security.exchange,
    closePrice: security.closePrice,
    empty: false,
    position: {
      sharesHeld: +sharesHeld.toFixed(4),
      avgCostPerShare: +avgCostPerShare.toFixed(4),
      marketValue: +marketValue.toFixed(2),
      costBasis: +costBasis.toFixed(2),
      unrealizedPl: +unrealizedPl.toFixed(2),
      unrealizedPlPct: +unrealizedPlPct.toFixed(2),
      openLotsCount: openLotsByAccount.length,
    },
    realized: {
      lifetime: +realizedLifetime.toFixed(2),
      ytd: +realizedYtd.toFixed(2),
      closedLotsCount: closedLots.length,
      avgHoldDays:
        closedLots.length > 0 ? Math.round(heldDaysSum / closedLots.length) : 0,
      byMonth,
    },
    lots: {
      open: openLotsByAccount,
      closed: closedLots.sort(
        (a, b) => new Date(b.closedDate).getTime() - new Date(a.closedDate).getTime(),
      ),
    },
    winStats,
    portfolioWeight: {
      pct: totalPortfolioValue > 0 ? +((marketValue / totalPortfolioValue) * 100).toFixed(2) : 0,
      totalPortfolioValue: +totalPortfolioValue.toFixed(2),
      holdingCount: allHoldings.length,
    },
    dividends: {
      ytd: +divYtd.toFixed(2),
      lifetime: +divLifetime.toFixed(2),
      paymentsCount: divTxns.length,
      annualizedEstimate: +annualized.toFixed(2),
      yieldPct: +yieldPct.toFixed(2),
      nextPaymentDateEstimate: nextPaymentDate,
      byQuarter,
    },
    heldIn: [...heldInMap.values()].map((h) => ({
      ...h,
      shares: +h.shares.toFixed(4),
      value: +h.value.toFixed(2),
    })),
    activity,
  };
}
