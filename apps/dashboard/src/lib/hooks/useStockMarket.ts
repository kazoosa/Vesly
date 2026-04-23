import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";

export type HistoryRange = "1d" | "5d" | "1mo" | "3mo" | "1y" | "max";

/**
 * Stock market data (quote/history/news) is served by Vercel
 * serverless functions at /api/stocks/*, not the Render backend. This
 * keeps the feature live without requiring a Render redeploy every
 * time we touch a stock endpoint. No auth header needed — the Yahoo
 * proxy is public read-only data.
 */
async function stocksFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  }
  return (await res.json()) as T;
}

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
  /** Which backend source served this quote. */
  source?: "finnhub" | "yahoo" | "stooq";
  /** Short human-readable label — e.g. "Yahoo (real-time)". */
  sourceLabel?: string;
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
  const enabled = Boolean(symbol && accessToken);
  const encoded = symbol ? encodeURIComponent(symbol) : "";

  const quote = useQuery({
    queryKey: ["stocks", "quote", symbol],
    queryFn: () => stocksFetch<StockQuote>(`/api/stocks/quote/${encoded}`),
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
  });

  const history = useQuery({
    queryKey: ["stocks", "history", symbol, range],
    queryFn: () =>
      stocksFetch<StockHistory>(`/api/stocks/history/${encoded}?range=${range}`),
    enabled,
    staleTime: 5 * 60_000,
  });

  const news = useQuery({
    queryKey: ["stocks", "news", symbol],
    queryFn: () => stocksFetch<NewsResponse>(`/api/stocks/news/${encoded}`),
    enabled,
    staleTime: 5 * 60_000,
  });

  return { quote, history, news };
}
