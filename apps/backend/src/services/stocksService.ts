/**
 * Live stock data — wraps yahoo-finance2 with:
 *   - Redis TTL caching (30s for quotes, 5min for history/news)
 *   - In-flight request coalescing (concurrent hits for the same cache key
 *     share a single Yahoo request instead of hammering the API)
 *   - Symbol normalization (BRK-B / BRK.B etc.)
 *   - Graceful fallbacks to our DB `Security.closePrice` when Yahoo fails,
 *     so the UI never breaks on a rate limit or network blip
 *
 * yahoo-finance2 scrapes Yahoo's unofficial JSON endpoints and rotates
 * cookies under the hood, so we pin the minor version in package.json
 * (currently 2.11.3) to avoid surprise breakage on floating upgrades.
 */
import yahooFinance from "yahoo-finance2";
import { prisma } from "../db.js";
import { redis } from "../redis.js";

// --------- Types ----------------------------------------------------------

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

export type HistoryRange = "1d" | "5d" | "1mo" | "3mo" | "1y" | "max";

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

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

// --------- Normalisation --------------------------------------------------

/**
 * Yahoo's historical + news endpoints use `BRK-B` but intraday endpoints
 * occasionally prefer `BRK.B`. Accept either from the client, normalise
 * to the `-` variant as the canonical form used for cache keys.
 */
export function normalizeSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  // Replace a class-B dot with a dash: BRK.B -> BRK-B
  return s.replace(/\.(?=[A-Z]$)/, "-");
}

const SYMBOL_PATTERN = /^[A-Z]{1,6}(?:[-.][A-Z]{1,4})?$/;
export function isValidSymbol(s: string): boolean {
  return SYMBOL_PATTERN.test(s);
}

// --------- Coalescing -----------------------------------------------------

/**
 * Module-local promise cache: if two concurrent requests hit the same key
 * before the backing Redis entry is written, they share the same in-flight
 * promise. Prevents a cold-cache burst from firing N duplicate Yahoo calls
 * (Yahoo soft-bans the egress IP if hammered, and we have exactly one IP
 * on the Render free tier).
 */
const inFlight = new Map<string, Promise<unknown>>();

async function coalesce<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = load().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// --------- Redis cache helpers --------------------------------------------

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* non-fatal — cache miss on next call */
  }
}

// --------- DB fallback for quote ------------------------------------------

async function dbFallbackQuote(symbol: string): Promise<StockQuote> {
  const sec = await prisma.security.findUnique({ where: { tickerSymbol: symbol } });
  const now = new Date().toISOString();
  if (sec) {
    return {
      symbol: sec.tickerSymbol,
      name: sec.name,
      exchange: sec.exchange,
      currency: sec.isoCurrencyCode,
      price: sec.closePrice,
      previousClose: sec.closePrice,
      change: 0,
      changePct: 0,
      marketCap: null,
      peRatio: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      volume: null,
      avgVolume: null,
      dividendYieldPct: null,
      beta: null,
      sector: null,
      logoUrl: null,
      isFallback: true,
      asOf: now,
    };
  }
  // Hard minimum — keeps the UI from erroring even if the symbol is
  // completely unknown locally.
  return {
    symbol,
    name: symbol,
    exchange: null,
    currency: "USD",
    price: 0,
    previousClose: 0,
    change: 0,
    changePct: 0,
    marketCap: null,
    peRatio: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    volume: null,
    avgVolume: null,
    dividendYieldPct: null,
    beta: null,
    sector: null,
    logoUrl: null,
    isFallback: true,
    asOf: now,
  };
}

// --------- Public API -----------------------------------------------------

/** Quote: current price + fundamentals + profile. TTL 30s. */
export async function getQuote(rawSymbol: string): Promise<StockQuote> {
  const symbol = normalizeSymbol(rawSymbol);
  const cacheKey = `quote:${symbol}`;
  const cached = await cacheGet<StockQuote>(cacheKey);
  if (cached) return cached;

  return coalesce(cacheKey, async () => {
    try {
      const [q, summary] = await Promise.all([
        yahooFinance.quote(symbol),
        yahooFinance
          .quoteSummary(symbol, {
            modules: ["summaryDetail", "assetProfile", "defaultKeyStatistics"],
          })
          .catch(() => null),
      ]);
      if (!q) return await dbFallbackQuote(symbol);

      const price = (q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0) as number;
      const prev = (q.regularMarketPreviousClose ?? price) as number;
      const change = price - prev;
      const changePct = prev ? (change / prev) * 100 : 0;

      const profile = summary?.assetProfile as
        | { sector?: string; longBusinessSummary?: string; website?: string }
        | undefined;
      const details = summary?.summaryDetail as
        | { dividendYield?: number; beta?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number }
        | undefined;
      const stats = summary?.defaultKeyStatistics as
        { "52WeekChange"?: number } | undefined;
      void stats;

      const quote: StockQuote = {
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
        dividendYieldPct: details?.dividendYield ? details.dividendYield * 100 : null,
        beta: details?.beta ?? null,
        sector: profile?.sector ?? null,
        // Clearbit's logo API works for most recognisable US tickers; if the
        // asset doesn't have a matching domain, the frontend falls back to
        // an initials avatar.
        logoUrl: makeLogoUrl(profile, symbol),
        isFallback: false,
        asOf: new Date().toISOString(),
      };

      await cacheSet(cacheKey, quote, 30);
      return quote;
    } catch (err) {
      console.warn(`[stocksService] getQuote(${symbol}) failed, falling back to DB:`, err);
      return await dbFallbackQuote(symbol);
    }
  });
}

function makeLogoUrl(
  profile: { website?: string } | undefined,
  _symbol: string,
): string | null {
  try {
    const website = profile?.website;
    if (!website) return null;
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return `https://logo.clearbit.com/${url.hostname.replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

/** OHLCV history. TTL 300s. */
export async function getHistory(
  rawSymbol: string,
  range: HistoryRange,
): Promise<StockHistory> {
  const symbol = normalizeSymbol(rawSymbol);
  const cacheKey = `history:${symbol}:${range}`;
  const cached = await cacheGet<StockHistory>(cacheKey);
  if (cached) return cached;

  return coalesce(cacheKey, async () => {
    try {
      const candles = await fetchCandles(symbol, range);
      if (candles.length === 0 && symbol.includes("-")) {
        // Narrow retry: some endpoints occasionally prefer the dot variant.
        const dotted = symbol.replace("-", ".");
        const retried = await fetchCandles(dotted, range);
        if (retried.length > 0) {
          const hist: StockHistory = {
            symbol,
            range,
            candles: retried,
            isFallback: false,
          };
          await cacheSet(cacheKey, hist, 300);
          return hist;
        }
      }
      const hist: StockHistory = {
        symbol,
        range,
        candles,
        isFallback: candles.length === 0,
      };
      await cacheSet(cacheKey, hist, 300);
      return hist;
    } catch (err) {
      console.warn(`[stocksService] getHistory(${symbol},${range}) failed:`, err);
      return { symbol, range, candles: [], isFallback: true };
    }
  });
}

async function fetchCandles(symbol: string, range: HistoryRange): Promise<StockCandle[]> {
  const { period1, period2, interval } = rangeToChartParams(range);
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
    period2,
    interval,
    includePrePost: false,
  } as unknown as Parameters<typeof yahooFinance.chart>[1])) as unknown as ChartResult;

  const quotes = Array.isArray(result?.quotes) ? result.quotes : [];
  return quotes
    .filter((q) => q && q.date && q.close !== null && q.close !== undefined)
    .map((q) => ({
      time: new Date(q.date as Date).toISOString(),
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      close: q.close ?? null,
      volume: q.volume ?? null,
    }));
}

function rangeToChartParams(range: HistoryRange): {
  period1: Date;
  period2: Date;
  interval:
    | "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h"
    | "1d" | "5d" | "1wk" | "1mo" | "3mo";
} {
  const now = new Date();
  const period2 = now;
  const d = (days: number) => new Date(now.getTime() - days * 86_400_000);
  switch (range) {
    case "1d":  return { period1: d(1),    period2, interval: "5m"  };
    case "5d":  return { period1: d(5),    period2, interval: "15m" };
    case "1mo": return { period1: d(31),   period2, interval: "1d"  };
    case "3mo": return { period1: d(93),   period2, interval: "1d"  };
    case "1y":  return { period1: d(366),  period2, interval: "1d"  };
    case "max": return { period1: new Date(1990, 0, 1), period2, interval: "1wk" };
  }
}

/** News headlines. TTL 300s. */
export async function getNews(rawSymbol: string, limit = 10): Promise<NewsItem[]> {
  const symbol = normalizeSymbol(rawSymbol);
  const cacheKey = `news:${symbol}`;
  const cached = await cacheGet<NewsItem[]>(cacheKey);
  if (cached) return cached.slice(0, limit);

  return coalesce(cacheKey, async () => {
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
      const news = Array.isArray(result?.news) ? result.news : [];
      const items: NewsItem[] = news.slice(0, limit).map((n, i) => {
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
      await cacheSet(cacheKey, items, 300);
      return items;
    } catch (err) {
      console.warn(`[stocksService] getNews(${symbol}) failed:`, err);
      return [];
    }
  });
}

function relativeTimeFrom(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  const secs = Math.max(1, Math.floor((now - then) / 1000));
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

/** Typeahead. Not cached — user-driven. */
export async function searchSymbols(
  q: string,
  limit = 15,
): Promise<SymbolSearchResult[]> {
  try {
    const trimmed = q.trim();
    if (!trimmed) return [];
    type Raw = {
      symbol?: string;
      shortname?: string;
      longname?: string;
      exchange?: string;
      quoteType?: string;
      typeDisp?: string;
    };
    const result = (await yahooFinance.search(trimmed, {
      quotesCount: limit,
      newsCount: 0,
    })) as unknown as { quotes?: Raw[] };
    const quotes = Array.isArray(result?.quotes) ? result.quotes : [];
    return quotes
      .filter((r) => r && r.symbol)
      .slice(0, limit)
      .map((r) => ({
        symbol: r.symbol as string,
        name: (r.longname ?? r.shortname ?? r.symbol) as string,
        exchange: r.exchange ?? null,
        type: r.typeDisp ?? r.quoteType ?? null,
      }));
  } catch (err) {
    console.warn(`[stocksService] searchSymbols(${q}) failed:`, err);
    return [];
  }
}
