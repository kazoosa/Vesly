import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { MiniSparkline } from "../../components/MiniSparkline";
import { fmtPct, fmtUsd } from "../../components/money";
import type {
  StockHistory,
  StockQuote,
} from "../../lib/hooks/useStockMarket";

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

  return (
    <div className="card p-3 space-y-2">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbols"
          className="input w-full text-sm pl-8"
          aria-label="Search stocks"
        />
        <svg
          aria-hidden
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <ul className="divide-y divide-border-subtle max-h-[calc(100vh-10rem)] md:max-h-[calc(100vh-10rem)] overflow-y-auto -mx-1 pr-1">
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
  const f = apiFetch(() => accessToken);
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
    queryFn: () => f<StockQuote>(`/api/stocks/quote/${encodeURIComponent(symbol)}`),
    enabled,
    staleTime: 30_000,
  });
  const history = useQuery({
    queryKey: ["stocks", "history", symbol, "1mo"],
    queryFn: () =>
      f<StockHistory>(`/api/stocks/history/${encodeURIComponent(symbol)}?range=1mo`),
    enabled,
    staleTime: 5 * 60_000,
  });

  const sparkData = useMemo(
    () =>
      (history.data?.candles ?? [])
        .map((c) => c.close)
        .filter((v): v is number => v !== null && v !== undefined),
    [history.data],
  );

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
