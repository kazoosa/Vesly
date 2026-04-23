import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd, fmtPct } from "../components/money";

interface Holding {
  ticker_symbol: string;
  name: string;
  type: string;
  exchange: string | null;
  quantity: number;
  avg_cost: number;
  close_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  weight_pct: number;
  locations: Array<{
    institution: string;
    institution_color: string;
    account_name: string;
    quantity: number;
    value: number;
  }>;
}

export function HoldingsPage() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const q = useQuery({
    queryKey: ["holdings"],
    queryFn: () => f<{ holdings: Holding[]; total_value: number }>("/api/portfolio/holdings"),
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<"value" | "pl" | "weight" | "ticker">("value");

  const sorted = [...(q.data?.holdings ?? [])].sort((a, b) => {
    if (sort === "value") return b.market_value - a.market_value;
    if (sort === "pl") return b.unrealized_pl_pct - a.unrealized_pl_pct;
    if (sort === "weight") return b.weight_pct - a.weight_pct;
    return a.ticker_symbol.localeCompare(b.ticker_symbol);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Holdings</h1>
          <p className="text-xs text-fg-muted mt-1">
            {q.data?.holdings.length ?? 0} positions · Consolidated across all connected brokerages
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {(["value", "pl", "weight", "ticker"] as const).map((k) => (
            <button
              key={k}
              className={`btn-ghost ${sort === k ? "bg-bg-hover text-fg-primary" : ""}`}
              onClick={() => setSort(k)}
            >
              {k === "ticker" ? "A–Z" : k === "pl" ? "P/L %" : k === "weight" ? "Weight" : "Value"}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th>Ticker</th>
              <th>Name</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Avg cost</th>
              <th className="text-right">Price</th>
              <th className="text-right">Value</th>
              <th className="text-right">Unrealized P/L</th>
              <th className="text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const plColor = h.unrealized_pl >= 0 ? "pos" : "neg";
              return (
                <>
                  <tr
                    key={h.ticker_symbol}
                    className="cursor-pointer"
                    onClick={() =>
                      setExpanded(expanded === h.ticker_symbol ? null : h.ticker_symbol)
                    }
                  >
                    <td className="text-fg-fainter text-xs">
                      {expanded === h.ticker_symbol ? "▾" : "▸"}
                    </td>
                    <td className="font-num text-fg-primary font-semibold">
                      <Link
                        to={`/app/stocks?symbol=${encodeURIComponent(h.ticker_symbol)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline underline-offset-2 decoration-fg-muted"
                        title={`Open ${h.ticker_symbol} details`}
                      >
                        {h.ticker_symbol}
                      </Link>
                    </td>
                    <td className="text-xs text-fg-secondary max-w-[220px] truncate">{h.name}</td>
                    <td className="text-right font-num text-fg-secondary">{h.quantity.toFixed(4)}</td>
                    <td className="text-right font-num text-fg-secondary">{fmtUsd(h.avg_cost)}</td>
                    <td className="text-right font-num text-fg-secondary">{fmtUsd(h.close_price)}</td>
                    <td className="text-right font-num text-fg-primary">{fmtUsd(h.market_value)}</td>
                    <td className={`text-right font-num ${plColor}`}>
                      {fmtUsd(h.unrealized_pl, { showSign: true })}
                      <div className="text-xs">{fmtPct(h.unrealized_pl_pct, { showSign: true })}</div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1 bg-bg-overlay rounded-full overflow-hidden">
                          <div
                            className="h-full bg-fg-primary"
                            style={{ width: `${Math.min(100, h.weight_pct * 2)}%` }}
                          />
                        </div>
                        <span className="font-num text-xs text-fg-secondary w-10">
                          {h.weight_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                  {expanded === h.ticker_symbol && (
                    <tr key={`${h.ticker_symbol}-locations`}>
                      <td></td>
                      <td colSpan={8} className="bg-bg-base/60">
                        <div className="py-2">
                          <div className="text-[10px] text-fg-muted uppercase tracking-wider mb-2">
                            Held across
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {h.locations.map((l, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 px-3 py-2 bg-bg-overlay rounded-lg"
                              >
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: l.institution_color }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-fg-primary truncate">{l.institution}</div>
                                  <div className="text-[10px] text-fg-muted truncate">
                                    {l.account_name}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-num text-xs text-fg-secondary">
                                    {l.quantity.toFixed(2)}
                                  </div>
                                  <div className="font-num text-[10px] text-fg-muted">
                                    {fmtUsd(l.value, { decimals: 0 })}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {q.isSuccess && sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-fg-muted py-10">
                  No holdings yet. Connect a brokerage to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
