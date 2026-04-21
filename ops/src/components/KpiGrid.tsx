import { Icon } from "./Icon";

type ServiceData = {
  status: "ok" | "warn" | "error" | "unconfigured";
  message?: string;
  data?: Record<string, unknown>;
};

export function KpiGrid({ business }: { business?: ServiceData }) {
  if (!business || business.status === "unconfigured") {
    return (
      <div className="kpi-card unconfigured">
        <div className="kpi-unconfigured">
          <Icon.Users />
          <div>
            <div className="kpi-unconfigured-title">User metrics not set up</div>
            <div className="kpi-unconfigured-sub">
              {business?.message ??
                "Add DATABASE_URL to this Vercel project's env vars to see user counts."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const d = business.data ?? {};
  const total = Number(d.totalUsers ?? 0);
  const today = Number(d.todaySignups ?? 0);
  const week = Number(d.weekSignups ?? 0);
  const items = Number(d.items ?? 0);
  const holdings = Number(d.holdings ?? 0);

  const kpis = [
    {
      label: "Total users",
      value: total.toLocaleString(),
      icon: <Icon.Users />,
      trend: week > 0 ? `+${week} this week` : undefined,
      tone: "primary" as const,
    },
    {
      label: "Today's signups",
      value: today.toLocaleString(),
      icon: <Icon.TrendUp />,
      trend: today > 0 ? "Good day 🎉" : "Quiet so far",
      tone: today > 0 ? ("positive" as const) : ("muted" as const),
    },
    {
      label: "Connected brokerages",
      value: items.toLocaleString(),
      icon: <Icon.Briefcase />,
      trend:
        total > 0 ? `${(items / total).toFixed(1)} per user avg` : undefined,
    },
    {
      label: "Total holdings tracked",
      value: holdings.toLocaleString(),
      icon: <Icon.Layers />,
      trend:
        total > 0 ? `${(holdings / total).toFixed(0)} per user avg` : undefined,
    },
  ];

  return (
    <div className="kpi-grid">
      {kpis.map((k, i) => (
        <div key={i} className={`kpi-card kpi-${k.tone ?? "default"}`}>
          <div className="kpi-top">
            <span className="kpi-icon">{k.icon}</span>
            <span className="kpi-label">{k.label}</span>
          </div>
          <div className="kpi-value">{k.value}</div>
          {k.trend && <div className="kpi-trend">{k.trend}</div>}
        </div>
      ))}
    </div>
  );
}
