import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "../components/money";
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
  const q = useQuery({
    queryKey: ["dividends"],
    queryFn: () => f<DividendsResp>("/api/portfolio/dividends"),
  });

  if (!q.data) return null;

  const maxMonth = Math.max(...q.data.by_month.map((m) => m.amount), 1);
  const avgMonth = q.data.by_month.reduce((s, m) => s + m.amount, 0) / 12;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">Dividends</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="YTD income" value={fmtUsd(q.data.ytd_total)} color="pos" />
        <Stat label="Lifetime income" value={fmtUsd(q.data.lifetime_total)} color="pos" />
        <Stat label="Avg monthly (12mo)" value={fmtUsd(avgMonth)} />
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Monthly income — last 12 months</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={q.data.by_month} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickFormatter={(v: string) => {
                  const [y, m] = v.split("-");
                  return `${m}/${y!.slice(-2)}`;
                }}
                stroke="#1e293b"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                stroke="#1e293b"
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "1px solid #1e293b",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#e2e8f0",
                }}
                itemStyle={{ color: "#e2e8f0" }}
                labelStyle={{ color: "#94a3b8" }}
                cursor={{ fill: "#1f2937" }}
                formatter={(v: number) => fmtUsd(v)}
              />
              <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Top dividend payers</h3>
        <div className="space-y-2">
          {q.data.by_ticker.slice(0, 15).map((t) => {
            const pct = (t.total / q.data.by_ticker[0]!.total) * 100;
            return (
              <div
                key={t.ticker_symbol}
                className="flex items-center gap-3 py-2 border-b border-border-subtle/50 last:border-0"
              >
                <div className="w-14 font-num text-sm text-white">{t.ticker_symbol}</div>
                <div className="flex-1 text-xs text-slate-400 truncate">{t.name}</div>
                <div className="text-xs text-slate-500 w-20 text-right">
                  {t.payments} pmts
                </div>
                <div className="flex-1 max-w-[240px] h-2 bg-bg-overlay rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-green"
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
                <div className="w-24 text-right font-num text-sm text-white">
                  {fmtUsd(t.total)}
                </div>
              </div>
            );
          })}
          {q.data.by_ticker.length === 0 && (
            <div className="text-center text-slate-500 py-6 text-sm">
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
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`font-num text-2xl mt-1 ${color === "pos" ? "pos" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}
