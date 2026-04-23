import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
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
export function StocksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<HistoryRange>("1mo");

  // Held tickers from existing portfolio endpoint — dedupe against
  // the static watchlist and order by value first so the user's own
  // holdings are what they see before the curated set.
  const { accessToken } = useAuth();
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
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const s of [...held, ...STOCK_WATCHLIST.map((s) => s.toUpperCase())]) {
      if (!seen.has(s)) {
        ordered.push(s);
        seen.add(s);
      }
    }
    return ordered;
  }, [holdings.data]);

  const selected = (searchParams.get("symbol") ?? symbolList[0] ?? "AAPL").toUpperCase();

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 md:gap-6 -m-4 md:-m-6 p-4 md:p-6 min-h-full">
      <aside className="md:sticky md:top-0 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
        <StockList
          symbols={symbolList}
          selected={selected}
          onSelect={selectSymbol}
        />
      </aside>
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
