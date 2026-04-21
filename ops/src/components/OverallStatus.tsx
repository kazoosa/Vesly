type Status = "ok" | "warn" | "error" | "unconfigured";

type ServiceData = {
  status: Status;
  message?: string;
  data?: Record<string, unknown>;
};

interface Props {
  status: Status;
  services: Record<string, ServiceData>;
}

const HEADLINE: Record<Status, string> = {
  ok: "Beacon is running fine.",
  warn: "Heads up — one thing needs attention.",
  error: "Something's broken — check below.",
  unconfigured: "Some monitors aren't set up yet.",
};

const EMOJI: Record<Status, string> = {
  ok: "✅",
  warn: "⚠️",
  error: "🛑",
  unconfigured: "⚙️",
};

export function OverallStatus({ status, services }: Props) {
  const names = Object.keys(services);
  const broken = names.filter(
    (k) => services[k]?.status === "error" || services[k]?.status === "warn",
  );

  return (
    <div className={`overall overall-${status}`}>
      <div className="overall-left">
        <div className="overall-emoji">{EMOJI[status]}</div>
        <div>
          <div className="overall-headline">{HEADLINE[status]}</div>
          <div className="overall-sub">
            {status === "ok"
              ? `${names.length} systems checked · all healthy`
              : broken.length > 0
                ? `Problem with: ${broken.map(prettyName).join(", ")}`
                : `${names.length} systems checked`}
          </div>
        </div>
      </div>
    </div>
  );
}

function prettyName(raw: string): string {
  const map: Record<string, string> = {
    render: "backend server",
    vercel: "websites",
    neon: "database",
    upstash: "cache",
    github: "code",
    health: "health check",
  };
  return map[raw] ?? raw;
}
