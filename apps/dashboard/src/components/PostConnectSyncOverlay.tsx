import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "./money";
import { APP_NAME } from "../lib/brand";

// Lazy-load the 3D scene so its ~150KB three.js bundle only ships
// when the overlay actually mounts. The rest of the dashboard never
// pays the bundle cost.
const SpaceScene = lazy(() => import("./SpaceScene"));

/** Detect prefers-reduced-motion at module scope so we don't re-query
 *  per render. We DO re-evaluate on each overlay open via the hook
 *  below, in case the user toggled the setting between sessions. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

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
    /** Phase 2: foreground sync returned 0 transactions and the overlay
     *  is now polling SnapTrade waiting for the broker-side cache to
     *  warm. Bar holds at 40%, count-up timer + rotating context copy.
     *  The escape hatch button appears after 10 minutes (see `onSkipWait`). */
    waitingForBroker?: boolean;
    /** Phase 3: poll returned a non-zero count, the backend is now
     *  writing those transactions to the DB. Bar quickly animates from
     *  40% → 100% over the (short) write window. Set true the moment
     *  the parent sees `transactionsAdded > 0`; cleared when ready
     *  flips true. */
    writing?: boolean;
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

// Per-step weight contribution to overall progress. Sum to 40 — the
// progress bar reaches 40% by the end of Phase 1 (initial sync),
// holds there through Phase 2 (broker wait, which is a known-unknown
// duration so we don't fake-advance), then animates 40→100 during
// Phase 3 (DB writes). The old "fill to 90% during wait" pattern
// was dishonest and felt jarring when the bar reset.
//   connecting   5
//   accounts     5   (cumulative 10)
//   holdings    10   (cumulative 20)
//   transactions 20  (cumulative 40)
const STEP_WEIGHTS: Record<StepKey, number> = {
  connecting: 5,
  accounts: 5,
  holdings: 10,
  transactions: 20,
};

const STEP_ORDER: StepKey[] = ["connecting", "accounts", "holdings", "transactions"];

/**
 * Three phases the bar honors:
 *   Phase 1 (initial sync)        → fills to 40%
 *   Phase 2 (waiting for broker)  → holds at 40% (no fake advance)
 *   Phase 3 (writing transactions) → 40% → 100%
 *   Phase 4 (ready)               → 100%
 */
function targetPercent(steps: Steps, ready: boolean): number {
  if (ready) return 100;
  if (steps.transactions.writing) return 100; // Phase 3 — animate to 100 over short window
  if (steps.transactions.waitingForBroker) return 40; // Phase 2 — hold
  // Phase 1 — sum of completed step weights, with half-credit for the
  // active step so the bar isn't frozen between checkpoints.
  let pct = 0;
  for (const k of STEP_ORDER) {
    const s = steps[k];
    if (s.state === "done" || s.state === "error") {
      pct += STEP_WEIGHTS[k];
    } else if (s.state === "in_progress") {
      pct += STEP_WEIGHTS[k] / 2;
      break;
    } else {
      break;
    }
  }
  return Math.min(40, pct);
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
      if (s.writing) {
        const n = s.count ?? 0;
        return `Writing ${n} transaction${n === 1 ? "" : "s"}…`;
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

/** Format the count-up timer shown during Phase 2 (broker wait).
 *  Under 60s shows seconds; over 60s shows M:SS. */
function fmtCountUp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `0:${s.toString().padStart(2, "0")}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Rotating context copy below the count-up timer. Honest about
 *  what's happening at each stage of the wait — no fake numbers. */
function waitContextCopy(elapsedSeconds: number): string {
  if (elapsedSeconds < 30) return "Connecting to your broker…";
  if (elapsedSeconds < 90) return "Your broker is preparing your transaction history…";
  if (elapsedSeconds < 180) return "Robinhood typically takes 1–3 minutes on first connect — you're almost there.";
  return "This is taking longer than usual. Still working — some brokers are slow on first connect.";
}

/** Phase 3 ETA: only shown while we're writing rows to the DB. We
 *  estimate from the elapsed write time and a rolling rate. Guards
 *  every edge case (NaN, zero, negative). */
function fmtPhase3Eta(remainingSeconds: number): string {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
    return "Almost done…";
  }
  if (remainingSeconds < 5) return "Almost done…";
  if (remainingSeconds < 60) {
    return `About ${Math.round(remainingSeconds)} seconds remaining`;
  }
  const m = Math.round(remainingSeconds / 60);
  return `About ${m} minute${m === 1 ? "" : "s"} remaining`;
}

export function PostConnectSyncOverlay({
  open,
  steps,
  elapsedSeconds,
  onClose,
  ready,
  onSkipWait,
}: Props) {
  // Phase derivation — see the doc on `Steps` for what each flag means.
  // Phase 1 = !waitingForBroker && !writing && !ready
  // Phase 2 = waitingForBroker && !ready
  // Phase 3 = writing && !ready
  // Phase 4 = ready
  const writing = Boolean(steps.transactions.writing) && !ready;
  const waitingForBroker =
    Boolean(steps.transactions.waitingForBroker) && !ready && !writing;
  // Escape hatch only during Phase 2, after 10 minutes.
  const showEscapeHatch =
    waitingForBroker && elapsedSeconds >= 600 && !!onSkipWait;

  // Reduced motion: skip the 3D scene entirely. Falls back to the
  // gradient + blur backdrop the previous version used.
  const reducedMotion = usePrefersReducedMotion();
  const sceneActive = (waitingForBroker || writing) && !reducedMotion;

  // Force re-render every second so the count-up timer + rotating
  // copy + ETA recompute without the parent pushing updates.
  const [, force] = useState(0);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  // Track when Phase 2 started so the count-up timer ticks from 0
  // when the wait begins, not from when the user opened the overlay.
  const phase2StartRef = useRef<number | null>(null);
  useEffect(() => {
    if (waitingForBroker && phase2StartRef.current === null) {
      phase2StartRef.current = Date.now();
    }
    if (!waitingForBroker) {
      phase2StartRef.current = null;
    }
  }, [waitingForBroker]);
  const phase2Seconds = useMemo(() => {
    if (!waitingForBroker || phase2StartRef.current === null) return 0;
    return Math.floor((Date.now() - phase2StartRef.current) / 1000);
    // Re-runs on the per-second force-render above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForBroker, force]);

  // Track when Phase 3 (writing) started so we can compute a real
  // ETA from elapsed / progress. The DB writes are 3-4s for ~900
  // rows so the ETA mostly says "Almost done…" — but we still
  // compute it correctly so the math holds for larger first-syncs.
  const phase3StartRef = useRef<number | null>(null);
  useEffect(() => {
    if (writing && phase3StartRef.current === null) {
      phase3StartRef.current = Date.now();
    }
    if (!writing) {
      phase3StartRef.current = null;
    }
  }, [writing]);

  // Animated bar: ease the displayed percent toward the target. The
  // 0.18 per-frame catch-up is fast enough that big jumps (0→40,
  // 40→100) feel responsive and small ones are smooth. Phase 2's
  // hold at 40% means the bar literally doesn't move during the
  // broker wait — by design, no fake advance.
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

  // Galaxy fly-through HUD hint — fades out 10s after the scene
  // activates so it doesn't distract once the user has the gist.
  const [hintVisible, setHintVisible] = useState(true);
  useEffect(() => {
    if (!sceneActive) {
      setHintVisible(true);
      return;
    }
    const t = window.setTimeout(() => setHintVisible(false), 10_000);
    return () => window.clearTimeout(t);
  }, [sceneActive]);

  if (!open) return null;

  // Phase 3 ETA. We model the bar as advancing 40 → 100 over the
  // write window: progress along that 60-point span is
  // (displayPct - 40) / 60. ETA = elapsed / progress - elapsed.
  let phase3EtaText = "";
  if (writing && phase3StartRef.current !== null) {
    const elapsedMs = Date.now() - phase3StartRef.current;
    const elapsedSec = elapsedMs / 1000;
    const progress = Math.max(0, (displayPct - 40) / 60);
    if (progress < 0.05 || elapsedSec < 1) {
      phase3EtaText = "Almost done…";
    } else {
      const total = elapsedSec / progress;
      const remaining = total - elapsedSec;
      phase3EtaText = fmtPhase3Eta(remaining);
    }
  }

  // Backdrop choice: scene takes over when active. The card sits on
  // top either way and keeps its drop shadow.
  const backdropStyle = sceneActive
    ? { background: "#020818" }
    : {
        background:
          "radial-gradient(circle at 50% 35%, rgb(var(--bg-base) / 0.85), rgb(var(--bg-base) / 0.96))",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)" as string,
      };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Syncing your brokerage"
      aria-live="polite"
      className={`fixed inset-0 z-[100] grid place-items-center p-4 ${
        fadingOut ? "animate-fade-out" : "animate-fade-in"
      }`}
      style={backdropStyle}
    >
      {sceneActive && (
        <Suspense fallback={null}>
          <SpaceScene />
        </Suspense>
      )}

      {/* HUD watermark — top-left, very faint, sci-fi-film vibe.
          Stays up the whole time the scene is active so it reads as
          part of the visual identity, not a transient label. */}
      {sceneActive && (
        <div
          className="absolute top-4 left-4 z-[1] text-white pointer-events-none font-num tracking-[0.4em] uppercase"
          style={{
            opacity: 0.18,
            fontSize: 11,
          }}
          aria-hidden
        >
          {APP_NAME}
        </div>
      )}

      {/* Bottom-right hint with the controls reference. Fades after
          10 seconds so it doesn't distract longer-running waits. */}
      {sceneActive && (
        <div
          className="absolute bottom-4 right-4 z-[1] text-white pointer-events-none transition-opacity duration-1000"
          style={{
            opacity: hintVisible ? 0.45 : 0,
            fontSize: 12,
          }}
          aria-hidden
        >
          drag to look around • scroll to adjust speed • double-click to warp
        </div>
      )}

      <div
        className="card w-full max-w-md overflow-hidden animate-scale-in relative z-[1]"
        style={{
          boxShadow:
            "0 24px 60px -12px rgb(0 0 0 / 0.45), 0 8px 20px -6px rgb(0 0 0 / 0.25)",
        }}
      >
        {/* Progress bar. During Phase 2 we hold at 40% with a pulse
            (no shimmer — that would fake forward motion the wait
            doesn't have). During phases 1/3 the shimmer reads as
            "actively making progress." */}
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
              : writing
                ? "Loading your transactions into the dashboard…"
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
              of waiting" into "2 minutes of seeing your real data." */}
          {waitingForBroker && <PortfolioPreview />}

          {/* Footer area: phase-specific copy. */}
          <div className="mt-5 pt-4 border-t border-border-subtle space-y-3">
            {waitingForBroker ? (
              // Phase 2: count-up timer + rotating context copy. No ETA.
              <>
                <div className="flex flex-col items-center text-center gap-1.5">
                  <div
                    className="font-num tabular-nums text-2xl text-fg-secondary"
                    aria-label={`Waiting ${phase2Seconds} seconds`}
                  >
                    Waiting… {fmtCountUp(phase2Seconds)}
                  </div>
                  <div className="text-[11px] text-fg-muted leading-relaxed max-w-sm">
                    {waitContextCopy(phase2Seconds)}
                  </div>
                </div>
                {showEscapeHatch && (
                  <div className="pt-1">
                    <p className="text-[11px] text-fg-muted mb-2 leading-relaxed text-center">
                      Still waiting after {Math.round(phase2Seconds / 60)} minutes.
                      You can continue without transactions and we'll load them
                      in the background — but expect them to take a while
                      longer to appear.
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
            ) : writing ? (
              // Phase 3: real ETA computed from elapsed / progress.
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-fg-muted">{phase3EtaText}</span>
                <span className="text-fg-fainter font-num tabular-nums">
                  {Math.round(displayPct)}%
                </span>
              </div>
            ) : ready ? (
              <div className="text-[11px] text-fg-muted text-center">
                Wrapping up…
              </div>
            ) : (
              // Phase 1: simple step list above is enough — no ETA, no
              // timer. This phase resolves in 5-15s.
              <div className="text-[11px] text-fg-muted text-center">
                {fmtElapsed(elapsedSeconds)}
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
