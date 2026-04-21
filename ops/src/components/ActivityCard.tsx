import { Icon } from "./Icon";

type Status = "ok" | "warn" | "error" | "unconfigured";

interface Props {
  icon: React.ReactNode;
  title: string;
  status?: Status;
  events?: Array<{ title: string; time?: string }>;
  errorMessage?: string;
  emptyMessage?: string;
  link?: string;
  linkLabel?: string;
}

const PILL: Record<Status, { cls: string; label: string }> = {
  ok: { cls: "pill-ok", label: "All good" },
  warn: { cls: "pill-warn", label: "Heads up" },
  error: { cls: "pill-error", label: "Problem" },
  unconfigured: { cls: "pill-gray", label: "Not set up" },
};

export function ActivityCard({
  icon,
  title,
  status = "ok",
  events,
  errorMessage,
  emptyMessage,
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
          </div>
        </div>
        {status !== "ok" && <span className={`pill ${p.cls}`}>{p.label}</span>}
      </div>

      {errorMessage && <div className="infra-error">{errorMessage}</div>}

      {!errorMessage && events && events.length > 0 && (
        <div className="activity-list">
          {events.slice(0, 5).map((ev, i) => (
            <div key={i} className="activity-row">
              <span className="activity-title">{ev.title}</span>
              {ev.time && <span className="activity-time">{ev.time}</span>}
            </div>
          ))}
        </div>
      )}

      {!errorMessage && (!events || events.length === 0) && (
        <div className="activity-empty">
          {emptyMessage ?? "Nothing yet."}
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
