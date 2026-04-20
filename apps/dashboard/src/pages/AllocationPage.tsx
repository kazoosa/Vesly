import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "../components/money";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface AllocResp {
  by_ticker: Array<{ label: string; value: number; weight_pct: number; color: string }>;
  by_institution: Array<{ label: string; value: number; weight_pct: number; color: string }>;
  by_type: Array<{ label: string; value: number; weight_pct: number; color: string }>;
  total_value: number;
}

export function AllocationPage() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const q = useQuery({
    queryKey: ["allocation"],
    queryFn: () => f<AllocResp>("/api/portfolio/allocation"),
  });

  if (q.isLoading) {
    return <div className="text-sm text-slate-500">Loading…</div>;
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
          <h1 className="text-xl font-semibold text-white">Allocation</h1>
        </div>
        <div className="card p-10 text-center">
          <div className="text-5xl mb-4">◐</div>
          <h2 className="text-lg font-semibold text-white mb-2">No allocation data yet</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Connect a brokerage to see how your portfolio is split across securities, brokerages, and asset classes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Allocation</h1>
        <p className="text-xs text-slate-500 mt-1">
          Portfolio value {fmtUsd(q.data.total_value)}
        </p>
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
};

function DonutCard({
  title,
  data,
  labelFormat,
}: {
  title: string;
  data: Array<{ label: string; value: number; weight_pct: number; color: string }>;
  labelFormat?: (s: string) => string;
}) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
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
              stroke="#0a0e1a"
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
              contentStyle={{
                background: "#111827",
                border: "1px solid #1e293b",
                borderRadius: 8,
                fontSize: 12,
                color: "#e2e8f0",
              }}
              itemStyle={{ color: "#e2e8f0" }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(v: number, name: string) => [fmtUsd(v), labelFormat ? labelFormat(name) : name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5 mt-4 max-h-52 overflow-y-auto">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="flex-1 truncate text-slate-300">
              {labelFormat ? labelFormat(d.label) : d.label}
            </span>
            <span className="font-num text-slate-400 w-14 text-right">
              {d.weight_pct.toFixed(1)}%
            </span>
            <span className="font-num text-slate-500 w-20 text-right">
              {fmtUsd(d.value, { decimals: 0 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
