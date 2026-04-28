import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "./money";

/**
 * Premium full-screen sync overlay shown after a brokerage connection
 * completes. Drives a smooth animated progress bar plus per-step
 * status rows. Auto-dismisses when the sync fully resolves; the
 * caller doesn't need a Continue button — the overlay closes itself
 * once everything is in.
 *
 * Progress mapping (from the spec):
 *   connecting done       → 10%
 *   accounts done         → 25%
 *   holdings done         → 50%
 *   transactions done     → 90%   (or poller started)
 *   ready (sync resolved) → 100% → hold 500ms → fade out
 *
 * The bar animates between the discrete checkpoints rather than
 * snapping, so the user sees continuous motion. ETA below the steps
 * is recomputed from elapsed/percent each second.
 */

export type StepKey = "connecting" | "accounts" | "holdings" | "transactions";

export type StepState = "pending" | "in_progress" | "done" | "error";

interface Steps {
  connecting: { state: StepState };
  accounts: { state: StepState; count?: number };
  holdings: { state: StepState; count?: number };
  /** transactions can carry a retry attempt counter (1 of 3, 2 of 3...) */
  transactions: {
    state: StepState;
    count?: number;
    attempt?: number;
    maxAttempts?: number;
    /** True when the foreground sync returned 0 transactions and the
     *  overlay is now polling SnapTrade in a tight loop, waiting for
     *  the broker-side cache to warm. The bar locks at 90% with a
     *  pulse, the copy switches to "Waiting for your broker…", and
     *  the user stays on the overlay. The escape hatch only appears
     *  after 10 minutes (see `onSkipWait` below). */
    waitingForBroker?: boolean;
  };
}

interface Props {
  open: boolean;
  steps: Steps;
  /** Total elapsed seconds — kept by the parent so we can
   *  acknowledge particularly long syncs honestly. */
  elapsedSeconds: number;
  /** Hide. Called automatically once the auto-dismiss timer fires;
   *  the parent uses it to flip overlayOpen back to false. */
  onClose: () => void;
  /** True when every step is done (or errored). When true we hold
   *  at 100% for 500ms then fade out. */
  ready: boolean;
  /** Called when the user clicks "Continue without transactions"
   *  — the escape-hatch button shown only after 10 minutes of
   *  waiting for the broker-side cache. The parent stops the
   *  poll loop and dismisses the overlay. */
  onSkipWait?: () => void;
}

// Per-step weight contribution to overall progress. Sum to 100.
//   connecting   10
//   accounts     15  (cumulative 25)
//   holdings     25  (cumulative 50)
//   transactions 40  (cumulative 90 — the last 10 is "wrap up & resolve")
const STEP_WEIGHTS: Record<StepKey, number> = {
  connecting: 10,
  accounts: 15,
  holdings: 25,
  transactions: 40,
};

const STEP_ORDER: StepKey[] = ["connecting", "accounts", "holdings", "transactions"];

function targetPercent(steps: Steps, ready: boolean): number {
  if (ready) return 100;
  // Waiting on the broker-side cache: hold at 90 (everything before
  // transactions is done; transactions are pending the broker). The
  // bar pulses on top of this constant — see WaitingPulse below.
  if (steps.transactions.waitingForBroker) return 90;
  let pct = 0;
  for (const k of STEP_ORDER) {
    const s = steps[k];
    if (s.state === "done" || s.state === "error") {
      pct += STEP_WEIGHTS[k];
    } else if (s.state === "in_progress") {
      // Show partial credit for the active step so the bar isn't
      // frozen between checkpoints. Half the weight reads as
      // "we're working on this" without overpromising.
      pct += STEP_WEIGHTS[k] / 2;
      break;
    } else {
      break;
    }
  }
  return Math.min(100, pct);
}

function stepLabel(k: StepKey, step: Steps[StepKey]): string {
  const isDone = step.state === "done";
  const isProg = step.state === "in_progress";
  const isErr = step.state === "error";
  switch (k) {
    case "connecting":
      if (isDone) return "Connected to SnapTrade";
      if (isErr) return "Connection failed";
      return isProg ? "Connecting to SnapTrade…" : "Connect to SnapTrade";
    case "accounts": {
      const s = step as Steps["accounts"];
      if (isDone) {
        return `${s.count ?? 0} account${s.count === 1 ? "" : "s"} found`;
      }
      if (isErr) return "Couldn't list accounts";
      return isProg ? "Fetching accounts…" : "Fetch accounts";
    }
    case "holdings": {
      const s = step as Steps["holdings"];
      if (isDone) {
        return `${s.count ?? 0} holding${s.count === 1 ? "" : "s"} synced`;
      }
      if (isErr) return "Couldn't fetch holdings";
      return isProg ? "Fetching holdings…" : "Fetch holdings";
    }
    case "transactions": {
      const s = step as Steps["transactions"];
      if (isDone) {
        return `${s.count ?? 0} transaction${s.count === 1 ? "" : "s"} loaded`;
      }
      if (s.waitingForBroker) {
        return "Waiting for your broker to prepare transaction history…";
      }
      if (isErr) return "Couldn't pull transactions";
      if (isProg && s.attempt && s.maxAttempts && s.attempt > 1) {
        return `Pulling transactions… (retry ${s.attempt} of ${s.maxAttempts})`;
      }
      return isProg ? "Pulling transactions…" : "Pull transactions";
    }
  }
}

function fmtEta(seconds: number): string {
  if (seconds < 10) return "Almost done…";
  if (seconds < 60) return `Estimated time remaining: ~${Math.round(seconds)} seconds`;
  const m = Math.round(seconds / 60);
  return `Estimated time remaining: ~${m} minute${m === 1 ? "" : "s"}`;
}

export function PostConnectSyncOverlay({
  open,
  steps,
  elapsedSeconds,
  onClose,
  ready,
  onSkipWait,
}: Props) {
  const waitingForBroker = Boolean(steps.transactions.waitingForBroker) && !ready;
  // Escape hatch: 10 minutes is a long wait. Some brokers really do
  // take that long on first connect — but past that point the user
  // has earned the right to bail without losing their seat. Showing
  // the button earlier would tempt people into a worse experience
  // (no transactions visible) when waiting another minute would
  // have resolved the sync cleanly.
  const showEscapeHatch =
    waitingForBroker && elapsedSeconds >= 600 && !!onSkipWait;
  // Force re-render every second so the ETA + elapsed counter
  // recompute without needing the parent to push them.
  const [, force] = useState(0);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  // Animated bar: we keep a "displayed" percent in state and ease it
  // toward the target on every tick. This gives a continuous fill
  // rather than the bar jumping between 25/50/90/100. Eased at ~30%
  // per frame so big jumps still feel responsive (e.g. 0→25 lands in
  // <300ms) while the steady-state crawl is smooth.
  const targetPct = targetPercent(steps, ready);
  const [displayPct, setDisplayPct] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open) {
      setDisplayPct(0);
      return;
    }
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      setDisplayPct((cur) => {
        const diff = targetPct - cur;
        if (Math.abs(diff) < 0.1) return targetPct;
        return cur + diff * 0.18;
      });
      rafRef.current = window.requestAnimationFrame(tick);
    }
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [open, targetPct]);

  // Auto-dismiss: when ready flips true, hold the bar at 100% for
  // 500ms (so the user sees the completion state) then fade out for
  // 400ms before calling onClose. The fading state is local so the
  // parent can keep ready=true throughout.
  const [fadingOut, setFadingOut] = useState(false);
  useEffect(() => {
    if (!open) {
      setFadingOut(false);
      return;
    }
    if (!ready) return;
    // Wait for the displayed bar to actually reach 100 before we
    // start the dismiss countdown — otherwise a fast-completing
    // sync would dismiss before the user saw the bar fill.
    if (displayPct < 99.5) return;
    const holdMs = 500;
    const fadeMs = 400;
    const hold = window.setTimeout(() => setFadingOut(true), holdMs);
    const close = window.setTimeout(() => onClose(), holdMs + fadeMs);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(close);
    };
  }, [open, ready, displayPct, onClose]);

  if (!open) return null;

  // ETA = (elapsed / pct) * (100 - pct), expressed in seconds. Floors
  // at "Almost done…" once we're under 10s remaining or >=95% so the
  // last stretch doesn't read as misleading.
  const etaSeconds =
    displayPct >= 95 || displayPct < 5
      ? 0
      : (elapsedSeconds / displayPct) * (100 - displayPct);
  const etaText = ready
    ? "Wrapping up…"
    : displayPct < 5
      ? "Calculating…"
      : fmtEta(etaSeconds);

  const veryLong = elapsedSeconds >= 120 && !ready;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Syncing your brokerage"
      aria-live="polite"
      className={`fixed inset-0 z-[100] grid place-items-center p-4 ${
        fadingOut ? "animate-fade-out" : "animate-fade-in"
      }`}
      style={{
        background:
          "radial-gradient(circle at 50% 35%, rgb(var(--bg-base) / 0.85), rgb(var(--bg-base) / 0.96))",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <div
        className="card w-full max-w-md overflow-hidden animate-scale-in"
        style={{
          boxShadow:
            "0 24px 60px -12px rgb(0 0 0 / 0.45), 0 8px 20px -6px rgb(0 0 0 / 0.25)",
        }}
      >
        {/* Progress bar — anchored to the very top of the card. Two
            layers: a static track + the animated fill. While we're
            waiting on the broker-side cache the fill pulses
            (opacity oscillation) instead of using the marching
            shimmer — communicates "still happening, not stuck"
            without faking forward motion. */}
        <div className="relative h-1 bg-bg-overlay">
          <div
            className={`absolute inset-y-0 left-0 bg-fg-primary transition-[width] duration-150 ease-out ${
              waitingForBroker ? "animate-pulse" : ""
            }`}
            style={{ width: `${displayPct}%` }}
          >
            {!waitingForBroker && (
              <div
                className="absolute inset-0 opacity-60"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.35) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "beacon-shimmer 1.6s linear infinite",
                }}
              />
            )}
          </div>
        </div>

        <div className="p-6 md:p-7">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-base md:text-lg font-semibold text-fg-primary">
              {ready ? "All set" : "Syncing your brokerage"}
            </h2>
            <span className="text-[11px] text-fg-muted font-num tabular-nums mt-0.5">
              {Math.round(displayPct)}%
            </span>
          </div>
          <p className="text-xs text-fg-secondary mb-5 leading-relaxed">
            {ready
              ? "Your data is in. Returning you to the dashboard."
              : waitingForBroker
                ? "Your accounts and holdings are saved. Now we're waiting on your broker to release the transaction history — this can take a few minutes on first connect."
                : "Hang tight — we're pulling everything from your broker. This window will close on its own."}
          </p>

          {/* Steps */}
          <ol className="space-y-2.5">
            {STEP_ORDER.map((k) => (
              <StepRow key={k} stepKey={k} step={steps[k]} />
            ))}
          </ol>

          {/* Live portfolio preview — only while waiting on the broker.
              Accounts and holdings have already been written to the DB
              by the foreground sync; showing them here turns "2 minutes
              of waiting" into "2 minutes of seeing your real data."
              The broker-side wait for transactions stays untouched. */}
          {waitingForBroker && <PortfolioPreview />}

          {/* ETA / long-sync message */}
          <div className="mt-5 pt-4 border-t border-border-subtle space-y-3">
            {waitingForBroker ? (
              <>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-fg-muted">
                    Checking every 60 seconds — we'll dismiss this the
                    moment your transactions arrive.
                  </span>
                  <span className="text-fg-fainter font-num tabular-nums whitespace-nowrap">
                    {fmtElapsed(elapsedSeconds)}
                  </span>
                </div>
                {showEscapeHatch && (
                  <div className="pt-1">
                    <p className="text-[11px] text-fg-muted mb-2 leading-relaxed">
                      Still waiting after {Math.round(elapsedSeconds / 60)} minutes.
                      You can continue without transactions and we'll
                      load them in the background — but expect them to
                      take a while longer to appear.
                    </p>
                    <button
                      type="button"
                      onClick={onSkipWait}
                      className="btn-ghost text-[11px] w-full justify-center"
                    >
                      Continue without transactions
                    </button>
                  </div>
                )}
              </>
            ) : veryLong ? (
              <p className="text-[11px] text-fg-secondary leading-relaxed">
                <span className="font-semibold text-amber-500">
                  This is taking longer than usual.
                </span>{" "}
                Some brokers are slow on the first sync — Robinhood
                especially. Hang tight, we'll keep going until your
                data is in.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-fg-muted">{etaText}</span>
                <span className="text-fg-fainter font-num tabular-nums">
                  {fmtElapsed(elapsedSeconds)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Live portfolio preview shown inside the overlay while we're waiting
 * on the broker-side transaction cache. Accounts + holdings were
 * already written by the foreground sync, so we have real data to
 * display before transactions land — the user sees their portfolio
 * value and top holdings instead of staring at a pulsing bar.
 *
 * Pulls from the same /api/portfolio/summary + /api/portfolio/holdings
 * endpoints the Overview page uses; React Query caches this for the
 * Overview page, so the user lands on a warm cache when the overlay
 * dismisses.
 */
interface PortfolioSummary {
  total_value: number;
  connected_count: number;
  holdings_count: number;
}
interface PortfolioHolding {
  ticker_symbol: string;
  name: string;
  market_value: number;
  weight_pct: number;
}
function PortfolioPreview() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  // refetchInterval: hit the endpoints periodically while the
  // overlay is up. The numbers stabilise after the foreground sync
  // (which happened before this component mounted), but a small
  // refresh covers the case where the user kicks off a Refresh-now
  // from elsewhere or where post-sync option-quote refreshes change
  // values mid-wait.
  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: () => f<PortfolioSummary>("/api/portfolio/summary"),
    refetchInterval: 15_000,
    enabled: Boolean(accessToken),
  });
  const holdings = useQuery({
    queryKey: ["holdings"],
    queryFn: () => f<{ holdings: PortfolioHolding[] }>("/api/portfolio/holdings"),
    refetchInterval: 30_000,
    enabled: Boolean(accessToken),
  });

  const top = (holdings.data?.holdings ?? [])
    .filter((h) => h.market_value > 0)
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 3);

  // Loading state: while the very first /summary call is in flight,
  // show a small skeleton row instead of empty space — keeps the
  // card height stable as data arrives.
  if (!summary.data) {
    return (
      <div className="mt-5 pt-4 border-t border-border-subtle">
        <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-2">
          Your portfolio so far
        </div>
        <div className="h-7 rounded animate-pulse bg-bg-inset" />
      </div>
    );
  }

  return (
    <div className="mt-5 pt-4 border-t border-border-subtle">
      <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-2">
        Your portfolio so far
      </div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="font-num text-2xl font-semibold text-fg-primary tabular-nums">
          {fmtUsd(summary.data.total_value)}
        </div>
        <div className="text-[11px] text-fg-muted text-right leading-tight">
          {summary.data.connected_count} account
          {summary.data.connected_count === 1 ? "" : "s"}
          <br />
          {summary.data.holdings_count} holding
          {summary.data.holdings_count === 1 ? "" : "s"}
        </div>
      </div>
      {top.length > 0 && (
        <ul className="space-y-1">
          {top.map((h) => (
            <li
              key={h.ticker_symbol}
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="font-num font-medium text-fg-primary w-14">
                {h.ticker_symbol}
              </span>
              <span className="flex-1 truncate text-fg-secondary">
                {h.name}
              </span>
              <span className="font-num text-fg-secondary tabular-nums">
                {fmtUsd(h.market_value, { decimals: 0 })}
              </span>
              <span className="font-num text-fg-muted tabular-nums w-12 text-right">
                {h.weight_pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepRow({
  stepKey,
  step,
}: {
  stepKey: StepKey;
  step: Steps[StepKey];
}) {
  const label = stepLabel(stepKey, step);
  const Icon = stepIcon(step.state);
  const tone = stepTone(step.state);
  return (
    <li className="flex items-center gap-3">
      <div
        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center ${tone}`}
        aria-hidden
      >
        {Icon}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-[13px] leading-tight transition-colors ${
            step.state === "done"
              ? "text-fg-primary"
              : step.state === "in_progress"
                ? "text-fg-primary"
                : step.state === "error"
                  ? "text-rose-500"
                  : "text-fg-muted"
          }`}
        >
          {label}
        </div>
      </div>
    </li>
  );
}

function stepIcon(state: StepState) {
  if (state === "done") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="5 12 10 17 19 7" />
      </svg>
    );
  }
  if (state === "error") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    );
  }
  if (state === "in_progress") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="2.5"
        />
        <path
          d="M12 3 a9 9 0 0 1 9 9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function stepTone(state: StepState): string {
  switch (state) {
    case "done":
      return "text-emerald-500";
    case "error":
      return "text-rose-500";
    case "in_progress":
      return "text-sky-500";
    case "pending":
    default:
      return "text-fg-muted";
  }
}

function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s elapsed`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s elapsed`;
}
