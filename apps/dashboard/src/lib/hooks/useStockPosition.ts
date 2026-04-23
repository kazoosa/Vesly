import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { apiFetch } from "../api";

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
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const enabled = Boolean(symbol && accessToken);
  return useQuery({
    queryKey: ["stocks", "by-symbol", symbol],
    queryFn: () =>
      f<PortfolioBySymbol>(
        `/api/portfolio/by-symbol/${encodeURIComponent(symbol ?? "")}`,
      ),
    enabled,
    staleTime: 60_000,
  });
}
