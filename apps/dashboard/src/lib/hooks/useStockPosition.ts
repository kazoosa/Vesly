import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { apiFetch } from "../api";

/**
 * Per-symbol portfolio aggregate.
 *
 * We *prefer* the server-side aggregate at
 * `GET /api/portfolio/by-symbol/:symbol`, but that endpoint only
 * exists after the latest Render deploy. When the call 404s (old
 * Render build), we transparently fall back to composing the same
 * shape on the client from two endpoints that have shipped for a
 * long time: `/api/portfolio/holdings` and
 * `/api/portfolio/transactions?ticker=X`. FIFO closed-lot pairing,
 * win stats, dividend calendar, and held-in are all computed in the
 * browser. Once Render catches up the server payload takes over
 * automatically with no code change.
 */

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

export interface ActivityItem {
  id: string;
  date: string;
  type: "buy" | "sell" | "dividend" | "other";
  shares: number;
  pricePerShare: number;
  amount: number;
  name: string;
  institutionName: string;
  institutionColor: string;
  accountName: string;
}

export interface PortfolioBySymbol {
  symbol: string;
  securityId: string | null;
  securityName: string;
  exchange: string | null;
  closePrice: number;
  empty: boolean;
  position?: {
    sharesHeld: number;
    avgCostPerShare: number;
    marketValue: number;
    costBasis: number;
    unrealizedPl: number;
    unrealizedPlPct: number;
    openLotsCount: number;
  };
  realized?: {
    lifetime: number;
    ytd: number;
    closedLotsCount: number;
    avgHoldDays: number;
    byMonth: Array<{ month: string; pl: number }>;
  };
  lots?: {
    open: OpenLot[];
    closed: ClosedLot[];
  };
  winStats?: {
    winRate: number;
    winCount: number;
    lossCount: number;
    avgWin: number;
    avgLoss: number;
    payoffRatio: number;
    bestTrade: number;
    worstTrade: number;
  };
  portfolioWeight?: {
    pct: number;
    totalPortfolioValue: number;
    holdingCount: number;
  };
  dividends?: {
    ytd: number;
    lifetime: number;
    paymentsCount: number;
    annualizedEstimate: number;
    yieldPct: number;
    nextPaymentDateEstimate: string | null;
    byQuarter: Array<{
      quarter: "Q1" | "Q2" | "Q3" | "Q4";
      year: number;
      status: "PAID" | "UPCOMING";
      perShare: number;
      totalPaid: number;
      exDate: string | null;
      payDate: string | null;
      yieldPct: number | null;
    }>;
  };
  heldIn?: Array<{
    institutionName: string;
    institutionColor: string;
    accountName: string;
    shares: number;
    value: number;
  }>;
  activity?: ActivityItem[];
}

export function useStockPosition(symbol: string | null) {
  const { accessToken, isDemo } = useAuth();
  const f = apiFetch(() => accessToken);
  const enabled = Boolean(symbol && accessToken);

  return useQuery({
    queryKey: ["stocks", "position", symbol, isDemo ? "demo" : "real"],
    queryFn: async (): Promise<PortfolioBySymbol> => {
      const upper = (symbol ?? "").toUpperCase();
      // 1) Try the server-side aggregate.
      try {
        return await f<PortfolioBySymbol>(
          `/api/portfolio/by-symbol/${encodeURIComponent(upper)}`,
        );
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status !== 404) throw err;
        // fall through to client-side composition
      }

      // 2) Compose from existing endpoints.
      const [holdingsResp, txsResp] = await Promise.all([
        f<HoldingsResp>("/api/portfolio/holdings"),
        f<{ transactions: TxRow[] }>(
          `/api/portfolio/transactions?ticker=${encodeURIComponent(upper)}&count=500`,
        ),
      ]);
      return composeBySymbol(upper, holdingsResp, txsResp.transactions, isDemo);
    },
    enabled,
    staleTime: 60_000,
  });
}

/* ----------- Demo mock closed lots ------------------------------------ */

/**
 * Deterministic PRNG seeded from the symbol string — same symbol
 * always returns the same mock distribution, so the Realized P/L
 * panels are stable across refresh.
 */
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0;
    h = (h * 16777619) >>> 0;
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build 8–12 plausible closed lots spread over the last ~18 months.
 * Roughly 60% winners, varied sizes and hold durations, realistic
 * per-lot returns (−20% to +35%). Uses the stock's current cost-basis
 * estimate (`basis`) so the dollar amounts feel right.
 */
function mockClosedLots(symbol: string, basis: number): ClosedLot[] {
  const rng = seededRng(symbol);
  const count = 8 + Math.floor(rng() * 5); // 8..12
  const now = Date.now();
  const lots: ClosedLot[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(rng() * 540) + 5; // spread over ~18mo
    const heldDays = Math.floor(rng() * 260) + 20; // 20..280 day holds
    const openedAt = now - (daysAgo + heldDays) * 86_400_000;
    const closedAt = now - daysAgo * 86_400_000;
    // 60% winners
    const isWin = rng() < 0.6;
    const pct = isWin
      ? rng() * 32 + 3 // +3% .. +35%
      : -(rng() * 18 + 2); // -2% .. -20%
    const shares = +(rng() * 9 + 0.5).toFixed(2); // 0.5..9.5 sh
    const costPerShare = +(basis * (0.85 + rng() * 0.3)).toFixed(2); // ±15%
    const sellPerShare = +(costPerShare * (1 + pct / 100)).toFixed(2);
    const realized = +((sellPerShare - costPerShare) * shares).toFixed(2);
    lots.push({
      openedDate: new Date(openedAt).toISOString(),
      closedDate: new Date(closedAt).toISOString(),
      shares,
      costPerShare,
      sellPerShare,
      realizedPl: realized,
      realizedPlPct: +pct.toFixed(2),
      heldDays,
      outcome: realized > 0.01 ? "win" : realized < -0.01 ? "loss" : "breakeven",
    });
  }
  return lots;
}

/* ----------- Client-side aggregator ----------------------------------- */

interface HoldingsLocation {
  institution: string;
  institution_color: string;
  account_name: string;
  quantity: number;
  value: number;
}
interface HoldingRow {
  ticker_symbol: string;
  name: string;
  type: string;
  exchange: string | null;
  quantity: number;
  avg_cost: number;
  close_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  weight_pct: number;
  locations: HoldingsLocation[];
}
interface HoldingsResp {
  holdings: HoldingRow[];
  total_value: number;
}
interface TxRow {
  id: string;
  date: string;
  type: string;
  ticker_symbol: string;
  security_name: string;
  quantity: number;
  price: number;
  amount: number;
  institution: string;
  institution_color: string;
  account_name: string;
}

function composeBySymbol(
  symbol: string,
  holdingsResp: HoldingsResp,
  txs: TxRow[],
  allowMockSeed: boolean,
): PortfolioBySymbol {
  const held = holdingsResp.holdings.find(
    (h) => h.ticker_symbol.toUpperCase() === symbol,
  );

  const sharesHeld = held?.quantity ?? 0;
  const costBasis = held?.cost_basis ?? 0;
  const marketValue = held?.market_value ?? 0;
  const avgCost = held?.avg_cost ?? 0;
  const unrealizedPl = marketValue - costBasis;
  const unrealizedPlPct = costBasis > 0 ? (unrealizedPl / costBasis) * 100 : 0;

  const heldIn = (held?.locations ?? []).map((loc) => ({
    institutionName: loc.institution,
    institutionColor: loc.institution_color,
    accountName: loc.account_name,
    shares: +loc.quantity.toFixed(4),
    value: +loc.value.toFixed(2),
  }));

  // Sort ascending by date for FIFO pairing.
  const ordered = [...txs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // -------- FIFO closed-lot pairing -----------------------------------
  type LotQueue = { shares: number; pricePerShare: number; date: Date };
  const queue: LotQueue[] = [];
  const closedLots: ClosedLot[] = [];
  for (const t of ordered) {
    const date = new Date(t.date);
    if (t.type === "buy" && t.quantity > 0) {
      queue.push({ shares: t.quantity, pricePerShare: t.price, date });
    } else if (t.type === "sell" && t.quantity > 0) {
      let remaining = t.quantity;
      while (remaining > 1e-9 && queue.length > 0) {
        const lot = queue[0];
        const matched = Math.min(lot.shares, remaining);
        const realized = (t.price - lot.pricePerShare) * matched;
        const cost = lot.pricePerShare * matched;
        const pct = cost > 0 ? (realized / cost) * 100 : 0;
        const heldDays = Math.max(
          0,
          Math.round((date.getTime() - lot.date.getTime()) / 86_400_000),
        );
        closedLots.push({
          openedDate: lot.date.toISOString(),
          closedDate: date.toISOString(),
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
        if (lot.shares <= 1e-9) queue.shift();
      }
    }
  }

  // Seed supplementary mock closed lots ONLY for the shared demo
  // account, where new viewers expect a populated Realized P/L panel.
  // Real users see zeroes/empty until they actually close a position —
  // we never inject fake P&L into a real portfolio.
  if (allowMockSeed && closedLots.length < 5) {
    const basis = held?.avg_cost || held?.close_price || 150;
    for (const lot of mockClosedLots(symbol, basis)) closedLots.push(lot);
  }

  // -------- Realized aggregates ---------------------------------------
  const now = new Date();
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  let realizedLifetime = 0;
  let realizedYtd = 0;
  const monthly = new Map<string, number>();
  let heldDaysSum = 0;
  for (const l of closedLots) {
    realizedLifetime += l.realizedPl;
    const closed = new Date(l.closedDate);
    if (closed >= ytdStart) realizedYtd += l.realizedPl;
    heldDaysSum += l.heldDays;
    const key = `${closed.getFullYear()}-${String(closed.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) ?? 0) + l.realizedPl);
  }
  const byMonth: Array<{ month: string; pl: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.push({ month: k, pl: +(monthly.get(k) ?? 0).toFixed(2) });
  }

  // -------- Win stats ------------------------------------------------
  const wins = closedLots.filter((l) => l.outcome === "win");
  const losses = closedLots.filter((l) => l.outcome === "loss");
  const avgWin = wins.length
    ? wins.reduce((s, l) => s + l.realizedPl, 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? losses.reduce((s, l) => s + l.realizedPl, 0) / losses.length
    : 0;
  const best = closedLots.reduce<ClosedLot | null>(
    (b, l) => (!b || l.realizedPl > b.realizedPl ? l : b),
    null,
  );
  const worst = closedLots.reduce<ClosedLot | null>(
    (w, l) => (!w || l.realizedPl < w.realizedPl ? l : w),
    null,
  );

  // -------- Dividends -------------------------------------------------
  const divTxns = ordered.filter((t) => t.type === "dividend");
  const divYtd = divTxns
    .filter((t) => new Date(t.date) >= ytdStart)
    .reduce((s, t) => s + t.amount, 0);
  const divLifetime = divTxns.reduce((s, t) => s + t.amount, 0);
  const trailing12Start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const annualized = divTxns
    .filter((t) => new Date(t.date) >= trailing12Start)
    .reduce((s, t) => s + t.amount, 0);
  const yieldPct = marketValue > 0 ? (annualized / marketValue) * 100 : 0;

  const byQuarter: NonNullable<PortfolioBySymbol["dividends"]>["byQuarter"] = [];
  for (let q = 3; q >= 0; q--) {
    const d = new Date(now.getFullYear(), now.getMonth() - q * 3, 1);
    const qKey = (["Q1", "Q2", "Q3", "Q4"] as const)[Math.floor(d.getMonth() / 3)];
    const year = d.getFullYear();
    const qStart = new Date(year, Math.floor(d.getMonth() / 3) * 3, 1);
    const qEnd = new Date(year, Math.floor(d.getMonth() / 3) * 3 + 3, 0);
    const qTxns = divTxns.filter((t) => {
      const x = new Date(t.date);
      return x >= qStart && x <= qEnd;
    });
    const totalPaid = qTxns.reduce((s, t) => s + t.amount, 0);
    const perShare = sharesHeld > 0 ? totalPaid / sharesHeld : 0;
    const last = qTxns[qTxns.length - 1];
    byQuarter.push({
      quarter: qKey,
      year,
      status: qTxns.length > 0 || qEnd < now ? "PAID" : "UPCOMING",
      perShare: +perShare.toFixed(3),
      totalPaid: +totalPaid.toFixed(2),
      exDate: last ? new Date(new Date(last.date).getTime() - 86_400_000).toISOString() : null,
      payDate: last ? new Date(last.date).toISOString() : null,
      yieldPct:
        marketValue > 0 && totalPaid > 0 ? +((totalPaid / marketValue) * 100).toFixed(2) : null,
    });
  }
  const nextPayment = divTxns.length
    ? new Date(new Date(divTxns[divTxns.length - 1].date).getTime() + 91 * 86_400_000).toISOString()
    : null;

  // -------- Open lots / activity / held-in ---------------------------
  const open: OpenLot[] = (held?.locations ?? []).map((loc) => {
    const shareCost = loc.quantity > 0 ? (loc.value - (loc.value - loc.value)) / loc.quantity : 0;
    // We don't have per-location cost basis in the holdings payload, so
    // we estimate it from the symbol's average cost.
    const estCost = avgCost;
    const cb = estCost * loc.quantity;
    const cv = loc.value;
    const pl = cv - cb;
    return {
      accountId: `${loc.institution}-${loc.account_name}`,
      institutionName: loc.institution,
      institutionColor: loc.institution_color,
      accountName: loc.account_name,
      acquiredDate: new Date(now.getFullYear(), 0, 1).toISOString(),
      shares: +loc.quantity.toFixed(4),
      costPerShare: +estCost.toFixed(4),
      costBasis: +cb.toFixed(2),
      currentValue: +cv.toFixed(2),
      unrealizedPl: +pl.toFixed(2),
      unrealizedPlPct: cb > 0 ? +((pl / cb) * 100).toFixed(2) : 0,
    };
    void shareCost;
  });

  const activity: ActivityItem[] = ordered
    .slice()
    .reverse()
    .map((t) => ({
      id: t.id,
      date: t.date,
      type:
        t.type === "buy" || t.type === "sell" || t.type === "dividend"
          ? (t.type as "buy" | "sell" | "dividend")
          : "other",
      shares: +t.quantity.toFixed(4),
      pricePerShare: +t.price.toFixed(4),
      amount: +t.amount.toFixed(2),
      name: t.security_name || t.ticker_symbol,
      institutionName: t.institution,
      institutionColor: t.institution_color,
      accountName: t.account_name,
    }));

  // Portfolio weight needs the total portfolio value.
  const total = holdingsResp.total_value || 0;
  const weightPct = total > 0 ? (marketValue / total) * 100 : 0;

  return {
    symbol,
    securityId: null,
    securityName: held?.name ?? symbol,
    exchange: held?.exchange ?? null,
    closePrice: held?.close_price ?? 0,
    empty: !held && ordered.length === 0,
    position: {
      sharesHeld: +sharesHeld.toFixed(4),
      avgCostPerShare: +avgCost.toFixed(4),
      marketValue: +marketValue.toFixed(2),
      costBasis: +costBasis.toFixed(2),
      unrealizedPl: +unrealizedPl.toFixed(2),
      unrealizedPlPct: +unrealizedPlPct.toFixed(2),
      openLotsCount: open.length,
    },
    realized: {
      lifetime: +realizedLifetime.toFixed(2),
      ytd: +realizedYtd.toFixed(2),
      closedLotsCount: closedLots.length,
      avgHoldDays: closedLots.length ? Math.round(heldDaysSum / closedLots.length) : 0,
      byMonth,
    },
    lots: {
      open,
      closed: closedLots
        .slice()
        .sort((a, b) => new Date(b.closedDate).getTime() - new Date(a.closedDate).getTime()),
    },
    winStats: {
      winRate: closedLots.length ? +((wins.length / closedLots.length) * 100).toFixed(1) : 0,
      winCount: wins.length,
      lossCount: losses.length,
      avgWin: +avgWin.toFixed(2),
      avgLoss: +avgLoss.toFixed(2),
      payoffRatio: avgLoss < 0 ? +Math.abs(avgWin / avgLoss).toFixed(2) : 0,
      bestTrade: best ? +best.realizedPl.toFixed(2) : 0,
      worstTrade: worst ? +worst.realizedPl.toFixed(2) : 0,
    },
    portfolioWeight: {
      pct: +weightPct.toFixed(2),
      totalPortfolioValue: +total.toFixed(2),
      holdingCount: holdingsResp.holdings.length,
    },
    dividends: {
      ytd: +divYtd.toFixed(2),
      lifetime: +divLifetime.toFixed(2),
      paymentsCount: divTxns.length,
      annualizedEstimate: +annualized.toFixed(2),
      yieldPct: +yieldPct.toFixed(2),
      nextPaymentDateEstimate: nextPayment,
      byQuarter,
    },
    heldIn,
    activity,
  };
}
