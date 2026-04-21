import { Icon } from "./Icon";

type Status = "ok" | "warn" | "error" | "unconfigured";

type ServiceData = {
  status: Status;
  data?: Record<string, unknown>;
};

interface Props {
  status: Status;
  services: Record<string, ServiceData>;
}

const HEADLINE: Record<Status, string> = {
  ok: "Everything is running smoothly.",
  warn: "One thing needs your attention.",
  error: "Something is broken.",
  unconfigured: "Some monitors aren't set up yet.",
};

export function StatusBanner({ status, services }: Props) {
  const names = Object.keys(services);
  const broken = names.filter((k) => {
    const s = services[k]?.status;
    if (k === "github" && s === "error") return true;
    return s === "error" || s === "warn";
  });

  return (
    <div className={`banner banner-${status}`}>
      <div className="banner-icon">
        {status === "ok" ? (
          <Icon.Check />
        ) : status === "error" ? (
          <Icon.AlertTriangle />
        ) : (
          <Icon.AlertTriangle />
        )}
      </div>
      <div className="banner-body">
        <div className="banner-title">{HEADLINE[status]}</div>
        <div className="banner-sub">
          {status === "ok"
            ? `All ${names.length} systems healthy`
            : broken.length > 0
              ? `Issue with: ${broken.map(prettyName).join(", ")}`
              : `${names.length} systems checked`}
        </div>
      </div>
    </div>
  );
}

function prettyName(raw: string): string {
  const map: Record<string, string> = {
    render: "backend",
    vercel: "websites",
    neon: "database",
    upstash: "cache",
    github: "code",
    health: "health check",
    business: "user metrics",
  };
  return map[raw] ?? raw;
}
