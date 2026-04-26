import { useEffect, useState } from "react";

/**
 * Full-screen overlay shown immediately after a brokerage is
 * connected. Stays up until all sync steps resolve. Three live
 * step rows update in place as data arrives.
 *
 * The component owns its own ticking elapsed-time counter so even
 * when no step has flipped, the user sees motion and knows the
 * page didn't freeze.
 */

export type StepKey = "accounts" | "holdings" | "transactions";

export type StepState = "pending" | "in_progress" | "done" | "error";

interface Steps {
  accounts: { state: StepState; count?: number };
  holdings: { state: StepState; count?: number };
  transactions: { state: StepState; count?: number };
}

interface Props {
  open: boolean;
  steps: Steps;
  /** Total elapsed seconds — kept by the parent so we can
   *  acknowledge particularly long syncs honestly. */
  elapsedSeconds: number;
  /** Hide and let the user back into the dashboard. */
  onClose: () => void;
  /** True when every step is done (or errored). When true, the
   *  modal still stays open until the user clicks Continue —
   *  giving them a chance to read the final counts. */
  ready: boolean;
}

const STEP_LABELS: Record<StepKey, string> = {
  accounts: "Listing your accounts",
  holdings: "Pulling current holdings",
  transactions: "Pulling transaction history",
};

const STEP_NOTES: Record<StepKey, string> = {
  accounts: "Should be quick.",
  holdings: "Usually a few seconds.",
  transactions:
    "Some brokers take a minute or two — Robinhood especially. We'll wait.",
};

export function PostConnectSyncOverlay({
  open,
  steps,
  elapsedSeconds,
  onClose,
  ready,
}: Props) {
  const [, force] = useState(0);
  // Tick once a second so the elapsed counter and pulse animations
  // re-render without the parent having to push updates.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Syncing your brokerage"
      className="fixed inset-0 z-[100] grid place-items-center bg-bg-base/95 backdrop-blur-sm p-4"
    >
      <div className="card max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-semibold text-fg-primary">
            {ready ? "All set" : "Syncing your brokerage"}
          </h2>
          {!ready && (
            <span className="text-[11px] text-fg-muted font-num">
              {fmtElapsed(elapsedSeconds)}
            </span>
          )}
        </div>
        <p className="text-xs text-fg-secondary mb-5">
          {ready
            ? "Everything is in. You can start using the dashboard."
            : "We're staying here until everything is ready. Closing this would leave you looking at half-loaded pages."}
        </p>

        <ol className="space-y-2.5">
          {(["accounts", "holdings", "transactions"] as StepKey[]).map((k) => (
            <StepRow key={k} stepKey={k} step={steps[k]} />
          ))}
        </ol>

        {!ready && elapsedSeconds > 60 && (
          <div className="mt-5 text-[11px] text-fg-muted bg-bg-overlay p-2.5 rounded">
            Still going after {fmtElapsed(elapsedSeconds)}. This is normal for
            brokers like Robinhood the first time you connect — SnapTrade has
            to pull years of history and cache it. A multi-minute wait isn't
            broken.
          </div>
        )}

        {ready && (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={onClose}
              autoFocus
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({
  stepKey,
  step,
}: {
  stepKey: StepKey;
  step: { state: StepState; count?: number };
}) {
  const label = STEP_LABELS[stepKey];
  const note = STEP_NOTES[stepKey];
  const Icon = stepIcon(step.state);
  const tone = stepTone(step.state);
  return (
    <li className="flex items-start gap-3">
      <div className={`flex-shrink-0 mt-0.5 ${tone}`}>{Icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm text-fg-primary">{label}</div>
          {step.count !== undefined && step.state === "done" && (
            <div className="text-xs font-num text-fg-secondary">
              {step.count.toLocaleString()}
            </div>
          )}
        </div>
        <div className="text-[11px] text-fg-muted mt-0.5">
          {step.state === "in_progress" ? "Working…" : note}
        </div>
      </div>
    </li>
  );
}

function stepIcon(state: StepState) {
  if (state === "done") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="5 12 10 17 19 7" />
      </svg>
    );
  }
  if (state === "error") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    );
  }
  if (state === "in_progress") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
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
            dur="1s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
    );
  }
  // pending
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeOpacity="0.4" strokeDasharray="3 3" />
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
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}
