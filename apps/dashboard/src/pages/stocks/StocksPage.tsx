import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { useTo } from "../../lib/basePath";
import { STOCK_WATCHLIST } from "../../lib/stockWatchlist";
import { useStockMarket, type HistoryRange } from "../../lib/hooks/useStockMarket";
import { useStockPosition } from "../../lib/hooks/useStockPosition";
import { StockList } from "./StockList";
import { StockDetail } from "./StockDetail";

/**
 * /app/stocks — two-pane layout. Left: searchable stock list. Right:
 * deep detail view pulling live Yahoo data + per-symbol portfolio
 * aggregate. Selection is URL-addressable via `?symbol=AAPL` so the
 * Transactions page can deep-link rows directly into a stock.
 */
const COLLAPSE_KEY = "beacon.stocks.listCollapsed";

export function StocksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<HistoryRange>("1mo");
  // Persist collapse across reloads. Read synchronously so first paint
  // already reflects the user's last preference (no flash).
  const [listCollapsed, setListCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, listCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [listCollapsed]);

  // Held tickers from existing portfolio endpoint — dedupe against
  // the static watchlist and order by value first so the user's own
  // holdings are what they see before the curated set.
  const { accessToken, isDemo } = useAuth();
  const f = apiFetch(() => accessToken);
  const holdings = useQuery({
    queryKey: ["holdings", "for-stocks"],
    queryFn: () =>
      f<{
        holdings: Array<{ ticker_symbol: string; name: string; market_value: number }>;
      }>("/api/portfolio/holdings"),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });

  const symbolList = useMemo(() => {
    const held = (holdings.data?.holdings ?? [])
      // Accept digits (mutual funds like FXAIX, Vanguard VTSAX) in
      // addition to letters / dots / hyphens. Previous regex excluded
      // them and silently dropped real holdings.
      .filter((h) => h.ticker_symbol && /^[A-Z0-9.-]{1,10}$/.test(h.ticker_symbol.toUpperCase()))
      .sort((a, b) => b.market_value - a.market_value)
      .map((h) => h.ticker_symbol.toUpperCase());
    // Real accounts: only show what the user actually holds. The static
    // watchlist is a demo-only convenience so brand-new visitors see a
    // populated list instead of an empty pane.
    const seen = new Set<string>();
    const ordered: string[] = [];
    const source = isDemo
      ? [...held, ...STOCK_WATCHLIST.map((s) => s.toUpperCase())]
      : held;
    for (const s of source) {
      if (!seen.has(s)) {
        ordered.push(s);
        seen.add(s);
      }
    }
    return ordered;
  }, [holdings.data, isDemo]);

  const selected = (searchParams.get("symbol") ?? symbolList[0] ?? "").toUpperCase();

  // If the URL has no symbol and the list just loaded, seed it so deep
  // links from refresh / back-nav are stable.
  useEffect(() => {
    if (!searchParams.get("symbol") && symbolList.length > 0) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("symbol", symbolList[0]);
          return next;
        },
        { replace: true },
      );
    }
  }, [symbolList, searchParams, setSearchParams]);

  const selectSymbol = (sym: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("symbol", sym);
      return next;
    });
  };

  const market = useStockMarket(selected, range);
  const position = useStockPosition(selected);

  // Real account, holdings finished loading, nothing held → render the
  // empty state instead of two empty panes.
  if (!isDemo && holdings.isFetched && symbolList.length === 0) {
    return <NoHoldingsEmptyState />;
  }

  return (
    <div
      className={`grid grid-cols-1 ${
        listCollapsed ? "md:grid-cols-1" : "md:grid-cols-[320px_1fr]"
      } gap-4 md:gap-6 -m-4 md:-m-6 p-4 md:p-6 min-h-full relative`}
    >
      {!listCollapsed && (
        <aside className="md:sticky md:top-0 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] uppercase tracking-widest text-fg-muted">
              Symbols
            </span>
            <button
              type="button"
              onClick={() => setListCollapsed(true)}
              className="inline-flex items-center gap-1 text-fg-muted hover:text-fg-primary text-[11px] px-2 py-1 rounded border border-border-subtle hover:bg-bg-hover transition-colors"
              title="Collapse symbol list"
              aria-label="Collapse symbol list"
            >
              <span aria-hidden>‹</span>
              <span>Hide</span>
            </button>
          </div>
          <StockList
            symbols={symbolList}
            selected={selected}
            onSelect={selectSymbol}
          />
        </aside>
      )}
      {listCollapsed && (
        <button
          type="button"
          onClick={() => setListCollapsed(false)}
          // Offset by the desktop sidebar's collapsed width so the
          // tab is visible to the right of it (was hiding behind the
          // 49px-wide app sidebar at left:0). On mobile the app
          // sidebar is offscreen so left-0 is fine; we use left-0
          // there and shift on md+ via the sidebar offset. z-40 sits
          // above page content but below the mobile drawer (z-50).
          className="flex fixed left-0 md:left-[49px] top-1/2 -translate-y-1/2 z-40 items-center gap-1 px-1.5 py-3 rounded-r-md border border-l-0 border-border-subtle bg-bg-elevated text-fg-secondary hover:text-fg-primary hover:bg-bg-hover shadow-md transition-colors"
          title="Show symbol list"
          aria-label="Show symbol list"
        >
          <span className="text-xs">›</span>
          <span className="text-[10px] uppercase tracking-widest [writing-mode:vertical-rl]">
            Symbols
          </span>
        </button>
      )}
      <main>
        <StockDetail
          symbol={selected}
          market={market}
          position={position}
          range={range}
          onRangeChange={setRange}
        />
      </main>
    </div>
  );
}

function NoHoldingsEmptyState() {
  const to = useTo();
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="w-12 h-12 rounded-full bg-bg-inset border border-border-subtle flex items-center justify-center mb-4">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="text-fg-muted"
          aria-hidden
        >
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 4 5-6" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-fg-primary">No stocks to show yet</h2>
      <p className="text-sm text-fg-muted mt-1 max-w-sm">
        Connect a brokerage on the Accounts page or import a CSV to see your
        positions here.
      </p>
      <Link
        to={to("accounts")}
        className="btn-primary text-xs mt-5 inline-flex items-center gap-1.5"
      >
        Go to Accounts
      </Link>
    </div>
  );
}
