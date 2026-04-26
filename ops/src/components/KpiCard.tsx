import { Icon } from "./Icon";

type Tone = "primary" | "positive" | "muted" | "default";

interface Props {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: string;
  tone?: Tone;
}

/**
 * One KPI tile. Extracted from KpiGrid so the dashboard layout system
 * can render each KPI as an individually-draggable widget.
 */
export function KpiCard({ label, value, icon, trend, tone = "default" }: Props) {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-icon">{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {trend && <div className="kpi-trend">{trend}</div>}
    </div>
  );
}

/**
 * Inline placeholder shown when the business service hasn't been
 * configured (no DATABASE_URL on the ops Vercel project). Stays as
 * one wide card spanning the full row so it doesn't sit awkwardly
 * next to single KPI tiles.
 */
export function KpiUnconfigured({ message }: { message?: string }) {
  return (
    <div className="kpi-card unconfigured">
      <div className="kpi-unconfigured">
        <Icon.Users />
        <div>
          <div className="kpi-unconfigured-title">User metrics not set up</div>
          <div className="kpi-unconfigured-sub">
            {message ??
              "Add DATABASE_URL to this Vercel project's env vars to see user counts."}
          </div>
        </div>
      </div>
    </div>
  );
}
