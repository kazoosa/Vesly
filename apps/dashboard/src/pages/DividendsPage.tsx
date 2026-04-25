import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "../components/money";
import { useChartTheme, tooltipProps } from "../lib/chartTheme";
import { useTo } from "../lib/basePath";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DividendsResp {
  by_month: Array<{ month: string; amount: number }>;
  by_ticker: Array<{ ticker_symbol: string; name: string; total: number; payments: number }>;
  ytd_total: number;
  lifetime_total: number;
}

export function DividendsPage() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const ct = useChartTheme();
  const to = useTo();
  const q = useQuery({
    queryKey: ["dividends"],
    queryFn: () => f<DividendsResp>("/api/portfolio/dividends"),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-fg-primary">Dividends</h1>
        <div className="card p-10 text-center text-sm text-fg-muted">
          Loading…
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-fg-primary">Dividends</h1>
        <div className="card p-10 text-center">
          <h2 className="text-rose-400 mb-2">Couldn't load dividends</h2>
          <p className="text-sm text-fg-muted max-w-md mx-auto">
            {(q.error as Error)?.message ?? "The dividends endpoint returned an error."}
          </p>
          <button
            type="button"
            className="btn-ghost text-xs mt-3"
            onClick={() => q.refetch()}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!q.data || (q.data.lifetime_total === 0 && q.data.by_ticker.length === 0)) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-fg-primary">Dividends</h1>
        <div className="card p-10 text-center">
          <h2 className="text-fg-primary mb-2">No dividend income yet</h2>
          <p className="text-sm text-fg-secondary max-w-md mx-auto mb-2">
            Dividends are pulled from your broker's <strong>activity</strong> CSV (the
            file with buys, sells, dividends, and fees) — not from a positions snapshot.
          </p>
          <p className="text-sm text-fg-secondary max-w-md mx-auto mb-5">
            If you've only uploaded positions, your holdings show up but your dividend
            history won't. Connect a brokerage via auto-sync, or import an activity CSV.
          </p>
          <Link to={to("accounts")} className="btn-primary text-xs inline-flex">
            Import an activity CSV
          </Link>
        </div>
      </div>
    );
  }

  const avgMonth = q.data.by_month.reduce((s, m) => s + m.amount, 0) / 12;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-fg-primary">Dividends</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="YTD income" value={fmtUsd(q.data.ytd_total)} color="pos" />
        <Stat label="Lifetime income" value={fmtUsd(q.data.lifetime_total)} color="pos" />
        <Stat label="Avg monthly (12mo)" value={fmtUsd(avgMonth)} />
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-fg-primary mb-4">Monthly income — last 12 months</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={q.data.by_month} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
              <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: ct.tick }}
                tickFormatter={(v: string) => {
                  const [y, m] = v.split("-");
                  return `${m}/${y!.slice(-2)}`;
                }}
                stroke={ct.grid}
              />
              <YAxis
                tick={{ fontSize: 10, fill: ct.tick }}
                stroke={ct.grid}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                {...tooltipProps(ct)}
                formatter={(v: number) => fmtUsd(v)}
              />
              <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-fg-primary mb-4">Top dividend payers</h3>
        <div className="space-y-2">
          {q.data.by_ticker.slice(0, 15).map((t) => {
            const pct = (t.total / q.data.by_ticker[0]!.total) * 100;
            return (
              <Link
                key={t.ticker_symbol}
                to={`${to("stocks")}?symbol=${encodeURIComponent(t.ticker_symbol)}`}
                title={`Open ${t.ticker_symbol} details`}
                className="flex items-center gap-3 py-2 border-b border-border-subtle/50 last:border-0 -mx-2 px-2 rounded-md hover:bg-bg-hover/60 transition-colors"
              >
                <div className="w-14 font-num text-sm text-fg-primary">{t.ticker_symbol}</div>
                <div className="flex-1 text-xs text-fg-secondary truncate">{t.name}</div>
                <div className="text-xs text-fg-muted w-20 text-right">
                  {t.payments} pmts
                </div>
                <div className="flex-1 max-w-[240px] h-2 bg-bg-overlay rounded-full overflow-hidden">
                  <div
                    className="h-full bg-fg-primary"
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
                <div className="w-24 text-right font-num text-sm text-fg-primary">
                  {fmtUsd(t.total)}
                </div>
              </Link>
            );
          })}
          {q.data.by_ticker.length === 0 && (
            <div className="text-center text-fg-muted py-6 text-sm">
              No dividends yet. Connect a brokerage with dividend-paying holdings.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: "pos" }) {
  return (
    <div className="card p-5">
      <div className="text-[10px] text-fg-muted uppercase tracking-wider">{label}</div>
      <div className={`font-num text-2xl mt-1 ${color === "pos" ? "pos" : "text-fg-primary"}`}>
        {value}
      </div>
    </div>
  );
}
