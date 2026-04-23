import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { MiniSparkline } from "../../components/MiniSparkline";
import { fmtPct, fmtUsd } from "../../components/money";
import type {
  StockHistory,
  StockQuote,
} from "../../lib/hooks/useStockMarket";

async function stocksFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Left rail — search-filterable list of symbols with live price + sparkline. */
export function StockList({
  symbols,
  selected,
  onSelect,
}: {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return symbols;
    return symbols.filter((s) => s.includes(q));
  }, [symbols, query]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="card p-3 flex flex-col min-h-0 max-h-[calc(100vh-6rem)]">
      <div className="relative mb-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbols"
          className={`input w-full text-sm ${hasQuery ? "pl-3" : "pl-8"}`}
          aria-label="Search stocks"
        />
        {/* Hide the icon while the user is typing so it never overlaps
            the text — we drop the left padding above to compensate. */}
        {!hasQuery && (
          <svg
            aria-hidden
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-fg-muted font-mono px-1 pb-1">
        Showing {filtered.length} symbol{filtered.length === 1 ? "" : "s"}
        {hasQuery && symbols.length !== filtered.length && (
          <span className="ml-1 normal-case tracking-normal text-fg-fainter">
            · {symbols.length} total
          </span>
        )}
      </div>
      <ul className="divide-y divide-border-subtle overflow-y-auto -mx-1 pr-1 flex-1 min-h-0">
        {filtered.map((sym) => (
          <StockListItem
            key={sym}
            symbol={sym}
            active={sym === selected}
            onClick={() => onSelect(sym)}
          />
        ))}
        {filtered.length === 0 && (
          <li className="text-xs text-fg-muted text-center py-6">
            No symbols match "{query}"
          </li>
        )}
      </ul>
    </div>
  );
}

function StockListItem({
  symbol,
  active,
  onClick,
}: {
  symbol: string;
  active: boolean;
  onClick: () => void;
}) {
  const { accessToken } = useAuth();
  const ref = useRef<HTMLLIElement>(null);
  const [inView, setInView] = useState(() =>
    typeof IntersectionObserver === "undefined",
  );

  // IntersectionObserver gate so off-screen rows don't fire API calls.
  // Fallback to always-load on environments that don't have it.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setInView(true),
      { rootMargin: "80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Scroll the selected row into view when it changes (e.g. deep-link
  // from a Transactions ticker click).
  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active]);

  const enabled = inView && Boolean(accessToken);
  const quote = useQuery({
    queryKey: ["stocks", "quote", symbol],
    queryFn: () => stocksFetch<StockQuote>(`/api/stocks/quote/${encodeURIComponent(symbol)}`),
    enabled,
    staleTime: 30_000,
  });
  const history = useQuery({
    queryKey: ["stocks", "history", symbol, "1mo"],
    queryFn: () =>
      stocksFetch<StockHistory>(`/api/stocks/history/${encodeURIComponent(symbol)}?range=1mo`),
    enabled,
    staleTime: 5 * 60_000,
  });

  // Surface per-row failures in the console so we can see in prod
  // which specific tickers are breaking (and whether it's quote or
  // history that's the culprit).
  useEffect(() => {
    if (quote.error) console.warn(`[stocks] quote failed for ${symbol}:`, quote.error);
  }, [quote.error, symbol]);
  useEffect(() => {
    if (history.error) console.warn(`[stocks] history failed for ${symbol}:`, history.error);
  }, [history.error, symbol]);

  const sparkData = useMemo(() => {
    const closes = (history.data?.candles ?? [])
      .map((c) => c.close)
      .filter((v): v is number => v !== null && v !== undefined);
    if (closes.length >= 2) return closes;
    // Fall back to a two-point line (prev -> current) when history is
    // blocked upstream, so the row still carries a visual delta hint
    // instead of an empty box.
    if (quote.data) {
      return [quote.data.previousClose || quote.data.price, quote.data.price];
    }
    return [];
  }, [history.data, quote.data]);

  const price = quote.data?.price ?? 0;
  const changePct = quote.data?.changePct ?? 0;
  const name = quote.data?.name ?? "";

  return (
    <li
      ref={ref}
      className={`px-2 py-2.5 rounded-md cursor-pointer grid grid-cols-[1fr_72px] gap-2 items-center ${
        active ? "bg-bg-overlay" : "hover:bg-bg-hover"
      }`}
      onClick={onClick}
      role="button"
      aria-pressed={active}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-num font-semibold text-fg-primary text-sm">{symbol}</span>
          {quote.data && (
            <span
              className={`text-[11px] font-num ${
                changePct > 0 ? "pos" : changePct < 0 ? "neg" : "text-fg-muted"
              }`}
            >
              {fmtPct(changePct, { showSign: true })}
            </span>
          )}
        </div>
        <div className="text-[11px] text-fg-muted truncate">
          {name || "\u00A0"}
        </div>
        {quote.data && (
          <div className="text-[11px] font-num text-fg-secondary mt-0.5">
            {fmtUsd(price)}
          </div>
        )}
      </div>
      <MiniSparkline data={sparkData} height={32} />
    </li>
  );
}
