import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { KpiCard, KpiUnconfigured } from "./components/KpiCard";
import { StatusBanner } from "./components/StatusBanner";
import { InfraCard } from "./components/InfraCard";
import { ActivityCard } from "./components/ActivityCard";
import { SelfTestCard } from "./components/SelfTestCard";
import { BeaconMark } from "./components/BeaconMark";
import {
  DashboardLayoutGrid,
  rectSortingStrategy,
  type SectionDef,
  type WidgetDef,
} from "./components/DashboardLayout";

type OpsPayload = {
  ok: boolean;
  timestamp: string;
  services: Record<string, ServiceData> & {
    business?: ServiceData;
    render?: ServiceData;
    vercel?: ServiceData;
    neon?: ServiceData;
    upstash?: ServiceData;
    github?: ServiceData;
    health?: ServiceData;
    selftest?: ServiceData;
  };
};

type Status = "ok" | "warn" | "error" | "unconfigured";

type ServiceData = {
  status: Status;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
};

const AUTH_KEY = "beacon_ops_auth";
const THEME_KEY = "beacon-ops-theme";
const CACHE_KEY = "beacon_ops_data";
const CACHE_TTL_MS = 5 * 60_000; // serve cached payload up to 5 min old on mount
const REFRESH_MS = 30_000;

type ThemeId = "light" | "dark" | "midnight" | "solarized" | "high-contrast";

const THEMES: Array<{
  id: ThemeId;
  label: string;
  description: string;
  swatch: { bg: string; card: string; fg: string; accent: string };
}> = [
  {
    id: "light",
    label: "Light",
    description: "Clean default. Same as the Beacon app dashboard.",
    swatch: { bg: "#fafafc", card: "#ffffff", fg: "#11111b", accent: "#7c6aff" },
  },
  {
    id: "dark",
    label: "Dark",
    description: "Soft dark — easier on the eyes after sundown.",
    swatch: { bg: "#07070b", card: "#111119", fg: "#f5f7fc", accent: "#7c6aff" },
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep navy with electric cyan accents. Real ops terminal feel.",
    swatch: { bg: "#050816", card: "#0f172e", fg: "#e2f1ff", accent: "#22d3ee" },
  },
  {
    id: "solarized",
    label: "Solarized",
    description: "Warm cream and muted accents. Long-session friendly.",
    swatch: { bg: "#fdf6e3", card: "#fbf3df", fg: "#586e75", accent: "#cb4b16" },
  },
  {
    id: "high-contrast",
    label: "High contrast",
    description: "Stark black and white. Maximum legibility.",
    swatch: { bg: "#ffffff", card: "#ffffff", fg: "#000000", accent: "#000000" },
  },
];

function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}

function getInitialTheme(): ThemeId {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(THEME_KEY);
  if (isThemeId(saved)) return saved;
  // Migrate the old "beacon_ops_theme" key (which only stored
  // "light" or "dark") if it's still around.
  const legacy = localStorage.getItem("beacon_ops_theme");
  if (legacy === "dark") return "dark";
  if (legacy === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: ThemeId) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);
  // Keep the legacy `.dark` class in sync so any ancestor selector
  // that hasn't been migrated still matches when a dark theme is on.
  html.classList.toggle("dark", theme === "dark" || theme === "midnight");
}

export function App() {
  const [password, setPassword] = useState<string>(
    () => localStorage.getItem(AUTH_KEY) ?? "",
  );
  const [authed, setAuthed] = useState<boolean>(
    () => Boolean(localStorage.getItem(AUTH_KEY)),
  );
  const [loginValue, setLoginValue] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  // Hydrate from localStorage synchronously so the first paint after a
  // reload shows the prior payload immediately while the fresh fetch
  // is in flight. Biggest perceived-performance win on the page.
  const [data, setData] = useState<OpsPayload | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      const { data: d, ts } = JSON.parse(cached) as {
        data: OpsPayload;
        ts: number;
      };
      if (typeof ts !== "number" || Date.now() - ts > CACHE_TTL_MS) return null;
      return d;
    } catch {
      return null;
    }
  });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      const { ts } = JSON.parse(cached) as { ts: number };
      return typeof ts === "number" ? new Date(ts) : null;
    } catch {
      return null;
    }
  });
  const [theme, setTheme] = useState<ThemeId>(() => getInitialTheme());
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

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
      const now = new Date();
      setLastFetched(now);
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ data: payload, ts: now.getTime() }),
        );
      } catch {
        /* ignore quota errors */
      }
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
    localStorage.removeItem(CACHE_KEY);
    setPassword("");
    setAuthed(false);
    setData(null);
    setLoginValue("");
  }

  if (!authed) {
    return (
      <div className="login-shell">
        <div className="login">
          <div className="login-logo">
            <BeaconMark size={28} />
          </div>
          <h2>Beacon Ops</h2>
          <p>Enter the password to see your dashboard.</p>
          <form onSubmit={doLogin}>
            <input
              type="password"
              placeholder="Password"
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
      </div>
    );
  }

  const s = data?.services;
  const overallStatus: Status = s
    ? rollUpStatus(s)
    : "unconfigured";

  // Every section on the page is a draggable section in edit mode.
  // Sections themselves can be reordered relative to each other; each
  // section's widgets reorder within their own grid.
  const dndSections = useMemo<SectionDef[]>(() => {
    if (!s) return [];
    return [
      {
        id: "business",
        title: "Business",
        subtitle: "Your numbers, live from the database",
        icon: <Icon.TrendUp />,
        gridClass: "kpi-grid",
        strategy: rectSortingStrategy,
        widgets: businessWidgets(s.business),
      },
      {
        id: "health",
        title: "Health",
        subtitle: "Is everything running right now",
        icon: <Icon.Activity />,
        gridClass: "grid-3",
        strategy: rectSortingStrategy,
        widgets: healthWidgets(s),
      },
      {
        id: "tier",
        title: "Free tier usage",
        subtitle: "How close you are to limits",
        icon: <Icon.Zap />,
        gridClass: "grid-2",
        strategy: rectSortingStrategy,
        widgets: tierWidgets(s),
      },
      {
        id: "activity",
        title: "Recent activity",
        subtitle: "Code + deploys + new users",
        icon: <Icon.GitCommit />,
        gridClass: "grid-3",
        strategy: rectSortingStrategy,
        widgets: activityWidgets(s),
      },
      {
        id: "selftest",
        title: "Self-test",
        subtitle: "Live API smoke battery against the deployed backend",
        icon: <Icon.Beaker />,
        gridClass: "grid-1",
        strategy: rectSortingStrategy,
        widgets: selfTestWidgets(s, fetchOps, loading),
      },
    ];
  }, [s, fetchOps, loading]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <BeaconMark size={20} />
          </div>
          <div>
            <div className="brand-name">Beacon Ops</div>
            <div className="brand-sub">Mission control</div>
          </div>
        </div>
        <div className="topbar-actions">
          {lastFetched && (
            <span className="last-refresh">
              Updated {fmtRelative(lastFetched)}
            </span>
          )}
          <ThemePicker
            current={theme}
            open={themePickerOpen}
            onToggle={() => setThemePickerOpen((v) => !v)}
            onPick={(id) => {
              setTheme(id);
              setThemePickerOpen(false);
            }}
            onClose={() => setThemePickerOpen(false)}
          />
          {editing ? (
            <button
              className="btn btn-primary"
              onClick={() => setEditing(false)}
              title="Exit edit mode"
            >
              Done
            </button>
          ) : (
            <button
              className="icon-btn"
              onClick={() => setEditing(true)}
              title="Customize the layout"
              aria-label="Edit layout"
            >
              <Icon.Edit />
            </button>
          )}
          <button className="icon-btn" onClick={fetchOps} disabled={loading} title="Refresh">
            <Icon.RefreshCw className={loading ? "spin" : ""} />
          </button>
          <button className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {err && <div className="error">{err}</div>}

      {!s && loading && <FirstLoadSkeleton />}

      {s && (
        <>
          <StatusBanner status={overallStatus} services={s} />

          <DashboardLayoutGrid sections={dndSections} editing={editing} />
        </>
      )}

      <footer className="footer">
        Auto-refreshes every 30 seconds · Beacon Ops v0.3
      </footer>
    </div>
  );
}

/* ---------------------------------------- helpers */

function FirstLoadSkeleton() {
  // Shown only on the very first visit (no cached payload). Returning
  // visitors hydrate immediately from localStorage and never see this.
  return (
    <div className="first-load-skel" aria-hidden>
      <div className="skel skel-banner" />
      <div className="skel skel-section-head" />
      <div className="skel-grid skel-grid-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skel skel-kpi" />
        ))}
      </div>
      <div className="skel skel-section-head" />
      <div className="skel-grid skel-grid-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skel skel-infra" />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="section-head">
      <span className="section-icon">{icon}</span>
      <div>
        <div className="section-title">{title}</div>
        <div className="section-sub">{subtitle}</div>
      </div>
    </div>
  );
}

function rollUpStatus(services: Record<string, ServiceData>): Status {
  const filtered = Object.entries(services).map(([name, sd]) => {
    // GitHub rate-limit = warning, not real outage
    if (name === "github" && sd.status === "error") return "warn" as const;
    // Self-test is informational — a failing test surfaces in its own
    // section. Don't roll it up to red on the master banner; demote
    // to warning so users still see something is off.
    if (name === "selftest" && sd.status === "error") return "warn" as const;
    return sd.status;
  });
  if (filtered.includes("error")) return "error";
  if (filtered.includes("warn")) return "warn";
  if (filtered.every((s) => s === "ok")) return "ok";
  if (filtered.includes("unconfigured")) return "unconfigured";
  return "ok";
}

function fmtRelative(d: Date): string {
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleString();
}

function speedLabel(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 300) return "Fast";
  if (ms < 1000) return "Normal";
  if (ms < 3000) return "Slow (cold start)";
  return "Very slow";
}

function renderHero(r: ServiceData | undefined): string {
  if (!r || r.status === "unconfigured") return "—";
  if (r.status === "ok") return "Running";
  if (r.status === "warn") return "Busy";
  return "Down";
}

function vercelHero(v: ServiceData | undefined): string {
  if (!v?.data) return "—";
  const projects = Object.entries(v.data).filter(([k]) => !k.startsWith("_"));
  if (projects.length === 0) return "—";
  const readyCount = projects.filter(([, val]) =>
    String(val).toLowerCase().includes("ready"),
  ).length;
  if (readyCount === projects.length) return "All live";
  return `${readyCount}/${projects.length} live`;
}

function vercelMetrics(
  v: ServiceData | undefined,
): Array<{ label: string; value: string; sub?: string }> {
  if (!v?.data) return [];
  const map: Record<string, string> = {
    "vesly-dashboard": "Main site",
    beacon: "Ops page",
    "vesly-link-ui": "Connect modal",
  };
  return Object.entries(v.data)
    .filter(([k]) => !k.startsWith("_"))
    .slice(0, 3)
    .map(([name, val]) => {
      const s = String(val);
      const parts = s.split(" · ");
      const isReady = s.toLowerCase().includes("ready");
      return {
        label: map[name] ?? name,
        value: isReady ? "Live" : parts[0] ?? s,
        sub: parts[1],
      };
    });
}

function neonPct(n: ServiceData | undefined): number {
  const b = Number(n?.data?.storageBytes ?? 0);
  const limit = 3 * 1024 ** 3;
  return Math.min(100, (b / limit) * 100);
}

function upstashPct(u: ServiceData | undefined): number {
  const c = Number(u?.data?.commandsToday ?? 0);
  return Math.min(100, (c / 500_000) * 100);
}

function fmtNumber(n: unknown): string {
  if (n === undefined || n === null) return "—";
  const num = typeof n === "number" ? n : parseFloat(String(n));
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString();
}

function bytesH(n: unknown): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  if (!Number.isFinite(v)) return "—";
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Inline sparkline card for "New users (30d)". Avoids pulling in a
 * chart lib for a single 30-point line — pure SVG path math.
 */
function SignupSparkCard({
  total,
  points,
}: {
  total: number;
  points: Array<{ day: string; n: number }>;
}) {
  const max = Math.max(1, ...points.map((p) => p.n));
  const w = 200;
  const h = 40;
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = h - (p.n / max) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <span className="kpi-icon">
          <Icon.TrendUp />
        </span>
        <span className="kpi-label">New users (30d)</span>
      </div>
      <div className="kpi-value">{total.toLocaleString()}</div>
      {points.length > 0 ? (
        <svg
          width="100%"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ marginTop: 8, height: 32 }}
          aria-hidden
        >
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
        </svg>
      ) : (
        <div className="kpi-trend">No data yet</div>
      )}
    </div>
  );
}

/* ─────────────── Theme picker ─────────────── */

function ThemePicker({
  current,
  open,
  onToggle,
  onPick,
  onClose,
}: {
  current: ThemeId;
  open: boolean;
  onToggle: () => void;
  onPick: (id: ThemeId) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Close on Escape and on outside click. Standard popover behavior.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="icon-btn"
        onClick={onToggle}
        title="Theme"
        aria-label="Theme picker"
        aria-expanded={open}
      >
        <PaletteIcon />
      </button>
      {open && (
        <div className="theme-popover" role="menu">
          <div className="theme-popover-title">Theme</div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === current}
              className={`theme-option ${t.id === current ? "active" : ""}`}
              onClick={() => onPick(t.id)}
            >
              <span className="theme-swatch" aria-hidden>
                <span style={{ background: t.swatch.bg }} />
                <span style={{ background: t.swatch.card }} />
                <span style={{ background: t.swatch.fg }} />
                <span style={{ background: t.swatch.accent }} />
              </span>
              <span className="theme-meta">
                <span className="theme-name">{t.label}</span>
                <span className="theme-desc">{t.description}</span>
              </span>
              {t.id === current && (
                <span className="theme-check" aria-hidden>
                  <Icon.Check />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaletteIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.937.748-1.688 1.689-1.688h1.996c3.082 0 5.542-2.493 5.542-5.62C22 6.667 17.522 2 12 2z" />
    </svg>
  );
}

/* ─────────────── widget definitions for DashboardLayoutGrid ─────────────── */

function businessWidgets(business: ServiceData | undefined): WidgetDef[] {
  if (!business || business.status === "unconfigured") {
    // Single-tile fallback. Spans the full row via .kpi-card.unconfigured.
    return [
      {
        id: "kpi.unconfigured",
        label: "Unconfigured user metrics",
        render: () => <KpiUnconfigured message={business?.message} />,
      },
    ];
  }
  const d = business.data ?? {};
  const total = Number(d.totalUsers ?? 0);
  const today = Number(d.todaySignups ?? 0);
  const week = Number(d.weekSignups ?? 0);
  const items = Number(d.items ?? 0);
  const holdings = Number(d.holdings ?? 0);
  return [
    {
      id: "kpi.totalUsers",
      label: "Total users",
      render: () => (
        <KpiCard
          label="Total users"
          value={total.toLocaleString()}
          icon={<Icon.Users />}
          trend={week > 0 ? `+${week} this week` : undefined}
          tone="primary"
        />
      ),
    },
    {
      id: "kpi.todaySignups",
      label: "Today's signups",
      render: () => (
        <KpiCard
          label="Today's signups"
          value={today.toLocaleString()}
          icon={<Icon.TrendUp />}
          trend={today > 0 ? "Good day" : "Quiet so far"}
          tone={today > 0 ? "positive" : "muted"}
        />
      ),
    },
    {
      id: "kpi.connectedBrokerages",
      label: "Connected brokerages",
      render: () => (
        <KpiCard
          label="Connected brokerages"
          value={items.toLocaleString()}
          icon={<Icon.Briefcase />}
          trend={total > 0 ? `${(items / total).toFixed(1)} per user avg` : undefined}
        />
      ),
    },
    {
      id: "kpi.totalHoldings",
      label: "Total holdings tracked",
      render: () => (
        <KpiCard
          label="Total holdings tracked"
          value={holdings.toLocaleString()}
          icon={<Icon.Layers />}
          trend={total > 0 ? `${(holdings / total).toFixed(0)} per user avg` : undefined}
        />
      ),
    },
    // ───── Hidden-by-default extras (toggle on via Add widget panel)
    {
      id: "kpi.avgHoldings",
      label: "Avg holdings per user",
      defaultHidden: true,
      render: () => (
        <KpiCard
          label="Avg holdings per user"
          value={String(d.avgHoldingsPerUser ?? 0)}
          icon={<Icon.Layers />}
          trend={
            holdings > 0 && total > 0
              ? `${holdings.toLocaleString()} ÷ ${total.toLocaleString()}`
              : "Need users + holdings"
          }
        />
      ),
    },
    {
      id: "kpi.activeUsers7d",
      label: "Active users (7d)",
      defaultHidden: true,
      render: () => {
        const n = Number(d.activeUsers7d ?? 0);
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        return (
          <KpiCard
            label="Active users (7d)"
            value={n.toLocaleString()}
            icon={<Icon.Users />}
            trend={total > 0 ? `${pct}% of all users` : undefined}
            tone={pct >= 50 ? "positive" : "default"}
          />
        );
      },
    },
    {
      id: "kpi.syncSuccessRate",
      label: "Sync success rate (24h)",
      defaultHidden: true,
      render: () => {
        const pct = d.syncSuccessPct as number | null | undefined;
        const totalSyncs = Number(d.syncTotal24h ?? 0);
        const okSyncs = Number(d.syncOk24h ?? 0);
        return (
          <KpiCard
            label="Sync success rate (24h)"
            value={pct === null || pct === undefined ? "—" : `${pct}%`}
            icon={<Icon.Activity />}
            trend={
              totalSyncs > 0
                ? `${okSyncs} ok / ${totalSyncs} total`
                : "No syncs in 24h"
            }
            tone={
              pct === null || pct === undefined
                ? "muted"
                : pct >= 95
                  ? "positive"
                  : pct >= 80
                    ? "default"
                    : "muted"
            }
          />
        );
      },
    },
    {
      id: "kpi.topBroker",
      label: "Top broker",
      defaultHidden: true,
      render: () => (
        <KpiCard
          label="Top broker"
          value={String(d.topBrokerName ?? "—")}
          icon={<Icon.Briefcase />}
          trend={
            d.topBrokerCount
              ? `${d.topBrokerCount} connection${d.topBrokerCount === 1 ? "" : "s"}`
              : "No connections yet"
          }
        />
      ),
    },
    {
      id: "kpi.signupSparkline",
      label: "New users (30d)",
      defaultHidden: true,
      render: () => {
        const points =
          (d.signupSparkline as Array<{ day: string; n: number }> | undefined) ??
          [];
        const total30 = points.reduce((sum, p) => sum + p.n, 0);
        return (
          <SignupSparkCard total={total30} points={points} />
        );
      },
    },
    {
      id: "kpi.errorRate",
      label: "Errors (1h)",
      defaultHidden: true,
      render: () => {
        const n = Number(d.errorRate1h ?? 0);
        return (
          <KpiCard
            label="Errors (1h)"
            value={n.toLocaleString()}
            icon={<Icon.AlertTriangle />}
            trend={n === 0 ? "All clear" : "5xx responses"}
            tone={n === 0 ? "positive" : "muted"}
          />
        );
      },
    },
  ];
}

function tierWidgets(s: NonNullable<OpsPayload["services"]>): WidgetDef[] {
  return [
    {
      id: "tier.neon",
      label: "Database (Neon)",
      render: () => (
        <InfraCard
          icon={<Icon.Database />}
          title="Database (Neon)"
          subtitle="All app data"
          status={s.neon?.status}
          hero={String(s.neon?.data?.storageHuman ?? "—")}
          progress={{
            value: neonPct(s.neon),
            label: "3 GB free tier",
          }}
          metrics={[
            {
              label: "Compute (this hour)",
              value: `${s.neon?.data?.computeHours ?? 0} CU-h`,
              sub: "100 CU-h / month free",
            },
            {
              label: "Branches",
              value: String(s.neon?.data?.branches ?? "—"),
            },
            {
              label: "Postgres version",
              value: String(s.neon?.data?.pgVersion ?? "—"),
            },
          ]}
          link="https://console.neon.tech"
          linkLabel="Neon"
        />
      ),
    },
    {
      id: "tier.upstash",
      label: "Cache (Vercel Redis)",
      render: () => (
        <InfraCard
          icon={<Icon.Layers />}
          title="Cache (Vercel Redis)"
          subtitle="Speeds up sessions + sync jobs"
          status={s.upstash?.status}
          hero={fmtNumber(s.upstash?.data?.commandsToday)}
          progress={{
            value: upstashPct(s.upstash),
            label: "500,000 commands / day",
          }}
          metrics={[
            {
              label: "Keys stored",
              value: fmtNumber(s.upstash?.data?.keys),
            },
            {
              label: "Bandwidth today",
              value: bytesH(s.upstash?.data?.bandwidthBytes),
            },
          ]}
          link="https://vercel.com/dashboard/stores"
          linkLabel="Vercel"
        />
      ),
    },
  ];
}

function activityWidgets(s: NonNullable<OpsPayload["services"]>): WidgetDef[] {
  return [
    {
      id: "activity.commits",
      label: "Recent commits",
      render: () => (
        <ActivityCard
          icon={<Icon.GitCommit />}
          title="Recent commits"
          status={s.github?.status === "error" ? "warn" : s.github?.status}
          events={
            (s.github?.data?._events as
              | Array<{ title: string; time?: string }>
              | undefined) ?? undefined
          }
          errorMessage={
            s.github?.status === "error"
              ? "GitHub rate-limited — add a GITHUB_TOKEN env var to fix."
              : undefined
          }
          link="https://github.com/kazoosa/Beacon/commits/main"
          linkLabel="GitHub"
        />
      ),
    },
    {
      id: "activity.deploys",
      label: "Recent backend deploys",
      render: () => (
        <ActivityCard
          icon={<Icon.Server />}
          title="Recent backend deploys"
          status={s.render?.status}
          events={
            (s.render?.data?._events as
              | Array<{ title: string; time?: string }>
              | undefined) ?? undefined
          }
          link="https://dashboard.render.com"
          linkLabel="Render"
        />
      ),
    },
    {
      id: "activity.signups",
      label: "Latest signups",
      render: () => (
        <ActivityCard
          icon={<Icon.Users />}
          title="Latest signups"
          status={s.business?.status}
          events={
            (s.business?.data?._recentSignups as
              | Array<{ title: string; time?: string }>
              | undefined) ?? undefined
          }
          emptyMessage="No signups yet. First one will show up here."
        />
      ),
    },
  ];
}

function selfTestWidgets(
  s: NonNullable<OpsPayload["services"]>,
  onRerun: () => Promise<void> | void,
  rerunning: boolean,
): WidgetDef[] {
  return [
    {
      id: "selftest.battery",
      label: "Self-test battery",
      render: () => (
        <SelfTestCard
          service={s.selftest}
          onRerun={onRerun}
          rerunning={rerunning}
        />
      ),
    },
  ];
}

function healthWidgets(s: NonNullable<OpsPayload["services"]>): WidgetDef[] {
  return [
    {
      id: "health.app",
      label: "Beacon App",
      render: () => (
        <InfraCard
          icon={<Icon.Globe />}
          title="Beacon App"
          subtitle="Users can sign in and use it"
          status={s.health?.status}
          hero={
            s.health?.data?.latencyMs
              ? `${s.health.data.latencyMs} ms`
              : s.health?.data?.ok
                ? "Healthy"
                : "Down"
          }
          heroSub={`${speedLabel(s.health?.data?.latencyMs as number | undefined)} response`}
          metrics={[
            {
              label: "Environment",
              value: String(s.health?.data?.environment ?? "—"),
            },
          ]}
          link="https://stats.uptimerobot.com/yo9bjqio7P"
          linkLabel="Uptime history"
        />
      ),
    },
    {
      id: "health.backend",
      label: "Backend server",
      render: () => (
        <InfraCard
          icon={<Icon.Server />}
          title="Backend server"
          subtitle="Login, data, brokerage sync"
          status={s.render?.status}
          hero={String(s.render?.data?.["last deploy"] ?? renderHero(s.render))}
          heroSub={
            String(s.render?.data?.["last change"] ?? "")
            || `${renderHero(s.render).toLowerCase()} on Render`
          }
          metrics={[
            {
              label: "Region",
              value: String(s.render?.data?.region ?? "—"),
            },
          ]}
          link="https://dashboard.render.com"
          linkLabel="Render"
        />
      ),
    },
    {
      id: "health.dbhealth",
      label: "Database health",
      defaultHidden: true,
      render: () => {
        const dh = (s as Record<string, ServiceData | undefined>).dbhealth;
        const ping = Number(dh?.data?.pingMs ?? 0);
        const total = Number(dh?.data?.totalMs ?? 0);
        return (
          <InfraCard
            icon={<Icon.Database />}
            title="Database health"
            subtitle="Live query latency from the ops endpoint"
            status={dh?.status}
            hero={dh?.data?.pingMs ? `${ping} ms ping` : "—"}
            heroSub={
              total
                ? `${total} ms across 3 queries`
                : "Connect a DB to populate"
            }
            metrics={[
              {
                label: "Public tables",
                value: String(dh?.data?.publicTables ?? "—"),
              },
              {
                label: "Biggest table",
                value: String(dh?.data?.biggestTable ?? "—"),
                sub: dh?.data?.biggestTableRows
                  ? `${Number(dh.data.biggestTableRows).toLocaleString()} rows`
                  : undefined,
              },
            ]}
          />
        );
      },
    },
    {
      id: "health.websites",
      label: "Websites",
      render: () => (
        <InfraCard
          icon={<Icon.Globe />}
          title="Websites"
          subtitle="What your users see"
          status={s.vercel?.status}
          hero={vercelHero(s.vercel)}
          heroSub="Last deploy synced"
          metrics={vercelMetrics(s.vercel)}
          link="https://vercel.com/dashboard"
          linkLabel="Vercel"
        />
      ),
    },
  ];
}
