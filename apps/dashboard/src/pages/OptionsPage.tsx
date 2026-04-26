import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd, fmtPct } from "../components/money";
import { useTo } from "../lib/basePath";

/**
 * /app/options (and /demo/options) — dedicated view for option
 * positions. Two layouts the user can toggle between:
 *
 *   * "By expiry"  — chronological, easy to see what's about to roll off
 *   * "By underlying" — grouped by AAPL/AMAT/SPY etc, with each
 *     contract under its parent ticker
 *
 * Empty-state copy is honest about coverage so users with brokers
 * SnapTrade doesn't expose options for don't read it as broken.
 */

interface Holding {
  ticker_symbol: string;
  name: string;
  type: string;
  quantity: number;
  avg_cost: number;
  close_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  weight_pct: number;
  option?: {
    underlying_ticker: string;
    option_type: "call" | "put";
    strike: number;
    expiry: string;
    multiplier: number;
    days_to_expiry: number;
  };
  locations: Array<{
    institution: string;
    institution_color: string;
    account_name: string;
    quantity: number;
    value: number;
  }>;
}

type Layout = "expiry" | "underlying";
type Tab = "open" | "closed";

interface Tx {
  id: string;
  date: string;
  type: string;
  ticker_symbol: string;
  security_name: string;
  quantity: number;
  price: number;
  amount: number;
}

export function OptionsPage() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const to = useTo();
  const [layout, setLayout] = useState<Layout>("expiry");
  const [tab, setTab] = useState<Tab>("open");

  const q = useQuery({
    queryKey: ["holdings"],
    queryFn: () => f<{ holdings: Holding[]; total_value: number }>("/api/portfolio/holdings"),
  });

  // Pull a wide window of transactions so we can build the closed-history
  // view. This is the same endpoint the Transactions page uses; staleTime
  // means we don't re-pay the cost when the user toggles tabs.
  const txQ = useQuery({
    queryKey: ["tx", "options-history"],
    queryFn: () =>
      f<{ transactions: Tx[]; total: number }>("/api/portfolio/transactions?count=500"),
    staleTime: 30_000,
  });

  const options = useMemo(
    () => (q.data?.holdings ?? []).filter((h): h is Holding & { option: NonNullable<Holding["option"]> } => Boolean(h.option)),
    [q.data],
  );

  // Closed contracts = option-typed transactions grouped by ticker
  // whose net quantity is 0 (everything bought has been sold/expired/
  // assigned). Open option holdings are shown in the "open" tab so
  // exclude any ticker that still has an open position.
  const openTickers = useMemo(
    () => new Set(options.map((o) => o.ticker_symbol.toUpperCase())),
    [options],
  );
  const closedContracts = useMemo(() => {
    const txs = txQ.data?.transactions ?? [];
    const byTicker = new Map<string, Tx[]>();
    for (const t of txs) {
      // Detect option tickers via the same patterns the backend parser
      // uses: Fidelity "-AAPL260424C150" or OCC "AAPL  260424C00150000".
      // Both contain a digit-letter-digit suffix (date + C/P + strike).
      const tk = t.ticker_symbol;
      if (!tk) continue;
      const isOption =
        /^-[A-Z.]+\d{6}[CP]\d/.test(tk) ||
        /^[A-Z.]+\s+\d{6}[CP]\d/.test(tk) ||
        ["option_expired", "option_assigned", "option_exercised"].includes(t.type);
      if (!isOption) continue;
      if (openTickers.has(tk.toUpperCase())) continue;
      const list = byTicker.get(tk) ?? [];
      list.push(t);
      byTicker.set(tk, list);
    }
    return [...byTicker.entries()]
      .map(([ticker, rows]) => {
        const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
        const opened = sorted[0]!.date;
        const closed = sorted[sorted.length - 1]!.date;
        // Net P/L = sum of amounts (sells/expirations are positive,
        // buys are negative — same convention used everywhere else).
        const realizedPL = sorted.reduce((sum, t) => sum + t.amount, 0);
        return {
          ticker,
          name: sorted[0]!.security_name,
          opened,
          closed,
          rows: sorted,
          realizedPL,
          eventCount: sorted.length,
        };
      })
      .sort((a, b) => b.closed.localeCompare(a.closed));
  }, [txQ.data, openTickers]);

  const groupedByExpiry = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const o of options) {
      const key = o.option.expiry;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [options]);

  const groupedByUnderlying = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const o of options) {
      const key = o.option.underlying_ticker;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [options]);

  // Aggregate stats across all open option positions — surfaced in
  // the header so the user has a single-glance read of total option
  // exposure without scanning the list.
  const stats = useMemo(() => {
    let totalValue = 0;
    let costBasis = 0;
    let contracts = 0;
    let expiringSoon = 0; // < 7 days
    for (const o of options) {
      totalValue += o.market_value;
      costBasis += o.cost_basis;
      contracts += Math.abs(o.quantity);
      if (o.option.days_to_expiry >= 0 && o.option.days_to_expiry < 7) {
        expiringSoon++;
      }
    }
    return {
      totalValue,
      costBasis,
      contracts,
      expiringSoon,
      pl: totalValue - costBasis,
      plPct: costBasis !== 0 ? ((totalValue - costBasis) / Math.abs(costBasis)) * 100 : 0,
    };
  }, [options]);

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-fg-primary">Options</h1>
        <div className="card p-10 text-center text-sm text-fg-muted">Loading…</div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-fg-primary">Options</h1>
        <div className="card p-10 text-center">
          <h2 className="text-rose-400 mb-2">Couldn't load options</h2>
          <p className="text-sm text-fg-muted max-w-md mx-auto">
            {(q.error as Error)?.message ?? "The holdings endpoint returned an error."}
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

  if (options.length === 0 && closedContracts.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-fg-primary">Options</h1>
        <div className="card p-10 text-center">
          <h2 className="text-fg-primary mb-2">No option positions</h2>
          <p className="text-sm text-fg-secondary max-w-md mx-auto mb-2">
            Beacon picks up option contracts from your connected brokerages
            automatically when SnapTrade exposes them. Nothing to show yet.
          </p>
          <p className="text-xs text-fg-fainter max-w-md mx-auto mb-5">
            Coverage caveat: SnapTrade's options data depends on what each
            broker shares. Some brokers (notably Robinhood) currently don't
            expose options holdings via the SnapTrade API even though the
            account itself connects fine — your stocks, dividends and trades
            will still sync. If your broker isn't surfacing options, import
            a positions CSV that includes the contracts to backfill.
          </p>
          <Link to={to("accounts")} className="btn-primary text-xs inline-flex">
            Connect a brokerage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Options</h1>
          <p className="text-xs text-fg-muted mt-1">
            {options.length} contract{options.length === 1 ? "" : "s"} ·
            {" "}{stats.contracts.toLocaleString()} total
            {stats.expiringSoon > 0 && (
              <span className="ml-2 text-rose-400">
                · {stats.expiringSoon} expiring within 7 days
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1 text-xs">
            <button
              className={`btn-ghost ${tab === "open" ? "bg-bg-hover text-fg-primary" : ""}`}
              onClick={() => setTab("open")}
            >
              Open
              <span className="ml-1.5 text-fg-fainter font-num">{options.length}</span>
            </button>
            <button
              className={`btn-ghost ${tab === "closed" ? "bg-bg-hover text-fg-primary" : ""}`}
              onClick={() => setTab("closed")}
            >
              Closed
              <span className="ml-1.5 text-fg-fainter font-num">{closedContracts.length}</span>
            </button>
          </div>
          {tab === "open" && (
            <div className="flex gap-1 text-xs">
              <button
                className={`btn-ghost ${layout === "expiry" ? "bg-bg-hover text-fg-primary" : ""}`}
                onClick={() => setLayout("expiry")}
              >
                By expiry
              </button>
              <button
                className={`btn-ghost ${layout === "underlying" ? "bg-bg-hover text-fg-primary" : ""}`}
                onClick={() => setLayout("underlying")}
              >
                By underlying
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total option value" value={fmtUsd(stats.totalValue)} />
        <StatCard
          label="Unrealized P/L"
          value={fmtUsd(stats.pl, { showSign: true })}
          tone={stats.pl >= 0 ? "pos" : "neg"}
          sub={fmtPct(stats.plPct, { showSign: true })}
        />
        <StatCard
          label="Cost basis"
          value={fmtUsd(stats.costBasis)}
        />
      </div>

      {tab === "open" && (
        <div className="space-y-4">
          {options.length === 0 ? (
            <div className="card p-8 text-center text-sm text-fg-muted">
              No open option positions. Switch to <strong>Closed</strong> to see
              historical contracts.
            </div>
          ) : (
            (layout === "expiry" ? groupedByExpiry : groupedByUnderlying).map(
              ([groupKey, items]) => (
                <OptionGroup
                  key={groupKey}
                  groupKey={groupKey}
                  layout={layout}
                  items={items}
                  to={to}
                />
              ),
            )
          )}
        </div>
      )}

      {tab === "closed" && (
        <ClosedContractsTable rows={closedContracts} />
      )}
    </div>
  );
}

function ClosedContractsTable({
  rows,
}: {
  rows: Array<{
    ticker: string;
    name: string;
    opened: string;
    closed: string;
    rows: Tx[];
    realizedPL: number;
    eventCount: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-fg-muted">
        No closed option contracts in the visible transaction window.
        {" "}
        Trades that opened and closed within your imported activity will
        show up here once they're recorded.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th>Contract</th>
            <th>Opened</th>
            <th>Closed</th>
            <th className="text-right">Events</th>
            <th className="text-right">Realized P/L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.ticker}>
              <td className="font-num text-fg-primary text-sm" title={c.name}>
                {c.ticker}
                {c.name && c.name !== c.ticker && (
                  <div className="text-[10px] text-fg-muted truncate max-w-[260px]">
                    {c.name}
                  </div>
                )}
              </td>
              <td className="text-xs text-fg-secondary font-num">{c.opened}</td>
              <td className="text-xs text-fg-secondary font-num">{c.closed}</td>
              <td className="text-right font-num text-xs text-fg-muted">
                {c.eventCount}
              </td>
              <td
                className={`text-right font-num ${c.realizedPL >= 0 ? "pos" : "neg"}`}
              >
                {fmtUsd(c.realizedPL, { showSign: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] text-fg-muted uppercase tracking-wider">{label}</div>
      <div className={`font-num text-xl mt-1 ${tone === "pos" ? "pos" : tone === "neg" ? "neg" : "text-fg-primary"}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-xs font-num mt-0.5 ${tone === "pos" ? "pos" : tone === "neg" ? "neg" : "text-fg-muted"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

type OptionHolding = Holding & { option: NonNullable<Holding["option"]> };

function OptionGroup({
  groupKey,
  layout,
  items,
  to,
}: {
  groupKey: string;
  layout: Layout;
  items: OptionHolding[];
  to: (sub: string) => string;
}) {
  // Group header reads "Apr 24 (2 days) · 4 contracts" for an
  // expiry-grouped view, or "AMAT · 6 contracts" for an underlying-grouped one.
  let header: React.ReactNode;
  if (layout === "expiry") {
    const expDate = new Date(groupKey + "T00:00:00Z");
    const monthDay = expDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const dte = items[0]?.option.days_to_expiry ?? 0;
    const dteText =
      dte < 0 ? `expired ${Math.abs(dte)}d ago` : dte === 0 ? "today" : `${dte}d`;
    const tone =
      dte < 0
        ? "text-fg-fainter"
        : dte < 7
          ? "text-rose-400"
          : dte < 30
            ? "text-amber-400"
            : "text-emerald-400";
    header = (
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-fg-primary">{monthDay}</span>
        <span className={`text-xs font-mono ${tone}`}>{dteText}</span>
        <span className="text-xs text-fg-muted">·</span>
        <span className="text-xs text-fg-muted">{items.length} contract{items.length === 1 ? "" : "s"}</span>
      </div>
    );
  } else {
    header = (
      <div className="flex items-baseline gap-2">
        <Link
          to={`${to("stocks")}?symbol=${encodeURIComponent(groupKey)}`}
          className="text-sm font-semibold text-fg-primary hover:underline underline-offset-2 decoration-fg-muted"
        >
          {groupKey}
        </Link>
        <span className="text-xs text-fg-muted">·</span>
        <span className="text-xs text-fg-muted">{items.length} contract{items.length === 1 ? "" : "s"}</span>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3">{header}</div>
      <div className="space-y-2">
        {items
          .slice()
          .sort((a, b) => b.market_value - a.market_value)
          .map((o) => (
            <OptionContractRow key={o.ticker_symbol} holding={o} to={to} />
          ))}
      </div>
    </div>
  );
}

function OptionContractRow({
  holding,
  to,
}: {
  holding: OptionHolding;
  to: (sub: string) => string;
}) {
  const o = holding.option;
  const isShort = holding.quantity < 0;
  const contracts = Math.abs(holding.quantity);
  const sideLabel = isShort ? "SHORT" : "LONG";
  const sideClass = isShort ? "text-amber-400" : "text-fg-primary";
  const plClass = holding.unrealized_pl >= 0 ? "pos" : "neg";

  return (
    <Link
      to={`${to("stocks")}?symbol=${encodeURIComponent(holding.ticker_symbol)}`}
      className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center py-2 px-3 rounded-md bg-bg-overlay/40 hover:bg-bg-overlay transition-colors"
    >
      <span className={`text-[10px] font-mono uppercase tracking-widest font-semibold ${sideClass} w-12`}>
        {sideLabel}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-num text-fg-primary">
          {o.underlying_ticker}{" "}
          <span className="font-semibold">${o.strike}</span>{" "}
          {o.option_type.toUpperCase()}
        </div>
        <div className="text-[11px] text-fg-muted font-num">
          {contracts} contract{contracts === 1 ? "" : "s"}
          {" · "}
          {o.multiplier !== 100 && `${o.multiplier}× · `}
          {fmtUsd(holding.close_price)}/contract
        </div>
      </div>
      <div className="text-right font-num">
        <div className="text-sm text-fg-primary">{fmtUsd(holding.market_value)}</div>
        <div className={`text-[11px] ${plClass}`}>
          {fmtUsd(holding.unrealized_pl, { showSign: true })}
        </div>
      </div>
      <div className="text-right text-[11px] text-fg-muted">
        cost {fmtUsd(holding.cost_basis)}
      </div>
    </Link>
  );
}
