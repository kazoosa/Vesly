import { useEffect, useRef, useState } from "react";

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
    /** True when the foreground sync returned with empty transactions
     *  but the background poller has been started — we treat that as
     *  "loaded enough to dismiss" so the user gets back into the app. */
    pollerStarted?: boolean;
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
  // Special case: transactions step kicked off the poller. The user
  // doesn't need to wait for the poller to finish before getting
  // back into the app, so treat poller-started as 90% complete and
  // let the parent flip ready=true to push to 100%.
  if (steps.transactions.pollerStarted && pct < 90) pct = 90;
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
      if (s.pollerStarted) {
        return "Transactions loading in background…";
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
}: Props) {
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
            layers: a static track + the animated fill. The fill has
            a subtle moving sheen on top to communicate liveness even
            when it's between checkpoints. */}
        <div className="relative h-1 bg-bg-overlay">
          <div
            className="absolute inset-y-0 left-0 bg-fg-primary transition-[width] duration-150 ease-out"
            style={{ width: `${displayPct}%` }}
          >
            <div
              className="absolute inset-0 opacity-60"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.35) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "beacon-shimmer 1.6s linear infinite",
              }}
            />
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
              : "Hang tight — we're pulling everything from your broker. This window will close on its own."}
          </p>

          {/* Steps */}
          <ol className="space-y-2.5">
            {STEP_ORDER.map((k) => (
              <StepRow key={k} stepKey={k} step={steps[k]} />
            ))}
          </ol>

          {/* ETA / long-sync message */}
          <div className="mt-5 pt-4 border-t border-border-subtle">
            {veryLong ? (
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
