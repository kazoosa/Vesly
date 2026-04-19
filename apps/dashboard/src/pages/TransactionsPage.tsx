import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "../components/money";

interface Tx {
  id: string;
  date: string;
  type: string;
  ticker_symbol: string;
  security_name: string;
  quantity: number;
  price: number;
  amount: number;
  institution: string;
  institution_color: string;
  account_name: string;
}

const TYPES = ["all", "buy", "sell", "dividend", "interest", "transfer", "fee"] as const;

export function TransactionsPage() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [ticker, setTicker] = useState("");
  const [inst, setInst] = useState<string>("all");

  const q = useQuery({
    queryKey: ["tx", type, ticker],
    queryFn: () => {
      const params = new URLSearchParams({ count: "300" });
      if (type !== "all") params.set("type", type);
      if (ticker) params.set("ticker", ticker);
      return f<{ transactions: Tx[]; total: number }>(`/api/portfolio/transactions?${params}`);
    },
  });

  const institutions = useMemo(() => {
    const set = new Set<string>();
    q.data?.transactions.forEach((t) => set.add(t.institution));
    return [...set];
  }, [q.data]);

  const rows = (q.data?.transactions ?? []).filter(
    (t) => inst === "all" || t.institution === inst,
  );

  // Monthly summary for sidebar
  const summary = useMemo(() => {
    const byType: Record<string, number> = { buy: 0, sell: 0, dividend: 0 };
    for (const t of rows) {
      byType[t.type] = (byType[t.type] ?? 0) + t.amount;
    }
    return byType;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Transactions</h1>
          <p className="text-xs text-slate-500 mt-1">{rows.length} transactions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard label="Buys (shown)" value={summary.buy ?? 0} />
        <SummaryCard label="Sells (shown)" value={summary.sell ?? 0} color="pos" />
        <SummaryCard label="Dividends (shown)" value={summary.dividend ?? 0} color="pos" />
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase mb-1">Type</div>
          <div className="flex gap-1 flex-wrap">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`btn-ghost text-xs ${type === t ? "bg-bg-hover text-white" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Ticker</div>
          <input
            className="input"
            placeholder="AAPL, SPY, ..."
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase mb-1">Brokerage</div>
          <select
            className="input"
            value={inst}
            onChange={(e) => setInst(e.target.value)}
          >
            <option value="all">All</option>
            {institutions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Security</th>
              <th>Brokerage</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Price</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="text-xs text-slate-400 font-num">{t.date}</td>
                <td>
                  <TxBadge type={t.type} />
                </td>
                <td>
                  <div className="font-num text-white text-sm">{t.ticker_symbol}</div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                    {t.security_name}
                  </div>
                </td>
                <td>
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: t.institution_color }}
                    />
                    {t.institution}
                  </span>
                  <div className="text-[10px] text-slate-500">{t.account_name}</div>
                </td>
                <td className="text-right font-num text-slate-300">
                  {t.quantity ? t.quantity.toFixed(4) : "—"}
                </td>
                <td className="text-right font-num text-slate-400">
                  {t.price ? fmtUsd(t.price) : "—"}
                </td>
                <td className="text-right font-num">
                  {t.type === "dividend" || t.type === "interest" || t.type === "sell" ? (
                    <span className="pos">+{fmtUsd(t.amount)}</span>
                  ) : (
                    <span className="text-slate-300">{fmtUsd(t.amount)}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-10">
                  No transactions match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: "pos" }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`font-num text-xl mt-1 ${color === "pos" ? "pos" : "text-white"}`}>
        {fmtUsd(value)}
      </div>
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
