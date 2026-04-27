import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "../components/money";
import { useChartTheme, tooltipProps } from "../lib/chartTheme";
import { Skeleton } from "../components/Skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface AllocResp {
  by_ticker: Array<{ label: string; value: number; weight_pct: number; color: string }>;
  by_institution: Array<{ label: string; value: number; weight_pct: number; color: string }>;
  by_type: Array<{ label: string; value: number; weight_pct: number; color: string }>;
  total_value: number;
  rollup_options: boolean;
}

export function AllocationPage() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const [rollup, setRollup] = useState(true);
  const q = useQuery({
    queryKey: ["allocation", rollup],
    queryFn: () =>
      f<AllocResp>(`/api/portfolio/allocation?rollupOptions=${rollup}`),
  });

  // Render the page shell + skeletons immediately. The data fetch
  // resolves into the cards below as it arrives — the user sees
  // the layout in <200ms instead of staring at a "Loading…" card
  // until the network round-trip completes.
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Allocation</h1>
          <Skeleton className="h-3 w-40 mt-2" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <DonutCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const empty =
    !q.data ||
    q.data.total_value === 0 ||
    (q.data.by_ticker.length === 0 &&
      q.data.by_institution.length === 0 &&
      q.data.by_type.length === 0);

  if (empty) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Allocation</h1>
        </div>
        <div className="card p-10 text-center">
          <h2 className="text-fg-primary mb-2">No allocation data yet</h2>
          <p className="text-sm text-fg-secondary max-w-md mx-auto">
            Connect a brokerage to see how your portfolio is split across securities, brokerages, and asset classes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Allocation</h1>
          <p className="text-xs text-fg-muted mt-1">
            Portfolio value {fmtUsd(q.data.total_value)}
          </p>
        </div>
        {/* Options rollup toggle. The default rolls option exposure
            into the underlying ticker (delta-equivalent share value),
            so a portfolio of AAPL stock + AAPL calls reads as one
            AAPL slice. Premium-only mode shows options as their own
            slice valued at the broker-reported premium × multiplier;
            useful for thinking about the cash you've actually spent
            on options vs the directional exposure they give you. */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-fg-muted">
            Options
          </span>
          <div className="flex gap-1 text-xs">
            <button
              className={`btn-ghost ${rollup ? "bg-bg-hover text-fg-primary" : ""}`}
              onClick={() => setRollup(true)}
              title="Roll option exposure into underlying ticker (delta-equivalent shares)"
            >
              Roll up
            </button>
            <button
              className={`btn-ghost ${!rollup ? "bg-bg-hover text-fg-primary" : ""}`}
              onClick={() => setRollup(false)}
              title="Show options as their own slice (premium × multiplier)"
            >
              Premium
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DonutCard title="By security" data={q.data.by_ticker.slice(0, 12)} />
        <DonutCard title="By brokerage" data={q.data.by_institution} />
        <DonutCard title="By asset class" data={q.data.by_type} labelFormat={(l) => TYPE_LABELS[l] ?? l} />
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  equity: "Equities",
  etf: "ETFs",
  mutual_fund: "Mutual funds",
  fixed_income: "Fixed income",
  cash: "Cash",
  option: "Options",
};

function DonutCardSkeleton() {
  return (
    <div className="card p-5">
      <Skeleton className="h-4 w-24 mb-4" />
      <div className="h-52 flex items-center justify-center">
        <Skeleton className="h-40 w-40 rounded-full" />
      </div>
      <div className="space-y-1.5 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="w-2 h-2 rounded-full" />
            <Skeleton className="h-2.5 flex-1" />
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutCard({
  title,
  data,
  labelFormat,
}: {
  title: string;
  data: Array<{ label: string; value: number; weight_pct: number; color: string }>;
  labelFormat?: (s: string) => string;
}) {
  const ct = useChartTheme();
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-fg-primary mb-4">{title}</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke={ct.pieStroke}
              strokeWidth={2}
              animationBegin={0}
              animationDuration={400}
              isAnimationActive={true}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              {...tooltipProps(ct)}
              formatter={(v: number, name: string) => [fmtUsd(v), labelFormat ? labelFormat(name) : name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5 mt-4 max-h-52 overflow-y-auto">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="flex-1 truncate text-fg-secondary">
              {labelFormat ? labelFormat(d.label) : d.label}
            </span>
            <span className="font-num text-fg-secondary w-14 text-right">
              {d.weight_pct.toFixed(1)}%
            </span>
            <span className="font-num text-fg-muted w-20 text-right">
              {fmtUsd(d.value, { decimals: 0 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
