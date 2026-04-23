import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Home, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { BeaconMark } from "../components/BeaconMark";
import { APP_NAME } from "../lib/brand";

/**
 * /demo — signs the visitor in as the demo account.
 *
 * Before attempting login we fetch /api/demo/status, a public no-auth
 * diagnostic endpoint that reports whether the backend is reachable
 * and whether the demo account actually has data. If the status call
 * fails, or reports zero investment holdings, we STOP and render a
 * visible error panel instead of silently navigating the user into an
 * empty dashboard. Every previous "the demo doesn't load" report was
 * because we ate the failure and navigated anyway. No more.
 */

const DEMO_EMAIL = "demo@finlink.dev";
const DEMO_PASSWORD = "demo1234";
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

type Stage = "checking" | "logging-in" | "ok" | "error";

interface DemoStatus {
  demoDeveloperExists: boolean;
  applicationCount: number;
  itemCount: number;
  investmentHoldingCount: number;
  investmentTransactionCount: number;
  institutionCount: number;
  securityCount: number;
  serverTimeMs: number;
  environment: string;
}

export function DemoPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("checking");
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>("");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Belt + braces: blow away any stored auth BEFORE the pre-flight so
    // stale JWTs from a recreated demo developer or a rotated
    // JWT_SECRET can't leak into the /app page below. The subsequent
    // login() writes a fresh session to the same key.
    try {
      localStorage.removeItem("finlink_auth");
    } catch { /* SSR / private mode — ignore */ }

    let cancelled = false;

    (async () => {
      // Phase 1 — reach the backend and check demo-data health.
      let s: DemoStatus | null = null;
      try {
        setStage("checking");
        const r = await fetch(`${API}/api/demo/status`, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) {
          throw new Error(`Status endpoint returned HTTP ${r.status}`);
        }
        s = (await r.json()) as DemoStatus;
        if (cancelled) return;
        setStatus(s);
      } catch (err) {
        if (cancelled) return;
        setErrorTitle("Can't reach the backend.");
        setErrorDetail(
          err instanceof Error
            ? err.message
            : "Fetch to /api/demo/status failed with an unknown error.",
        );
        setStage("error");
        return;
      }

      // Fail fast on an empty demo — don't log the user into nothing.
      if (!s.demoDeveloperExists) {
        setErrorTitle("The demo account doesn't exist on this backend.");
        setErrorDetail(
          "This usually means the boot-time seed never ran. Check the Koyeb logs for [seedIfEmpty] output.",
        );
        setStage("error");
        return;
      }
      if (s.investmentHoldingCount === 0) {
        setErrorTitle("The demo account has no portfolio data.");
        setErrorDetail(
          `The backend is reachable but the demo seed didn't produce any holdings. itemCount=${s.itemCount}, institutionCount=${s.institutionCount}, securityCount=${s.securityCount}. Check Koyeb logs for [demoSeed] output.`,
        );
        setStage("error");
        return;
      }

      // Phase 2 — always sign in. We deliberately ignore any pre-existing
      // session: if the demo developer was re-created on the backend (e.g.
      // after a `prisma db push --accept-data-loss`) the existing JWT
      // references a developer ID that no longer exists, and the dashboard
      // silently renders an empty portfolio. A fresh login guarantees the
      // token matches the current demo developer.
      try {
        setStage("logging-in");
        await login(DEMO_EMAIL, DEMO_PASSWORD);
      } catch (err) {
        if (cancelled) return;
        setErrorTitle("Demo login failed.");
        setErrorDetail(
          err instanceof Error && err.message
            ? err.message
            : "POST /api/auth/login rejected the demo credentials.",
        );
        setStage("error");
        return;
      }

      if (cancelled) return;
      setStage("ok");
      navigate("/app", { replace: true });
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stripe-shell min-h-screen flex flex-col">
      <header
        className="relative z-10 border-b"
        style={{
          borderColor: "var(--stripe-hairline)",
          backgroundColor: "rgba(249, 248, 246, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div className="max-w-[1111px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-[var(--stripe-ink)]">
            <BeaconMark size={22} />
            <span className="font-semibold tracking-tight text-[15px]">{APP_NAME}</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-[var(--stripe-ink-muted)] hover:text-[var(--stripe-ink)] transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Back to site
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[560px] text-center">
          {stage === "error" ? (
            <ErrorPanel
              title={errorTitle}
              detail={errorDetail}
              api={API}
              status={status}
            />
          ) : (
            <>
              <div className="stripe-chip mb-6 mx-auto">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--stripe-accent)] animate-pulse" />
                {stage === "checking" ? "Checking demo" : "Signing in"}
              </div>
              <h1 className="stripe-display text-[36px] sm:text-[48px] leading-[1.04] tracking-[-0.018em] text-[var(--stripe-ink)]">
                {stage === "checking"
                  ? "Reaching the demo server…"
                  : "Warming up a portfolio for you."}
              </h1>
              <p className="mt-5 text-[15px] leading-[1.6] text-[var(--stripe-ink-muted)]">
                {stage === "checking"
                  ? "Waking up the free-tier backend and checking demo data. First visit after an idle period can take up to 20s."
                  : "Signing you in. The dashboard will load in a moment."}
              </p>
              <div className="mt-8 flex justify-center">
                <Spinner />
              </div>
              <p className="mt-8 text-[12px] text-[var(--stripe-ink-faint)]">
                Read-only account. Nothing you do here touches real money.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------- Error UI */

function ErrorPanel({
  title, detail, api, status,
}: {
  title: string;
  detail: string;
  api: string;
  status: DemoStatus | null;
}) {
  return (
    <div className="text-left">
      <div
        className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-[0.14em]"
        style={{
          backgroundColor: "#fff2f0",
          color: "#a01818",
          border: "1px solid #f5cac4",
        }}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        Demo unavailable
      </div>
      <h1 className="stripe-display text-[28px] sm:text-[36px] leading-[1.08] tracking-[-0.018em] text-[var(--stripe-ink)] mb-3">
        {title}
      </h1>
      <p className="text-[14px] leading-[1.6] text-[var(--stripe-ink-muted)] mb-6">
        {detail}
      </p>

      {/* Diagnostic card — copyable info for a bug report */}
      <div
        className="rounded-xl border p-4 sm:p-5 mb-6 font-mono text-[12px] leading-[1.6] overflow-auto"
        style={{
          backgroundColor: "var(--stripe-surface-raised)",
          borderColor: "var(--stripe-hairline)",
          color: "var(--stripe-ink)",
        }}
      >
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--stripe-ink-faint)] mb-2">
          Diagnostics
        </div>
        <div><span className="text-[var(--stripe-ink-faint)]">API:</span> {api}</div>
        {status ? (
          <pre className="mt-2 whitespace-pre-wrap break-words">
            {JSON.stringify(status, null, 2)}
          </pre>
        ) : (
          <div className="mt-2 text-[var(--stripe-ink-faint)]">
            /api/demo/status never responded — likely a CORS issue, a cold-start timeout, or the
            backend is down. Open the Network tab for details.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="stripe-btn-primary inline-flex items-center gap-1.5 text-[14px]"
        >
          Retry
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <a
          href={`${api}/api/demo/status`}
          target="_blank"
          rel="noopener noreferrer"
          className="stripe-btn-ghost inline-flex items-center gap-1.5 text-[14px]"
        >
          Open /api/demo/status
        </a>
        <Link to="/" className="stripe-btn-ghost inline-flex items-center gap-1.5 text-[14px]">
          Back to site
        </Link>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 36 36"
      aria-hidden
      className="animate-spin text-[var(--stripe-accent)]"
      style={{ animationDuration: "900ms" }}
    >
      <circle cx={18} cy={18} r={14} stroke="currentColor" strokeOpacity={0.15} strokeWidth={3} fill="none" />
      <path
        d="M18 4 A14 14 0 0 1 32 18"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
