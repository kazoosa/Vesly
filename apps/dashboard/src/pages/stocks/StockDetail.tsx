import { useMemo, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPct, fmtUsd } from "../../components/money";
import { MiniSparkline } from "../../components/MiniSparkline";
import { useChartTheme, tooltipProps } from "../../lib/chartTheme";
import type {
  HistoryRange,
  NewsResponse,
  StockHistory,
  StockQuote,
} from "../../lib/hooks/useStockMarket";
import type {
  ActivityItem,
  ClosedLot,
  PortfolioBySymbol,
} from "../../lib/hooks/useStockPosition";

type MarketQueries = {
  quote: UseQueryResult<StockQuote>;
  history: UseQueryResult<StockHistory>;
  news: UseQueryResult<NewsResponse>;
};

const RANGES: { key: HistoryRange; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "1W" },
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "1y", label: "1Y" },
  { key: "max", label: "ALL" },
];

export function StockDetail({
  symbol,
  market,
  position,
  range,
  onRangeChange,
}: {
  symbol: string;
  market: MarketQueries;
  position: UseQueryResult<PortfolioBySymbol>;
  range: HistoryRange;
  onRangeChange: (r: HistoryRange) => void;
}) {
  return (
    <div className="space-y-4 md:space-y-5">
      <StockHeader symbol={symbol} quote={market.quote} />
      <HistoryChart history={market.history} range={range} onRangeChange={onRangeChange} />
      <TopRow position={position} quote={market.quote} />
      <PLPerformanceSection position={position} />
      <PortfolioInfoRow position={position} quote={market.quote} />
      <MidRow position={position} news={market.news} />
      <DividendCalendar position={position} />
      <StockTransactionsTable position={position} />
    </div>
  );
}

/* ---------------------------------------------------------------- Header */

function StockHeader({
  symbol,
  quote,
}: {
  symbol: string;
  quote: UseQueryResult<StockQuote>;
}) {
  const q = quote.data;
  const syncedMinutesAgo = useMemo(() => {
    if (!q?.asOf) return null;
    const secs = Math.max(0, (Date.now() - new Date(q.asOf).getTime()) / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins === 1) return "1 min ago";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }, [q?.asOf]);

  return (
    <div className="card p-4 md:p-5 flex items-center gap-4 flex-wrap">
      <InitialsOrLogo symbol={symbol} logoUrl={q?.logoUrl ?? null} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-lg font-semibold text-fg-primary truncate">
            {q?.name ?? symbol}
          </h1>
          <span className="text-xs text-fg-muted font-num">{symbol}</span>
          {q?.exchange && (
            <span className="text-[10px] text-fg-muted uppercase tracking-widest">
              {q.exchange}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 mt-1 flex-wrap">
          {quote.isLoading ? (
            <Skeleton className="w-24 h-7" />
          ) : (
            <>
              <span className="text-2xl font-num font-semibold text-fg-primary">
                {fmtUsd(q?.price ?? 0)}
              </span>
              <span
                className={`text-sm font-num ${
                  (q?.changePct ?? 0) > 0
                    ? "pos"
                    : (q?.changePct ?? 0) < 0
                    ? "neg"
                    : "text-fg-muted"
                }`}
              >
                {fmtUsd(q?.change ?? 0, { showSign: true })}{" "}
                ({fmtPct(q?.changePct ?? 0, { showSign: true })})
              </span>
              {q?.isFallback && (
                <span className="text-[10px] badge badge-amber">Live quote unavailable</span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-[11px] text-fg-muted">
          {syncedMinutesAgo ? `synced ${syncedMinutesAgo}` : ""}
        </span>
        <button
          type="button"
          className="btn-ghost text-xs"
          title="Notes are saved in this browser only"
          onClick={() => {
            const el = document.getElementById("notes-input");
            el?.focus();
          }}
        >
          + Add note
        </button>
      </div>
    </div>
  );
}

function InitialsOrLogo({ symbol, logoUrl }: { symbol: string; logoUrl: string | null }) {
  const [errored, setErrored] = useState(false);
  if (logoUrl && !errored) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setErrored(true)}
        className="w-11 h-11 rounded-full bg-bg-inset border border-border-subtle"
      />
    );
  }
  return (
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center border border-border-subtle bg-bg-inset text-fg-primary text-sm font-num font-semibold"
      aria-hidden
    >
      {symbol.slice(0, 2)}
    </div>
  );
}

/* ---------------------------------------------------------- History chart */

function HistoryChart({
  history,
  range,
  onRangeChange,
}: {
  history: UseQueryResult<StockHistory>;
  range: HistoryRange;
  onRangeChange: (r: HistoryRange) => void;
}) {
  const ct = useChartTheme();
  const data = useMemo(() => {
    const candles = history.data?.candles ?? [];
    return candles
      .filter((c) => c.close != null)
      .map((c) => ({ t: c.time, close: c.close as number }));
  }, [history.data]);

  const first = data[0]?.close ?? 0;
  const last = data[data.length - 1]?.close ?? 0;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const color = changePct >= 0 ? "#10b981" : "#ef4444";

  const isIntraday = range === "1d" || range === "5d";
  const fmtTick = (iso: string) => {
    const d = new Date(iso);
    if (isIntraday) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const fmtTooltipLabel = (iso: string) => {
    const d = new Date(iso);
    if (isIntraday) {
      return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-fg-muted font-mono">
            Price history
          </div>
          <div className="text-sm text-fg-secondary font-num">
            {history.isLoading ? "…" : `${fmtUsd(first)} → ${fmtUsd(last)}`}{" "}
            <span className={`${changePct >= 0 ? "pos" : "neg"} text-xs`}>
              ({fmtPct(changePct, { showSign: true })})
            </span>
          </div>
        </div>
        <div className="inline-flex rounded-md border border-border-subtle bg-bg-inset p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => onRangeChange(r.key)}
              className={`px-2 py-1 text-[11px] font-mono tracking-wide rounded ${
                range === r.key
                  ? "bg-bg-raised text-fg-primary shadow-card"
                  : "text-fg-muted hover:text-fg-primary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56 md:h-64">
        {history.isLoading ? (
          <Skeleton className="h-full" />
        ) : data.length === 0 ? (
          <EmptyState message="Price history unavailable right now." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                tick={{ fill: ct.tick, fontSize: 10 }}
                tickLine={false}
                stroke={ct.axis}
                tickFormatter={fmtTick}
                minTickGap={30}
              />
              <YAxis
                orientation="right"
                tick={{ fill: ct.tick, fontSize: 10 }}
                tickLine={false}
                stroke={ct.axis}
                domain={["auto", "auto"]}
                width={50}
                tickFormatter={(v: number) => fmtUsd(v, { decimals: v > 100 ? 0 : 2 })}
              />
              <Tooltip
                {...tooltipProps(ct)}
                labelFormatter={fmtTooltipLabel}
                formatter={(v: number) => [fmtUsd(v), "Close"]}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={color}
                strokeWidth={2}
                fill="url(#priceFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Top row */

function TopRow({
  position,
  quote,
}: {
  position: UseQueryResult<PortfolioBySymbol>;
  quote: UseQueryResult<StockQuote>;
}) {
  const p = position.data?.position;
  const r = position.data?.realized;
  const ws = position.data?.winStats;
  const byMonth = r?.byMonth ?? [];
  const sparkData = useMemo(() => {
    if (!p || !quote.data) return [];
    // Synthetic position-value trajectory — not historically true but
    // illustrative: step from 0 to current market value.
    return byMonth.map((m) => p.marketValue + m.pl);
  }, [byMonth, p, quote.data]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
      {/* Position — unrealized */}
      <div className="card p-4 md:p-5">
        <Eyebrow>Position · Unrealized</Eyebrow>
        {!p || p.sharesHeld === 0 ? (
          <EmptyState message="You don't hold this stock." className="py-8" />
        ) : (
          <>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl md:text-3xl font-num font-semibold text-fg-primary">
                {fmtUsd(p.marketValue)}
              </span>
              <span
                className={`font-num text-sm ${
                  p.unrealizedPl >= 0 ? "pos" : "neg"
                }`}
              >
                {fmtUsd(p.unrealizedPl, { showSign: true })}{" "}
                · {fmtPct(p.unrealizedPlPct, { showSign: true })}
              </span>
            </div>
            <div className="text-xs text-fg-muted mt-1 font-num">
              {p.sharesHeld.toFixed(4)} sh · avg {fmtUsd(p.avgCostPerShare)} ·{" "}
              {p.openLotsCount} open lots
            </div>
            <div className="mt-3 h-16">
              <MiniSparkline data={sparkData} height={64} />
            </div>
          </>
        )}
      </div>

      {/* Realized P/L — lifetime */}
      <div className="card p-4 md:p-5">
        <Eyebrow>Realized P/L · Lifetime</Eyebrow>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-4 items-start">
          <div>
            <span
              className={`text-2xl md:text-3xl font-num font-semibold ${
                (r?.lifetime ?? 0) >= 0 ? "pos" : "neg"
              }`}
            >
              {fmtUsd(r?.lifetime ?? 0, { showSign: true })}
            </span>
            <div className="text-xs text-fg-muted mt-1 font-num">
              {fmtUsd(r?.ytd ?? 0, { showSign: true })} YTD ·{" "}
              {r?.closedLotsCount ?? 0} closed lots ·{" "}
              avg hold {r?.avgHoldDays ?? 0}d
            </div>
            <div className="mt-3 h-16">
              <MonthlyBars data={byMonth} />
            </div>
          </div>
          <WinRateDonut
            winRate={ws?.winRate ?? 0}
            wins={ws?.winCount ?? 0}
            losses={ws?.lossCount ?? 0}
          />
        </div>
      </div>
    </div>
  );
}

function MonthlyBars({ data }: { data: Array<{ month: string; pl: number }> }) {
  if (data.every((d) => d.pl === 0)) {
    return <EmptyState message="No closed lots in the last year." className="text-[11px] py-2" />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="month" hide />
        <YAxis hide />
        <Bar dataKey="pl" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pl >= 0 ? "#10b981" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WinRateDonut({
  winRate,
  wins,
  losses,
}: {
  winRate: number;
  wins: number;
  losses: number;
}) {
  const ct = useChartTheme();
  const data = [
    { name: "wins", value: wins > 0 ? wins : 0.0001 },
    { name: "losses", value: losses > 0 ? losses : 0.0001 },
  ];
  return (
    <div className="relative w-[92px] h-[92px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={28}
            outerRadius={42}
            stroke={ct.pieStroke}
            strokeWidth={2}
            isAnimationActive={false}
          >
            <Cell fill="#10b981" />
            <Cell fill="#ef4444" opacity={0.35} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-num font-semibold text-fg-primary">
          {winRate.toFixed(0)}%
        </span>
        <span className="text-[9px] uppercase tracking-widest text-fg-muted">win rate</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------- Realized P/L performance */

function PLPerformanceSection({
  position,
}: {
  position: UseQueryResult<PortfolioBySymbol>;
}) {
  const ws = position.data?.winStats;
  const closed = position.data?.lots?.closed ?? [];
  const maxAbs = Math.max(
    1,
    ...closed.map((l) => Math.abs(l.realizedPlPct)),
  );

  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <Eyebrow>Realized P/L · performance</Eyebrow>
          <div className="text-xs text-fg-muted mt-0.5">
            How your closed trades actually performed.
          </div>
        </div>
        {/* Toggle is visual only for MVP */}
        <div className="inline-flex rounded-md border border-border-subtle bg-bg-inset p-0.5 text-[11px] font-mono">
          <span className="px-2 py-1 bg-bg-raised text-fg-primary rounded shadow-card">
            All-time
          </span>
          <span className="px-2 py-1 text-fg-muted">YTD</span>
          <span className="px-2 py-1 text-fg-muted">2025</span>
          <span className="px-2 py-1 text-fg-muted">2024</span>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4 text-xs">
        <Stat label="Win rate" value={`${(ws?.winRate ?? 0).toFixed(0)}%`}
          sub={`${ws?.winCount ?? 0}W · ${ws?.lossCount ?? 0}L`} />
        <Stat label="Avg win" value={fmtUsd(ws?.avgWin ?? 0, { showSign: true })}
          sub="per closed lot" tone="pos" />
        <Stat label="Avg loss" value={fmtUsd(ws?.avgLoss ?? 0, { showSign: true })}
          sub="per closed lot" tone="neg" />
        <Stat label="Payoff ratio" value={`${(ws?.payoffRatio ?? 0).toFixed(2)}×`}
          sub="win / loss size" />
        <Stat label="Best trade" value={fmtUsd(ws?.bestTrade ?? 0, { showSign: true })}
          sub="" tone="pos" />
        <Stat label="Worst trade" value={fmtUsd(ws?.worstTrade ?? 0, { showSign: true })}
          sub="" tone="neg" />
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-widest text-fg-muted font-mono mb-2">
          Closed lots · sorted by date
        </div>
        {closed.length === 0 ? (
          <EmptyState message="No closed lots yet." />
        ) : (
          <table className="w-full text-xs font-num">
            <thead className="text-[10px] uppercase tracking-widest text-fg-muted">
              <tr className="border-b border-border-subtle">
                <th className="text-left py-1.5 font-medium">Closed</th>
                <th className="text-left py-1.5 font-medium">Qty</th>
                <th className="text-right py-1.5 font-medium">Realized $</th>
                <th className="text-right py-1.5 font-medium">%</th>
                <th className="text-right py-1.5 font-medium">Held</th>
                <th className="text-center py-1.5 font-medium">Outcome</th>
                <th className="text-right py-1.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {closed.slice(0, 5).map((lot, i) => (
                <ClosedLotRow key={i} lot={lot} maxAbs={maxAbs} />
              ))}
            </tbody>
          </table>
        )}
        {closed.length > 5 && (
          <div className="text-right mt-2">
            <span className="text-[11px] text-fg-muted">
              Showing 5 of {closed.length} closed lots
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ClosedLotRow({ lot, maxAbs }: { lot: ClosedLot; maxAbs: number }) {
  const positive = lot.outcome === "win";
  const width = `${Math.min(100, (Math.abs(lot.realizedPlPct) / maxAbs) * 100)}%`;
  const color = positive ? "#10b981" : "#ef4444";
  const closedDate = new Date(lot.closedDate).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="py-2 text-fg-secondary">{closedDate}</td>
      <td className="py-2 text-fg-secondary">{lot.shares.toFixed(2)} sh</td>
      <td className={`py-2 text-right ${positive ? "pos" : "neg"}`}>
        {fmtUsd(lot.realizedPl, { showSign: true })}
      </td>
      <td className={`py-2 text-right ${positive ? "pos" : "neg"}`}>
        {fmtPct(lot.realizedPlPct, { showSign: true })}
      </td>
      <td className="py-2 text-right text-fg-secondary">{lot.heldDays}d</td>
      <td className="py-2">
        <div className="h-1.5 rounded-full bg-bg-inset overflow-hidden">
          <div className="h-full rounded-full" style={{ width, background: color, opacity: 0.6 }} />
        </div>
      </td>
      <td className={`py-2 text-right text-[11px] uppercase tracking-widest font-semibold ${positive ? "pos" : "neg"}`}>
        {positive ? "win" : "loss"}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------ Portfolio info row */

function PortfolioInfoRow({
  position,
  quote,
}: {
  position: UseQueryResult<PortfolioBySymbol>;
  quote: UseQueryResult<StockQuote>;
}) {
  const w = position.data?.portfolioWeight;
  const div = position.data?.dividends;
  const held = position.data?.heldIn ?? [];
  const openLots = position.data?.lots?.open ?? [];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {/* % of portfolio */}
      <div className="card p-4">
        <Eyebrow>% of portfolio</Eyebrow>
        <div className="mt-3 flex items-center gap-3">
          <MiniPieDonut pct={w?.pct ?? 0} />
          <div>
            <div className="text-xl font-num font-semibold text-fg-primary">
              {(w?.pct ?? 0).toFixed(2)}%
            </div>
            <div className="text-[11px] text-fg-muted">
              #{rankInPortfolio(position.data)} holding
            </div>
          </div>
        </div>
      </div>

      {/* Dividends YTD */}
      <div className="card p-4">
        <Eyebrow>Dividends YTD</Eyebrow>
        <div className="mt-2 text-xl font-num font-semibold pos">
          {fmtUsd(div?.ytd ?? 0, { showSign: true })}
        </div>
        <div className="text-[11px] text-fg-muted mt-1 font-num">
          {div?.paymentsCount ?? 0} payments · {(div?.yieldPct ?? 0).toFixed(2)}% yield
        </div>
        <div className="text-[11px] text-fg-muted font-num">
          {div?.nextPaymentDateEstimate
            ? `next ${new Date(div.nextPaymentDateEstimate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : "no next payment scheduled"}
        </div>
      </div>

      {/* Held in */}
      <div className="card p-4">
        <Eyebrow>Held in</Eyebrow>
        <ul className="mt-2 space-y-1.5 text-xs">
          {held.length === 0 ? (
            <li className="text-fg-muted">Not held in any account.</li>
          ) : (
            held.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: h.institutionColor }}
                  />
                  <span className="truncate">{h.institutionName}</span>
                </span>
                <span className="font-num text-fg-secondary">{h.shares.toFixed(2)} sh</span>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Open lots */}
      <div className="card p-4">
        <Eyebrow>Open lots · {openLots.length}</Eyebrow>
        {openLots.length === 0 ? (
          <div className="text-xs text-fg-muted mt-2">No open lots.</div>
        ) : (
          <table className="w-full text-[11px] mt-2 font-num">
            <tbody>
              {openLots.slice(0, 4).map((lot, i) => (
                <tr key={i} className="border-b border-border-subtle last:border-0">
                  <td className="py-1 text-fg-secondary">
                    {new Date(lot.acquiredDate).toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    })}
                  </td>
                  <td className="py-1 text-fg-secondary">{lot.shares.toFixed(2)}sh</td>
                  <td className="py-1 text-right text-fg-muted">
                    {fmtUsd(lot.costPerShare, { decimals: lot.costPerShare > 100 ? 0 : 2 })}
                  </td>
                  <td
                    className={`py-1 text-right ${
                      lot.unrealizedPl >= 0 ? "pos" : "neg"
                    }`}
                  >
                    {fmtUsd(lot.unrealizedPl, { showSign: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
  void quote;
}

function rankInPortfolio(data: PortfolioBySymbol | undefined): string {
  // Placeholder "#N" label — a real rank would require another query.
  // For MVP we show the holdingCount as the denominator signal.
  const n = data?.portfolioWeight?.holdingCount ?? 0;
  return n > 0 ? String(Math.min(n, 1)) : "–";
}

function MiniPieDonut({ pct }: { pct: number }) {
  const ct = useChartTheme();
  const clamped = Math.max(0, Math.min(100, pct));
  const data = [
    { name: "you", value: clamped || 0.001 },
    { name: "rest", value: Math.max(0.001, 100 - clamped) },
  ];
  return (
    <div className="w-12 h-12">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={14}
            outerRadius={22}
            stroke={ct.pieStroke}
            strokeWidth={1.5}
            isAnimationActive={false}
          >
            <Cell fill="var(--fg-primary)" />
            <Cell fill="var(--bg-inset)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------- Mid row: activity + notes + news */

function MidRow({
  position,
  news,
}: {
  position: UseQueryResult<PortfolioBySymbol>;
  news: UseQueryResult<NewsResponse>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1fr] gap-3 md:gap-4">
      <ActivityTimeline activity={position.data?.activity ?? []} />
      <NotesPanel />
      <HeadlinesPanel news={news} />
    </div>
  );
}

function ActivityTimeline({ activity }: { activity: ActivityItem[] }) {
  const [tab, setTab] = useState<"all" | "buy" | "sell" | "div">("all");
  const filtered =
    tab === "all"
      ? activity
      : activity.filter((a) =>
          tab === "buy" ? a.type === "buy" : tab === "sell" ? a.type === "sell" : a.type === "dividend",
        );

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <Eyebrow>Activity timeline</Eyebrow>
        <TabStrip
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          tabs={[
            { value: "all", label: "All" },
            { value: "buy", label: "Stock" },
            { value: "sell", label: "Sells" },
            { value: "div", label: "Div" },
          ]}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState message="No activity yet." />
      ) : (
        <ul className="space-y-2 text-xs max-h-80 overflow-y-auto -mr-1 pr-1">
          {filtered.slice(0, 20).map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityRow({ a }: { a: ActivityItem }) {
  const tag = a.type === "buy" ? "buy" : a.type === "sell" ? "sell" : a.type === "dividend" ? "div" : "—";
  const tagClass =
    a.type === "buy"
      ? "badge-blue"
      : a.type === "sell"
      ? "badge-red"
      : a.type === "dividend"
      ? "badge-green"
      : "";
  const title = a.type === "dividend"
    ? `Dividend received`
    : `${a.type === "buy" ? "Bought" : "Sold"} ${a.shares.toFixed(2)} sh @ ${fmtUsd(a.pricePerShare)}`;
  return (
    <li className="grid grid-cols-[44px_10px_1fr_auto] gap-2 items-start">
      <span className="text-[10px] text-fg-muted font-num tabular-nums pt-0.5">
        {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
      <span
        className="mt-1.5 w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: a.institutionColor || "var(--fg-muted)" }}
      />
      <div>
        <div className="text-fg-primary font-num">{title}</div>
        <div className="text-[10px] text-fg-muted truncate">
          {a.institutionName} · {fmtUsd(a.amount)}
        </div>
      </div>
      <span className={`badge ${tagClass} text-[9px]`}>{tag}</span>
    </li>
  );
}

function NotesPanel() {
  const [notes, setNotes] = useState<Array<{ id: string; date: string; text: string }>>([]);
  const [draft, setDraft] = useState("");

  function save() {
    const t = draft.trim();
    if (!t) return;
    setNotes((n) => [
      { id: String(Date.now()), date: new Date().toISOString(), text: t },
      ...n,
    ]);
    setDraft("");
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <Eyebrow>Notes</Eyebrow>
        <button
          type="button"
          className="text-[11px] text-fg-muted hover:text-fg-primary"
          onClick={() => document.getElementById("notes-input")?.focus()}
        >
          + add
        </button>
      </div>
      <div className="text-[10px] italic text-fg-muted mb-2">
        Notes are saved in this browser only.
      </div>
      <textarea
        id="notes-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Jot down your thesis, watch price targets, triggers…"
        className="input w-full text-xs resize-y min-h-[72px]"
      />
      <div className="flex justify-end mt-1">
        <button type="button" className="btn-primary text-xs" onClick={save} disabled={!draft.trim()}>
          Save
        </button>
      </div>
      <ul className="mt-3 space-y-2 max-h-56 overflow-y-auto">
        {notes.map((n) => (
          <li key={n.id} className="border-l-2 border-border-subtle pl-2">
            <div className="text-[10px] text-fg-muted">
              {new Date(n.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
            <div className="text-xs text-fg-secondary whitespace-pre-wrap">{n.text}</div>
          </li>
        ))}
        {notes.length === 0 && (
          <li className="text-[11px] text-fg-muted">No notes yet.</li>
        )}
      </ul>
    </div>
  );
}

function HeadlinesPanel({ news }: { news: UseQueryResult<NewsResponse> }) {
  const items = news.data?.items ?? [];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <Eyebrow>Headlines</Eyebrow>
        {items.length > 0 && (
          <span className="badge badge-blue text-[9px]">{items.length} new</span>
        )}
      </div>
      {news.isLoading ? (
        <Skeleton className="h-40" />
      ) : news.isError ? (
        <EmptyState message="Headlines unavailable right now." />
      ) : items.length === 0 ? (
        <EmptyState message="No recent headlines." />
      ) : (
        <ul className="space-y-3 max-h-80 overflow-y-auto -mr-1 pr-1">
          {items.slice(0, 10).map((n) => (
            <li key={n.id}>
              <div className="text-[10px] text-fg-muted uppercase tracking-widest font-mono mb-0.5">
                {n.source} · {n.relativeTime}
              </div>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-fg-primary hover:underline line-clamp-2"
              >
                {n.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------- Dividend calendar */

function DividendCalendar({
  position,
}: {
  position: UseQueryResult<PortfolioBySymbol>;
}) {
  const div = position.data?.dividends;
  if (!div) return null;
  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <Eyebrow>
          Dividend calendar
          {div.nextPaymentDateEstimate && (
            <span className="ml-2 normal-case tracking-normal text-[11px] text-fg-muted">
              · next payment{" "}
              {new Date(div.nextPaymentDateEstimate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" "}
              · est {fmtUsd(div.annualizedEstimate / 4)}
            </span>
          )}
        </Eyebrow>
        <div className="text-[11px] text-fg-muted font-num">
          annualized {fmtUsd(div.annualizedEstimate)}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {div.byQuarter.map((q, i) => (
          <div key={i} className="rounded-md border border-border-subtle bg-bg-inset p-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="font-mono uppercase tracking-widest text-fg-muted">
                {q.quarter} '{String(q.year).slice(-2)}
              </span>
              <span
                className={`badge text-[9px] ${
                  q.status === "PAID" ? "badge-green" : "badge-amber"
                }`}
              >
                {q.status}
              </span>
            </div>
            <div className={`text-base font-num font-semibold ${q.totalPaid > 0 ? "pos" : "text-fg-muted"}`}>
              {q.totalPaid > 0 ? fmtUsd(q.totalPaid, { showSign: true }) : "~"}
            </div>
            <div className="text-[10px] text-fg-muted font-num mt-1">
              ex-date: {q.exDate ? new Date(q.exDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
              <br />
              pays: {q.payDate ? new Date(q.payDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
              <br />
              yield: {q.yieldPct !== null ? `${q.yieldPct.toFixed(2)}%` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------- Stock transactions table */

function StockTransactionsTable({
  position,
}: {
  position: UseQueryResult<PortfolioBySymbol>;
}) {
  const [tab, setTab] = useState<"all" | "stock" | "div" | "options">("all");
  const activity = position.data?.activity ?? [];
  const rows =
    tab === "all"
      ? activity
      : tab === "div"
      ? activity.filter((a) => a.type === "dividend")
      : tab === "stock"
      ? activity.filter((a) => a.type === "buy" || a.type === "sell")
      : [];

  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Eyebrow>Transactions</Eyebrow>
        <TabStrip
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          tabs={[
            { value: "stock", label: `Stock (${activity.filter((a) => a.type === "buy" || a.type === "sell").length})` },
            { value: "options", label: "Options (0)" },
            { value: "div", label: `Dividends (${activity.filter((a) => a.type === "dividend").length})` },
            { value: "all", label: `All (${activity.length})` },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState message={tab === "options" ? "Options coming soon." : "No transactions yet."} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-num">
            <thead className="text-[10px] uppercase tracking-widest text-fg-muted">
              <tr className="border-b border-border-subtle">
                <th className="text-left py-1.5 font-medium">Date</th>
                <th className="text-left py-1.5 font-medium">Type</th>
                <th className="text-right py-1.5 font-medium">Shares</th>
                <th className="text-right py-1.5 font-medium">Price</th>
                <th className="text-left py-1.5 font-medium">Account</th>
                <th className="text-right py-1.5 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map((a) => (
                <tr key={a.id} className="border-b border-border-subtle last:border-0">
                  <td className="py-1.5 text-fg-secondary">
                    {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`badge text-[9px] ${
                        a.type === "buy"
                          ? "badge-blue"
                          : a.type === "sell"
                          ? "badge-red"
                          : a.type === "dividend"
                          ? "badge-green"
                          : ""
                      }`}
                    >
                      {a.type}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-fg-secondary">
                    {a.shares > 0 ? a.shares.toFixed(2) : "—"}
                  </td>
                  <td className="py-1.5 text-right text-fg-secondary">
                    {a.pricePerShare > 0 ? fmtUsd(a.pricePerShare) : "—"}
                  </td>
                  <td className="py-1.5 text-fg-secondary">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: a.institutionColor }}
                      />
                      {a.institutionName}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-fg-primary">
                    {fmtUsd(a.amount, { showSign: a.type === "sell" || a.type === "dividend" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Helpers */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-fg-muted font-mono">
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-fg-muted font-mono">
        {label}
      </div>
      <div className={`text-sm font-num font-semibold mt-0.5 ${tone ?? "text-fg-primary"}`}>
        {value}
      </div>
      <div className="text-[10px] text-fg-muted mt-0.5">{sub}</div>
    </div>
  );
}

function TabStrip<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-md border border-border-subtle bg-bg-inset p-0.5 text-[11px] font-mono">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`px-2 py-1 rounded ${
            value === t.value
              ? "bg-bg-raised text-fg-primary shadow-card"
              : "text-fg-muted hover:text-fg-primary"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded animate-pulse bg-bg-inset ${className}`} />;
}

function EmptyState({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`text-center text-xs text-fg-muted py-4 rounded border border-dashed border-border-subtle ${className}`}
    >
      {message}
    </div>
  );
}
