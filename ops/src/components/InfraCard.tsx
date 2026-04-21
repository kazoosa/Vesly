import { Icon } from "./Icon";

type Status = "ok" | "warn" | "error" | "unconfigured";

interface Metric {
  label: string;
  value: string;
  sub?: string;
}

interface Props {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  status?: Status;
  hero?: string;
  metrics?: Metric[];
  progress?: { value: number; label?: string };
  link?: string;
  linkLabel?: string;
}

const PILL: Record<Status, { cls: string; label: string }> = {
  ok: { cls: "pill-ok", label: "All good" },
  warn: { cls: "pill-warn", label: "Heads up" },
  error: { cls: "pill-error", label: "Problem" },
  unconfigured: { cls: "pill-gray", label: "Not set up" },
};

export function InfraCard({
  icon,
  title,
  subtitle,
  status = "unconfigured",
  hero,
  metrics,
  progress,
  link,
  linkLabel,
}: Props) {
  const p = PILL[status];
  return (
    <div className="infra-card">
      <div className="infra-head">
        <div className="infra-title-row">
          <span className="infra-icon">{icon}</span>
          <div>
            <div className="infra-title">{title}</div>
            {subtitle && <div className="infra-sub">{subtitle}</div>}
          </div>
        </div>
        <span className={`pill ${p.cls}`}>{p.label}</span>
      </div>

      {hero && <div className="infra-hero">{hero}</div>}

      {progress && (
        <div className="infra-progress-wrap">
          <div className="infra-progress">
            <div
              className={`infra-progress-fill ${
                progress.value > 80 ? "warn" : ""
              }`}
              style={{ width: `${Math.max(2, progress.value)}%` }}
            />
          </div>
          <div className="infra-progress-label">
            <span>{progress.value.toFixed(1)}% used</span>
            {progress.label && <span>{progress.label}</span>}
          </div>
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <div className="infra-metrics">
          {metrics.map((m, i) => (
            <div key={i} className="infra-metric">
              <span className="infra-metric-label">{m.label}</span>
              <span className="infra-metric-value">
                {m.value}
                {m.sub && <span className="infra-metric-sub">{m.sub}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {link && (
        <a href={link} className="infra-link" target="_blank" rel="noreferrer">
          {linkLabel ?? "Open"} <Icon.ExternalLink />
        </a>
      )}
    </div>
  );
}
