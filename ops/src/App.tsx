import { useEffect, useState, useCallback } from "react";
import { StatusCard } from "./components/StatusCard";
import { OverallStatus } from "./components/OverallStatus";

type OpsPayload = {
  ok: boolean;
  timestamp: string;
  services: Record<string, ServiceData>;
};

type Status = "ok" | "warn" | "error" | "unconfigured";

type ServiceData = {
  status: Status;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
};

const AUTH_KEY = "beacon_ops_auth";
const REFRESH_MS = 30_000;

export function App() {
  const [password, setPassword] = useState<string>(
    () => localStorage.getItem(AUTH_KEY) ?? "",
  );
  const [authed, setAuthed] = useState<boolean>(
    () => Boolean(localStorage.getItem(AUTH_KEY)),
  );
  const [loginValue, setLoginValue] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [data, setData] = useState<OpsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchOps = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/ops", {
        headers: { "x-ops-password": password },
      });
      if (res.status === 401) {
        localStorage.removeItem(AUTH_KEY);
        setAuthed(false);
        setPassword("");
        setErr("Wrong password");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as OpsPayload;
      setData(payload);
      setLastFetched(new Date());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    if (!authed) return;
    fetchOps();
    const t = setInterval(fetchOps, REFRESH_MS);
    return () => clearInterval(t);
  }, [authed, fetchOps]);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch("/api/ops", {
        headers: { "x-ops-password": loginValue },
      });
      if (res.status === 401) {
        setLoginError("Wrong password");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      localStorage.setItem(AUTH_KEY, loginValue);
      setPassword(loginValue);
      setAuthed(true);
    } catch (e) {
      setLoginError((e as Error).message);
    }
  }

  function signOut() {
    localStorage.removeItem(AUTH_KEY);
    setPassword("");
    setAuthed(false);
    setData(null);
    setLoginValue("");
  }

  if (!authed) {
    return (
      <div className="login">
        <h2>Beacon Ops</h2>
        <p>Enter the password to see how Beacon is doing.</p>
        <form onSubmit={doLogin}>
          <input
            type="password"
            placeholder="password"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            autoFocus
          />
          {loginError && <div className="error">{loginError}</div>}
          <button className="btn btn-primary" type="submit">
            Unlock
          </button>
        </form>
      </div>
    );
  }

  const services = data?.services;

  // Roll up the overall status — worst of any service wins
  const allStatuses = services
    ? Object.values(services).map((s) => s.status)
    : [];
  const overallStatus: Status = allStatuses.includes("error")
    ? "error"
    : allStatuses.includes("warn")
      ? "warn"
      : allStatuses.includes("unconfigured")
        ? "unconfigured"
        : "ok";

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          <span className="logo">B</span>
          Beacon Ops
        </h1>
        <div className="actions">
          {lastFetched && (
            <span className="last-refresh">
              Checked {fmtRelative(lastFetched)}
            </span>
          )}
          <button className="btn" onClick={fetchOps} disabled={loading}>
            {loading ? <span className="spin">↻</span> : "↻"} Refresh
          </button>
          <button className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {!data && loading && <div className="loading">Loading…</div>}

      {services && (
        <>
          <OverallStatus status={overallStatus} services={services} />

          <div className="section-label">Health checks</div>
          <div className="grid">
            <StatusCard
              title="Is Beacon working?"
              subtitle="Users can sign in and use the app"
              status={services.health?.status}
              hero={heroFromHealth(services.health)}
              metrics={[
                {
                  label: "Response speed",
                  value: speedLabel(services.health?.data?.latency as string | undefined),
                  hint: services.health?.data?.latency as string | undefined,
                },
              ]}
              extLink={(services.health?.data?.url as string) ?? undefined}
              extLabel="Open health page"
            />

            <StatusCard
              title="Backend server"
              subtitle="Runs everything — login, data, syncs"
              status={services.render?.status}
              hero={
                services.render?.status === "ok"
                  ? "Running"
                  : services.render?.status === "warn"
                    ? "Busy"
                    : "Down"
              }
              metrics={[
                {
                  label: "Last updated",
                  value: String(services.render?.data?.["last deploy"] ?? "—"),
                },
                {
                  label: "Last change made",
                  value: lastCommitFromRender(services.render),
                },
              ]}
              extLink="https://dashboard.render.com"
              extLabel="Open Render"
            />

            <StatusCard
              title="Websites"
              subtitle="Dashboard + Link UI (the parts people see)"
              status={services.vercel?.status}
              hero={vercelHero(services.vercel)}
              metrics={vercelMetrics(services.vercel)}
              extLink="https://vercel.com/dashboard"
              extLabel="Open Vercel"
            />
          </div>

          <div className="section-label">Usage (free tier limits)</div>
          <div className="grid">
            <StatusCard
              title="Database"
              subtitle="Where user accounts + holdings are saved"
              status={services.neon?.status}
              hero={
                services.neon?.data?.["storage used"]
                  ? String(services.neon.data["storage used"])
                  : "—"
              }
              metrics={[
                {
                  label: "Storage limit",
                  value: "3 GB (free tier)",
                  progress: neonStorageProgress(services.neon),
                },
                {
                  label: "Compute this hour",
                  value: String(services.neon?.data?.["compute (this hour)"] ?? "—"),
                  hint: "100 CU-hours/month free",
                },
              ]}
              extLink="https://console.neon.tech"
              extLabel="Open Neon"
            />

            <StatusCard
              title="Cache (Redis)"
              subtitle="Speeds up repeat requests"
              status={services.upstash?.status}
              hero={
                services.upstash?.data?.["commands (today)"]
                  ? `${services.upstash.data["commands (today)"]} today`
                  : "—"
              }
              metrics={[
                {
                  label: "Daily command limit",
                  value: "500,000 commands/day (free)",
                  progress: upstashDailyProgress(services.upstash),
                },
                {
                  label: "Keys stored",
                  value: String(services.upstash?.data?.keys ?? "—"),
                },
              ]}
              extLink="https://console.upstash.com"
              extLabel="Open Upstash"
            />

            <StatusCard
              title="Code changes"
              subtitle="What you've pushed to the app lately"
              status={services.github?.status}
              hero={
                services.github?.data?._events
                  ? `${(services.github.data._events as Array<unknown>).length} recent`
                  : "—"
              }
              metrics={[
                {
                  label: "Last change",
                  value: String(services.github?.data?.["last commit"] ?? "—"),
                },
                {
                  label: "Open pull requests",
                  value: String(services.github?.data?.["open PRs"] ?? "0"),
                  hint: "Changes waiting to be merged",
                },
              ]}
              events={
                (services.github?.data?._events as
                  | Array<{ title: string; time?: string }>
                  | undefined) ?? undefined
              }
              extLink="https://github.com/kazoosa/Beacon"
              extLabel="Open GitHub"
            />
          </div>
        </>
      )}

      <div className="footer">
        Auto-refreshes every 30 seconds · Beacon Ops v0.2
      </div>
    </div>
  );
}

/* --------------------------------------------- friendly translators */

function fmtRelative(d: Date): string {
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  return d.toLocaleString();
}

function heroFromHealth(h: ServiceData | undefined): string {
  if (!h) return "Unknown";
  if (h.status === "ok") return "Working ✓";
  if (h.status === "warn") return "Slow";
  return "Down";
}

function speedLabel(latency: string | undefined): string {
  if (!latency) return "—";
  const ms = parseInt(latency, 10);
  if (Number.isNaN(ms)) return latency;
  if (ms < 300) return "Fast";
  if (ms < 1000) return "Normal";
  if (ms < 3000) return "Slow (cold start)";
  return "Very slow";
}

function lastCommitFromRender(r: ServiceData | undefined): string {
  const events = r?.data?._events as Array<{ title: string; time?: string }> | undefined;
  if (events && events.length > 0) {
    // Find the most recent "live" deploy for context
    const live = events.find((e) => e.title.startsWith("live"));
    if (live) return live.title.replace(/^live · /, "").slice(0, 60);
  }
  return String(r?.data?.commit ?? "—");
}

function vercelHero(v: ServiceData | undefined): string {
  if (!v) return "—";
  const projects = v.data as Record<string, unknown> | undefined;
  if (!projects) return "—";
  const all = Object.entries(projects).filter(([k]) => !k.startsWith("_"));
  const readyCount = all.filter(([, val]) =>
    String(val).toLowerCase().includes("ready"),
  ).length;
  if (all.length === 0) return "—";
  if (readyCount === all.length) return "All live ✓";
  return `${readyCount}/${all.length} live`;
}

function vercelMetrics(
  v: ServiceData | undefined,
): Array<{ label: string; value: string; hint?: string }> {
  if (!v?.data) return [];
  return Object.entries(v.data)
    .filter(([k]) => !k.startsWith("_"))
    .map(([name, val]) => {
      const s = String(val);
      const isReady = s.toLowerCase().includes("ready");
      return {
        label: prettyProjectName(name),
        value: isReady ? "Live ✓" : s.split(" · ")[0] ?? s,
        hint: s.includes("·") ? s.split(" · ")[1] : undefined,
      };
    });
}

function prettyProjectName(raw: string): string {
  // "vesly-dashboard" → "Main site" or similar friendly names
  const map: Record<string, string> = {
    "vesly-dashboard": "Main website",
    "beacon": "Ops dashboard (this page)",
    "vesly-link-ui": "Connect modal",
    "vesly-backend": "Backend",
  };
  return map[raw] ?? raw;
}

function neonStorageProgress(n: ServiceData | undefined): number | undefined {
  const used = n?.data?.["storage used"] as string | undefined;
  if (!used) return undefined;
  // Parse e.g. "0 B", "1.2 MB", "500 MB" into MB
  const m = used.match(/^([\d.]+)\s*(B|KB|MB|GB)$/);
  if (!m) return undefined;
  const n1 = parseFloat(m[1]!);
  const unit = m[2];
  const mb =
    unit === "B" ? n1 / 1024 / 1024 : unit === "KB" ? n1 / 1024 : unit === "MB" ? n1 : n1 * 1024;
  const limitMb = 3 * 1024; // 3 GB free tier
  return Math.min(100, (mb / limitMb) * 100);
}

function upstashDailyProgress(u: ServiceData | undefined): number | undefined {
  const raw = u?.data?.["commands (today)"] as string | number | undefined;
  if (raw === undefined) return undefined;
  const n = typeof raw === "string" ? parseInt(raw.replace(/,/g, ""), 10) : raw;
  if (Number.isNaN(n)) return undefined;
  return Math.min(100, (n / 500_000) * 100);
}
