import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { apiFetch } from "../api";

export type HistoryRange = "1d" | "5d" | "1mo" | "3mo" | "1y" | "max";

export interface StockQuote {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  marketCap: number | null;
  peRatio: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volume: number | null;
  avgVolume: number | null;
  dividendYieldPct: number | null;
  beta: number | null;
  sector: string | null;
  logoUrl: string | null;
  isFallback: boolean;
  asOf: string;
}

export interface StockCandle {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface StockHistory {
  symbol: string;
  range: HistoryRange;
  candles: StockCandle[];
  isFallback: boolean;
}

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  relativeTime: string;
}

export interface NewsResponse {
  symbol: string;
  items: NewsItem[];
}

/**
 * Composed market-data hook.
 *
 * Returns the three sub-queries separately so each panel on the Stocks
 * page can render its own loading / error state. A news failure never
 * blanks the whole right rail.
 */
export function useStockMarket(symbol: string | null, range: HistoryRange = "1mo") {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const enabled = Boolean(symbol && accessToken);
  const encoded = symbol ? encodeURIComponent(symbol) : "";

  const quote = useQuery({
    queryKey: ["stocks", "quote", symbol],
    queryFn: () => f<StockQuote>(`/api/stocks/quote/${encoded}`),
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
  });

  const history = useQuery({
    queryKey: ["stocks", "history", symbol, range],
    queryFn: () =>
      f<StockHistory>(`/api/stocks/history/${encoded}?range=${range}`),
    enabled,
    staleTime: 5 * 60_000,
  });

  const news = useQuery({
    queryKey: ["stocks", "news", symbol],
    queryFn: () => f<NewsResponse>(`/api/stocks/news/${encoded}`),
    enabled,
    staleTime: 5 * 60_000,
  });

  return { quote, history, news };
}
