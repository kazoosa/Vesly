/**
 * Yahoo Finance helpers backed by the `yahoo-finance2` library.
 *
 * The previous pass hit Yahoo's JSON endpoints directly and ran into
 * Yahoo's newer "429 Too Many Requests" for unauthenticated callers —
 * they now require a cookie + crumb token handshake before every
 * `query1/query2` call. `yahoo-finance2` handles that dance
 * internally, pooling a cached cookie across invocations.
 *
 * Pinned exact at 2.11.3 (see package.json) because the upstream has
 * a history of rotating the handshake when Yahoo breaks it on their
 * side.
 */
import yahooFinance from "yahoo-finance2";

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\.(?=[A-Z]$)/, "-");
}

export function isValidSymbol(s: string): boolean {
  return /^[A-Z]{1,6}(?:[-.][A-Z]{1,4})?$/.test(s);
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
}

function makeLogoUrl(website?: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return `https://logo.clearbit.com/${url.hostname.replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

// Module-local error surface so the handler can report what actually
// went wrong — visible via the X-Yahoo-Debug response header.
let lastError: string | null = null;
export function getLastError(): string | null {
  return lastError;
}

export async function fetchQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const [q, summary] = await Promise.all([
      yahooFinance.quote(symbol),
      yahooFinance
        .quoteSummary(symbol, {
          modules: ["summaryDetail", "assetProfile", "defaultKeyStatistics"],
        })
        .catch(() => null),
    ]);
    if (!q) { lastError = "empty quote response"; return null; }

    const price = (q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0) as number;
    const prev = (q.regularMarketPreviousClose ?? price) as number;
    const change = price - prev;
    const changePct = prev ? (change / prev) * 100 : 0;

    type Profile = { sector?: string; website?: string; longBusinessSummary?: string };
    type Detail = {
      dividendYield?: number;
      beta?: number;
      fiftyTwoWeekHigh?: number;
      fiftyTwoWeekLow?: number;
    };
    const profile = summary?.assetProfile as Profile | undefined;
    const details = summary?.summaryDetail as Detail | undefined;

    return {
      symbol,
      name: (q.longName ?? q.shortName ?? symbol) as string,
      exchange: (q.fullExchangeName ?? q.exchange ?? null) as string | null,
      currency: (q.currency ?? "USD") as string,
      price,
      previousClose: prev,
      change,
      changePct,
      marketCap: (q.marketCap ?? null) as number | null,
      peRatio: (q.trailingPE ?? null) as number | null,
      fiftyTwoWeekHigh: (q.fiftyTwoWeekHigh ?? details?.fiftyTwoWeekHigh ?? null) as number | null,
      fiftyTwoWeekLow: (q.fiftyTwoWeekLow ?? details?.fiftyTwoWeekLow ?? null) as number | null,
      volume: (q.regularMarketVolume ?? null) as number | null,
      avgVolume: (q.averageDailyVolume3Month ?? null) as number | null,
      dividendYieldPct:
        details?.dividendYield !== undefined ? details.dividendYield * 100 : null,
      beta: details?.beta ?? null,
      sector: profile?.sector ?? null,
      logoUrl: makeLogoUrl(profile?.website),
      isFallback: false,
      asOf: new Date().toISOString(),
    };
  } catch (err) {
    lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[yahoo.fetchQuote]", symbol, err);
    return null;
  }
}

export type HistoryRange = "1d" | "5d" | "1mo" | "3mo" | "1y" | "max";

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

function rangeToChartArgs(
  range: HistoryRange,
): { period1: Date; interval:
    | "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h"
    | "1d" | "5d" | "1wk" | "1mo" | "3mo" } {
  const now = new Date();
  const d = (days: number) => new Date(now.getTime() - days * 86_400_000);
  switch (range) {
    case "1d":  return { period1: d(1),                     interval: "5m"  };
    case "5d":  return { period1: d(5),                     interval: "15m" };
    case "1mo": return { period1: d(31),                    interval: "1d"  };
    case "3mo": return { period1: d(93),                    interval: "1d"  };
    case "1y":  return { period1: d(366),                   interval: "1d"  };
    case "max": return { period1: new Date(1990, 0, 1),     interval: "1wk" };
  }
}

export async function fetchHistory(
  symbol: string,
  range: HistoryRange,
): Promise<StockHistory> {
  try {
    const { period1, interval } = rangeToChartArgs(range);
    type ChartResult = {
      quotes?: Array<{
        date?: Date | string;
        open?: number | null;
        high?: number | null;
        low?: number | null;
        close?: number | null;
        volume?: number | null;
      }>;
    };
    const result = (await yahooFinance.chart(symbol, {
      period1,
      interval,
      includePrePost: false,
    } as unknown as Parameters<typeof yahooFinance.chart>[1])) as unknown as ChartResult;
    const quotes = Array.isArray(result?.quotes) ? result.quotes : [];
    const candles: StockCandle[] = quotes
      .filter((q) => q && q.date && q.close !== null && q.close !== undefined)
      .map((q) => ({
        time: new Date(q.date as Date).toISOString(),
        open: q.open ?? null,
        high: q.high ?? null,
        low: q.low ?? null,
        close: q.close ?? null,
        volume: q.volume ?? null,
      }));
    return {
      symbol,
      range,
      candles,
      isFallback: candles.length === 0,
    };
  } catch (err) {
    console.error("[yahoo.fetchHistory]", symbol, range, err);
    return { symbol, range, candles: [], isFallback: true };
  }
}

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  relativeTime: string;
}

export async function fetchNews(symbol: string, limit = 10): Promise<NewsItem[]> {
  try {
    type Raw = {
      uuid?: string;
      title?: string;
      link?: string;
      publisher?: string;
      providerPublishTime?: number | Date;
    };
    const result = (await yahooFinance.search(symbol, {
      newsCount: limit,
      quotesCount: 0,
    })) as unknown as { news?: Raw[] };
    const items = Array.isArray(result?.news) ? result.news : [];
    return items.slice(0, limit).map((n, i) => {
      const publishedAt = n.providerPublishTime
        ? new Date(
            typeof n.providerPublishTime === "number"
              ? n.providerPublishTime * 1000
              : n.providerPublishTime,
          ).toISOString()
        : new Date().toISOString();
      return {
        id: n.uuid ?? `${symbol}-${i}`,
        source: (n.publisher ?? "").toUpperCase() || "YAHOO",
        title: n.title ?? "",
        url: n.link ?? "",
        publishedAt,
        relativeTime: relativeTimeFrom(publishedAt),
      };
    });
  } catch (err) {
    console.error("[yahoo.fetchNews]", symbol, err);
    return [];
  }
}

function relativeTimeFrom(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function setCors(headers: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  };
}
