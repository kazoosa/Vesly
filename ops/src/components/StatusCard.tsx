type Status = "ok" | "warn" | "error" | "unconfigured";

interface Metric {
  label: string;
  value: string;
  hint?: string;
  progress?: number; // 0–100
}

interface Props {
  title: string;
  subtitle?: string;
  status?: Status;
  hero?: string;
  metrics?: Metric[];
  events?: Array<{ title: string; time?: string }>;
  extLink?: string;
  extLabel?: string;
}

const STATUS: Record<Status, { dot: string; label: string }> = {
  ok: { dot: "status-green", label: "All good" },
  warn: { dot: "status-amber", label: "Heads up" },
  error: { dot: "status-red", label: "Problem" },
  unconfigured: { dot: "status-gray", label: "Not set up" },
};

export function StatusCard({
  title,
  subtitle,
  status = "unconfigured",
  hero,
  metrics,
  events,
  extLink,
  extLabel,
}: Props) {
  const s = STATUS[status];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-subtitle">{subtitle}</div>}
        </div>
        <div className="status-pill">
          <span className={`status-dot ${s.dot}`} />
          <span className="status-label">{s.label}</span>
        </div>
      </div>

      {hero && <div className="hero">{hero}</div>}

      {metrics && metrics.length > 0 && (
        <div className="metrics">
          {metrics.map((m, i) => (
            <div key={i} className="metric">
              <div className="metric-row">
                <span className="metric-label">{m.label}</span>
                <span className="metric-value">{m.value}</span>
              </div>
              {m.progress !== undefined && (
                <div className="progress">
                  <div
                    className={`progress-fill ${m.progress > 80 ? "progress-warn" : ""}`}
                    style={{ width: `${m.progress}%` }}
                  />
                </div>
              )}
              {m.hint && <div className="metric-hint">{m.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {events && events.length > 0 && (
        <>
          <div className="events-title">Recent</div>
          <div className="events">
            {events.slice(0, 4).map((ev, i) => (
              <div key={i} className="event-row">
                <span className="event-title">{ev.title}</span>
                {ev.time && <span className="event-time">{ev.time}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {extLink && (
        <a href={extLink} target="_blank" rel="noreferrer" className="ext-link-btn">
          {extLabel ?? "Open"} ↗
        </a>
      )}
    </div>
  );
}
