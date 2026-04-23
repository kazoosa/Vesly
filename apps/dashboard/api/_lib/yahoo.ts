/**
 * Live market data — Finnhub → Yahoo (v7 quote, v8 chart, v1 search) →
 * Stooq fallback. Every Yahoo call goes through a retry-once-with-a-
 * rotated-User-Agent wrapper, and chart + news try query1 first then
 * query2 (different edge pools on Yahoo's side).
 *
 * Running this serverless from Vercel's `iad1` region always returned
 * 429 from Yahoo — see the earlier `X-Yahoo-Debug` log. vercel.json
 * now pins the handlers to `fra1` and `hnd1` which sit outside that
 * block, so direct Yahoo calls work.
 */
import { fetchFinnhubQuote, fetchFinnhubNews, hasFinnhubKey } from "./finnhub.js";

/* --------------------------------------------------------- Shared types */

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\.(?=[A-Z]$)/, "-");
}

export function isValidSymbol(s: string): boolean {
  return /^[A-Z]{1,6}(?:[-.][A-Z]{1,4})?$/.test(s);
}

export type QuoteSource = "finnhub" | "yahoo" | "stooq";

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
  source: QuoteSource;
  sourceLabel: string;
}

let lastError: string | null = null;
export function getLastError(): string | null {
  return lastError;
}

/* --------------------------------------------------------- Fetch plumbing */

const UA_ROTATION = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
];

/**
 * Retry-once-with-a-different-User-Agent. If both attempts fail, sets
 * `lastError` to the final reason and returns null.
 */
async function resilientJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < UA_ROTATION.length; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA_ROTATION[attempt],
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (r.ok) {
        const ct = r.headers.get("content-type") ?? "";
        if (!ct.includes("json")) {
          lastError = `non-json content-type from ${new URL(url).hostname}: ${ct}`;
          continue;
        }
        return (await r.json()) as T;
      }
      lastError = `${new URL(url).hostname} HTTP ${r.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA_ROTATION[0],
        Accept: "text/csv, text/plain, */*",
      },
    });
    if (!r.ok) {
      lastError = `stooq HTTP ${r.status}`;
      return null;
    }
    const text = await r.text();
    if (text.toLowerCase().includes("no data")) {
      lastError = "stooq returned 'no data'";
      return null;
    }
    return text;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
}

/* ----------------------------------------------------- Stooq (last resort) */

function stooqSymbol(sym: string): string {
  return `${sym.toLowerCase()}.us`;
}

async function stooqQuote(symbol: string): Promise<StockQuote | null> {
  const url = `https://stooq.com/q/l/?s=${stooqSymbol(symbol)}&f=sd2t2ohlcvn&h&e=csv`;
  const csv = await fetchText(url);
  if (!csv) return null;
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    lastError = "stooq quote: no data row";
    return null;
  }
  const [header, data] = rows;
  const idx = (name: string) =>
    header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const name = data[idx("name")] ?? symbol;
  const open = parseFloat(data[idx("open")]);
  const close = parseFloat(data[idx("close")]);
  const volume = parseInt(data[idx("volume")], 10);
  if (!Number.isFinite(close) || close === 0) {
    lastError = `stooq quote: invalid close (${data[idx("close")]})`;
    return null;
  }
  const prev = Number.isFinite(open) && open > 0 ? open : close;
  const change = close - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  return {
    symbol,
    name,
    exchange: null,
    currency: "USD",
    price: close,
    previousClose: prev,
    change,
    changePct,
    marketCap: null,
    peRatio: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    volume: Number.isFinite(volume) ? volume : null,
    avgVolume: null,
    dividendYieldPct: null,
    beta: null,
    sector: null,
    logoUrl: null,
    isFallback: false,
    asOf: new Date().toISOString(),
    source: "stooq",
    sourceLabel: "Stooq (~15m delayed)",
  };
}

/* ----------------------------------------------------- Yahoo v8 quote */

// Yahoo retired public access to /v7/finance/quote in 2024 (401
// "User is unable to access this feature"). The v8 chart endpoint is
// still open and its `meta` block carries the full real-time quote,
// so we extract from there. Same query1↔query2 fallback as the
// chart endpoint below, because they share backends.
type YahooChartMetaResp = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        longName?: string;
        shortName?: string;
        currency?: string;
        fullExchangeName?: string;
        exchangeName?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        regularMarketVolume?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketTime?: number;
      };
    }>;
  };
};

async function yahooQuote(symbol: string): Promise<StockQuote | null> {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    const url =
      `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=1d&includePrePost=false`;
    const json = await resilientJson<YahooChartMetaResp>(url);
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice === undefined) continue;

    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? price;
    const change = price - prev;
    const changePct = prev ? (change / prev) * 100 : 0;

    return {
      symbol,
      name: meta.longName ?? meta.shortName ?? meta.symbol ?? symbol,
      exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
      currency: meta.currency ?? "USD",
      price,
      previousClose: prev,
      change,
      changePct,
      marketCap: null,
      peRatio: null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      volume: meta.regularMarketVolume ?? null,
      avgVolume: null,
      dividendYieldPct: null,
      beta: null,
      sector: null,
      logoUrl: null,
      isFallback: false,
      asOf: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
      source: "yahoo",
      sourceLabel: "Yahoo (real-time)",
    };
  }
  return null;
}

/* -------------------------------------------------- Public quote (layered) */

export async function fetchQuote(symbol: string): Promise<StockQuote | null> {
  // 1) Finnhub when available — sub-second latency.
  if (hasFinnhubKey()) {
    const fh = await fetchFinnhubQuote(symbol);
    if (fh) {
      const { quote: q, profile: p } = fh;
      return {
        symbol,
        name: p?.name ?? symbol,
        exchange: p?.exchange ?? null,
        currency: p?.currency ?? "USD",
        price: q.c,
        previousClose: q.pc,
        change: q.d,
        changePct: q.dp,
        marketCap: p?.marketCapitalization
          ? p.marketCapitalization * 1_000_000
          : null,
        peRatio: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        volume: null,
        avgVolume: null,
        dividendYieldPct: null,
        beta: null,
        sector: p?.finnhubIndustry ?? null,
        logoUrl: p?.logo ?? null,
        isFallback: false,
        asOf: q.t ? new Date(q.t * 1000).toISOString() : new Date().toISOString(),
        source: "finnhub",
        sourceLabel: "Finnhub (real-time)",
      };
    }
    lastError = "finnhub empty, trying yahoo";
  }

  // 2) Yahoo v7 quote — real-time, free from fra1/hnd1.
  const yq = await yahooQuote(symbol);
  if (yq) return yq;

  // 3) Stooq — delayed but always-on.
  return await stooqQuote(symbol);
}

/* ------------------------------------------------------------ History */

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

function rangeToYahooParams(range: HistoryRange): { interval: string; range: string } {
  switch (range) {
    case "1d":  return { interval: "5m",  range: "1d"  };
    case "5d":  return { interval: "15m", range: "5d"  };
    case "1mo": return { interval: "1d",  range: "1mo" };
    case "3mo": return { interval: "1d",  range: "3mo" };
    case "1y":  return { interval: "1d",  range: "1y"  };
    case "max": return { interval: "1wk", range: "max" };
  }
}

type ChartResp = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
};

export async function fetchHistory(
  symbol: string,
  range: HistoryRange,
): Promise<StockHistory> {
  const { interval, range: r } = rangeToYahooParams(range);
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    const url =
      `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=${interval}&range=${r}&includePrePost=false`;
    const body = await resilientJson<ChartResp>(url);
    const result = body?.chart?.result?.[0];
    const ts = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0];
    if (!q || ts.length === 0) continue;
    const candles: StockCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const close = q.close?.[i] ?? null;
      if (close === null) continue;
      candles.push({
        time: new Date(ts[i] * 1000).toISOString(),
        open: q.open?.[i] ?? null,
        high: q.high?.[i] ?? null,
        low: q.low?.[i] ?? null,
        close,
        volume: q.volume?.[i] ?? null,
      });
    }
    if (candles.length > 0) {
      return { symbol, range, candles, isFallback: false };
    }
  }
  return { symbol, range, candles: [], isFallback: true };
}

/* ------------------------------------------------------------- News */

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  relativeTime: string;
}

type YahooSearchResp = {
  news?: Array<{
    uuid?: string;
    title?: string;
    link?: string;
    publisher?: string;
    providerPublishTime?: number;
  }>;
};

export async function fetchNews(symbol: string, limit = 10): Promise<NewsItem[]> {
  // 1) Finnhub when available — real company news via /company-news.
  if (hasFinnhubKey()) {
    const raw = await fetchFinnhubNews(symbol);
    if (raw && raw.length > 0) {
      return raw
        .slice()
        .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
        .slice(0, limit)
        .map((n, i) => {
          const publishedAt = n.datetime
            ? new Date(n.datetime * 1000).toISOString()
            : new Date().toISOString();
          return {
            id: n.id ? String(n.id) : `${symbol}-${i}`,
            source: (n.source ?? "").toUpperCase() || "FINNHUB",
            title: n.headline ?? "",
            url: n.url ?? "",
            publishedAt,
            relativeTime: relativeTimeFrom(publishedAt),
          };
        });
    }
  }

  // 2) Yahoo v1 finance search — real headlines, query1 → query2 fallback.
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    const url =
      `https://${host}/v1/finance/search?q=${encodeURIComponent(symbol)}` +
      `&quotesCount=0&newsCount=${limit}`;
    const json = await resilientJson<YahooSearchResp>(url);
    const news = json?.news ?? [];
    if (news.length === 0) continue;
    return news.slice(0, limit).map((n, i) => {
      const publishedAt = n.providerPublishTime
        ? new Date(n.providerPublishTime * 1000).toISOString()
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
  }
  return [];
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
