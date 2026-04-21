import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd, fmtPct, PlText } from "../components/money";
import { Link } from "react-router-dom";
import { useChartTheme, tooltipProps } from "../lib/chartTheme";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";

interface Summary {
  total_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  day_change: number;
  day_change_pct: number;
  connected_count: number;
  holdings_count: number;
  tx_count_30d: number;
  ytd_dividends: number;
}

interface HoldingsResp {
  holdings: Array<{
    ticker_symbol: string;
    name: string;
    quantity: number;
    market_value: number;
    unrealized_pl: number;
    unrealized_pl_pct: number;
    weight_pct: number;
  }>;
  total_value: number;
}

interface TxResp {
  transactions: Array<{
    id: string;
    date: string;
    type: string;
    ticker_symbol: string;
    quantity: number;
    amount: number;
    institution: string;
    institution_color: string;
  }>;
}

interface DivResp {
  by_month: Array<{ month: string; amount: number }>;
  ytd_total: number;
}

export function OverviewPage() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const ct = useChartTheme();

  const summary = useQuery({ queryKey: ["summary"], queryFn: () => f<Summary>("/api/portfolio/summary") });
  const holdings = useQuery({ queryKey: ["holdings"], queryFn: () => f<HoldingsResp>("/api/portfolio/holdings") });
  const tx = useQuery({ queryKey: ["tx", "all"], queryFn: () => f<TxResp>("/api/portfolio/transactions?count=10") });
  const divs = useQuery({ queryKey: ["dividends"], queryFn: () => f<DivResp>("/api/portfolio/dividends") });

  const s = summary.data;
  const empty = s && s.connected_count === 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs text-fg-muted uppercase tracking-wider mb-1">Portfolio value</div>
            <div className="font-num text-4xl font-semibold text-fg-primary">
              {s ? fmtUsd(s.total_value) : "—"}
            </div>
            {s && !empty && (
              <div className="mt-2 flex items-center gap-3">
                <PlText value={s.day_change} pct={s.day_change_pct} size="md" />
                <span className="text-xs text-fg-muted">today</span>
              </div>
            )}
          </div>
          {s && !empty && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Kpi label="Cost basis" value={fmtUsd(s.cost_basis)} />
              <Kpi
                label="Unrealized P/L"
                value={fmtUsd(s.unrealized_pl, { showSign: true })}
                color={s.unrealized_pl >= 0 ? "pos" : "neg"}
                sub={fmtPct(s.unrealized_pl_pct, { showSign: true })}
              />
              <Kpi label="Holdings" value={s.holdings_count.toString()} />
              <Kpi label="YTD dividends" value={fmtUsd(s.ytd_dividends)} color="pos" />
            </div>
          )}
        </div>
      </div>

      {empty && (
        <div className="card p-10 text-center">
          <h2 className="text-fg-primary mb-2">Start your portfolio</h2>
          <p className="text-sm text-fg-secondary max-w-md mx-auto mb-5">
            Use the <span className="text-fg-primary font-medium">+ Connect brokerage</span> button in the sidebar to link your first account.
          </p>
          <p className="text-[10px] text-fg-muted mt-4">
            Your data syncs automatically once connected. Supports Fidelity, Schwab, Robinhood, Vanguard, and 30+ others.
          </p>
        </div>
      )}

      {!empty && (
        <>
          {/* Top holdings + 12mo dividends */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-fg-primary">Top holdings</h3>
                <Link to="/holdings" className="text-xs text-fg-primary hover:underline">
                  See all →
                </Link>
              </div>
              <div className="space-y-2">
                {holdings.data?.holdings.slice(0, 6).map((h) => (
                  <div
                    key={h.ticker_symbol}
                    className="flex items-center gap-3 py-2 border-b border-border-subtle/50 last:border-0"
                  >
                    <div className="w-10 h-10 rounded-lg bg-bg-overlay flex items-center justify-center text-xs font-semibold font-num text-fg-primary">
                      {h.ticker_symbol.slice(0, 4)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-fg-primary font-medium truncate">{h.ticker_symbol}</div>
                      <div className="text-xs text-fg-muted truncate">{h.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-num text-sm text-fg-primary">{fmtUsd(h.market_value)}</div>
                      <div className={`font-num text-xs ${h.unrealized_pl >= 0 ? "pos" : "neg"}`}>
                        {fmtPct(h.unrealized_pl_pct, { showSign: true })}
                      </div>
                    </div>
                    <div className="w-16 text-right">
                      <div className="text-xs text-fg-muted">{h.weight_pct.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-fg-primary">Dividends — 12 mo</h3>
                <Link to="/dividends" className="text-xs text-fg-primary hover:underline">
                  Details →
                </Link>
              </div>
              <div className="font-num text-2xl text-fg-primary">
                {divs.data ? fmtUsd(divs.data.ytd_total) : "—"}
              </div>
              <div className="text-xs text-fg-muted mb-4">year to date</div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={divs.data?.by_month ?? []}>
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 9, fill: ct.tick }}
                      tickFormatter={(v) => v.slice(5)}
                      stroke={ct.grid}
                    />
                    <YAxis hide />
                    <Tooltip
                      {...tooltipProps(ct)}
                      formatter={(v: number) => fmtUsd(v)}
                    />
                    <Bar dataKey="amount" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent transactions + Portfolio sparkline */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-fg-primary">Recent activity</h3>
                <Link to="/transactions" className="text-xs text-fg-primary hover:underline">
                  See all →
                </Link>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Security</th>
                    <th>Brokerage</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.data?.transactions.slice(0, 7).map((t) => (
                    <tr key={t.id}>
                      <td className="text-xs text-fg-secondary font-num">{t.date}</td>
                      <td>
                        <TxBadge type={t.type} />
                      </td>
                      <td className="font-num text-fg-primary text-sm">{t.ticker_symbol}</td>
                      <td>
                        <InstPill name={t.institution} color={t.institution_color} />
                      </td>
                      <td className="text-right font-num">
                        {t.type === "dividend" ? (
                          <span className="pos">+{fmtUsd(t.amount)}</span>
                        ) : t.type === "sell" ? (
                          <span className="pos">+{fmtUsd(t.amount)}</span>
                        ) : (
                          <span className="text-fg-secondary">{fmtUsd(t.amount)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-fg-primary mb-4">Portfolio</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={syntheticSparkline(s?.total_value ?? 0)}>
                    <defs>
                      <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      {...tooltipProps(ct)}
                      formatter={(v: number) => fmtUsd(v)}
                      labelFormatter={() => ""}
                    />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#pg)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-fg-muted mt-2 text-center">
                Illustrative 30-day trajectory
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "pos" | "neg";
}) {
  return (
    <div>
      <div className="text-[10px] text-fg-muted uppercase tracking-wider">{label}</div>
      <div className={`font-num text-lg ${color === "pos" ? "pos" : color === "neg" ? "neg" : "text-fg-primary"}`}>
        {value}
      </div>
      {sub && <div className={`font-num text-xs ${color === "pos" ? "pos" : color === "neg" ? "neg" : "text-fg-secondary"}`}>{sub}</div>}
    </div>
  );
}

function TxBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    buy: "badge-blue",
    sell: "badge-amber",
    dividend: "badge-green",
    interest: "badge-green",
    transfer: "badge-gray",
    fee: "badge-red",
  };
  return <span className={map[type] ?? "badge-gray"}>{type.toUpperCase()}</span>;
}

function InstPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-secondary">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

function syntheticSparkline(endValue: number) {
  // Deterministic random walk ending at endValue
  const points = 30;
  const data: { v: number }[] = [];
  let v = endValue * 0.93;
  for (let i = 0; i < points; i++) {
    const r = (Math.sin(i * 0.7 + endValue % 7) + Math.cos(i * 1.3)) / 2;
    v = v * (1 + r * 0.008 + (endValue - v) * 0.02 / endValue);
    data.push({ v: +v.toFixed(2) });
  }
  data[data.length - 1] = { v: endValue };
  return data;
}
