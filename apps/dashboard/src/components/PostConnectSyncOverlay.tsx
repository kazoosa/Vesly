import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "./money";
import { themeForBroker } from "./spaceTheme";

// Lazy-load the 3D scene so its three.js + post-processing bundle
// only ships when the overlay actually mounts. Rest of the dashboard
// never pays the cost.
const SpaceScene = lazy(() => import("./SpaceScene"));

/** Detect prefers-reduced-motion at module scope so we don't re-query
 *  per render. Re-evaluates on each overlay open in case the user
 *  toggled the OS setting between sessions. */
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
 * completes. Drives a phased animated progress bar plus per-step
 * status rows. Auto-dismisses when the sync fully resolves; the
 * caller doesn't need a Continue button.
 *
 * Phases:
 *   1 — initial sync                → bar fills 0 → 40%
 *   2 — broker cache wait            → bar holds at 40%, count-up timer
 *   3 — DB writes (post-poll)        → bar animates 40 → 100%
 *   4 — ready, hold + fade            → existing auto-dismiss
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
    waitingForBroker?: boolean;
    writing?: boolean;
  };
}

interface Props {
  open: boolean;
  steps: Steps;
  /** Total elapsed seconds since the overlay opened — kept by the
   *  parent for completeness. The overlay also tracks per-phase
   *  elapsed locally so each phase counts up from 0. */
  elapsedSeconds: number;
  onClose: () => void;
  ready: boolean;
  onSkipWait?: () => void;
  /** Connected brokerage name from the SyncResult — drives the
   *  broker-specific theme (Robinhood green, Fidelity navy/gold,
   *  Schwab electric blue, etc). Optional; falls back to default. */
  brokerName?: string | null;
}

// Step weights — sum to 40, since Phase 1 fills only to 40%.
const STEP_WEIGHTS: Record<StepKey, number> = {
  connecting: 5,
  accounts: 5,
  holdings: 10,
  transactions: 20,
};

const STEP_ORDER: StepKey[] = ["connecting", "accounts", "holdings", "transactions"];

function targetPercent(steps: Steps, ready: boolean): number {
  if (ready) return 100;
  if (steps.transactions.writing) return 100;
  if (steps.transactions.waitingForBroker) return 40;
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

function fmtCountUp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `0:${s.toString().padStart(2, "0")}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function waitContextCopy(elapsedSeconds: number): string {
  if (elapsedSeconds < 30) return "Connecting to your broker…";
  if (elapsedSeconds < 90) return "Your broker is preparing your transaction history…";
  if (elapsedSeconds < 180) return "Robinhood typically takes 1–3 minutes on first connect — you're almost there.";
  return "This is taking longer than usual. Still working — some brokers are slow on first connect.";
}

function fmtPhase3Eta(remainingSeconds: number): string {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return "Almost done…";
  if (remainingSeconds < 5) return "Almost done…";
  if (remainingSeconds < 60) return `About ${Math.round(remainingSeconds)} seconds remaining`;
  const m = Math.round(remainingSeconds / 60);
  return `About ${m} minute${m === 1 ? "" : "s"} remaining`;
}

function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s elapsed`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s elapsed`;
}

export function PostConnectSyncOverlay({
  open,
  steps,
  elapsedSeconds,
  onClose,
  ready,
  onSkipWait,
  brokerName,
}: Props) {
  // Phase derivation.
  const writing = Boolean(steps.transactions.writing) && !ready;
  const waitingForBroker =
    Boolean(steps.transactions.waitingForBroker) && !ready && !writing;

  // Reduced motion: skip the 3D scene; fall back to gradient backdrop.
  const reducedMotion = usePrefersReducedMotion();
  const sceneActive = (waitingForBroker || writing) && !reducedMotion;

  // Theme derivation — same matcher the scene uses, so HUD accents match.
  const theme = themeForBroker(brokerName);

  // ---- Phase 2 timer (Bug #1 fix) -----------------------------------
  //
  // Earlier we had a stale-closure issue: the timer ticked off a
  // useState force-render but the dep array referenced the
  // setter (stable across renders) so useMemo never recomputed.
  // New shape: explicit setInterval, explicit setState, explicit
  // ref for the start time, no force-render trick.
  const phase2StartRef = useRef<number | null>(null);
  const [phase2Seconds, setPhase2Seconds] = useState(0);
  useEffect(() => {
    if (!waitingForBroker) {
      phase2StartRef.current = null;
      setPhase2Seconds(0);
      return;
    }
    if (phase2StartRef.current === null) {
      phase2StartRef.current = Date.now();
    }
    // First tick immediately, so the count starts at 0:00 and not 0:01
    // on initial render.
    setPhase2Seconds(
      Math.floor((Date.now() - phase2StartRef.current) / 1000),
    );
    const id = window.setInterval(() => {
      if (phase2StartRef.current === null) return;
      setPhase2Seconds(
        Math.floor((Date.now() - phase2StartRef.current) / 1000),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [waitingForBroker]);

  // ---- Phase 3 timer (writing) — used to compute Phase 3 ETA -------
  const phase3StartRef = useRef<number | null>(null);
  const [, setPhase3Tick] = useState(0); // re-render every 250ms during writing
  useEffect(() => {
    if (!writing) {
      phase3StartRef.current = null;
      return;
    }
    if (phase3StartRef.current === null) {
      phase3StartRef.current = Date.now();
    }
    const id = window.setInterval(() => setPhase3Tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [writing]);

  // ---- Animated progress bar -----------------------------------------
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

  // ---- Auto-dismiss ---------------------------------------------------
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

  // ---- HUD hint fade --------------------------------------------------
  const [hintVisible, setHintVisible] = useState(true);
  useEffect(() => {
    if (!sceneActive) {
      setHintVisible(true);
      return;
    }
    const t = window.setTimeout(() => setHintVisible(false), 10_000);
    return () => window.clearTimeout(t);
  }, [sceneActive]);

  // ---- Audio mute (drives ambient track in SpaceScene) ---------------
  const [audioEnabled, setAudioEnabled] = useState(true);

  // ---- Escape hatch (10 minute) ---------------------------------------
  const showEscapeHatch =
    waitingForBroker && phase2Seconds >= 600 && !!onSkipWait;

  // ---- Draggable card -------------------------------------------------
  //
  // useRef on the card element with manual pointerdown/move/up. The
  // handle (the grip dots at the top) is the only valid drag region;
  // the rest of the card stays click-through. Card uses position:
  // fixed so it can sit above the scene canvas. Constrained to
  // viewport bounds. Double-click on the handle smoothly recenters.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const [recentering, setRecentering] = useState(false);
  const dragStateRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  // Compute initial centered position when the overlay first opens.
  useEffect(() => {
    if (!open) return;
    if (cardPos !== null) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const left = (window.innerWidth - rect.width) / 2;
    const top = (window.innerHeight - rect.height) / 2;
    setCardPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function clampToViewport(left: number, top: number) {
    const card = cardRef.current;
    if (!card) return { left, top };
    const rect = card.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    return {
      left: Math.max(0, Math.min(maxLeft, left)),
      top: Math.max(0, Math.min(maxTop, top)),
    };
  }

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    setRecentering(false);
    const rect = card.getBoundingClientRect();
    dragStateRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragStateRef.current;
    if (!ds) return;
    const next = clampToViewport(
      e.clientX - ds.offsetX,
      e.clientY - ds.offsetY,
    );
    setCardPos(next);
  }
  function onHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragStateRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ok */
    }
  }
  function onHandleDoubleClick() {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const left = (window.innerWidth - rect.width) / 2;
    const top = (window.innerHeight - rect.height) / 2;
    setRecentering(true);
    setCardPos({ left, top });
    // Strip the smooth-transition class after the animation lands so
    // future drags feel instantaneous again.
    window.setTimeout(() => setRecentering(false), 350);
  }

  if (!open) return null;

  // ---- Phase 3 ETA computation ---------------------------------------
  let phase3EtaText = "";
  if (writing && phase3StartRef.current !== null) {
    const elapsedSec = (Date.now() - phase3StartRef.current) / 1000;
    const progress = Math.max(0, (displayPct - 40) / 60);
    if (progress < 0.05 || elapsedSec < 1) {
      phase3EtaText = "Almost done…";
    } else {
      const total = elapsedSec / progress;
      const remaining = total - elapsedSec;
      phase3EtaText = fmtPhase3Eta(remaining);
    }
  }

  // ---- Backdrop choice -----------------------------------------------
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
      className={`fixed inset-0 z-[100] ${
        fadingOut ? "animate-fade-out" : "animate-fade-in"
      }`}
      style={backdropStyle}
    >
      {sceneActive && (
        <Suspense fallback={null}>
          <SpaceScene brokerName={brokerName} audioEnabled={audioEnabled} />
        </Suspense>
      )}

      {/* Top-left: themed broker watermark. Reads as a HUD element. */}
      {sceneActive && (
        <div
          className="absolute top-4 left-4 z-[1] pointer-events-none font-num uppercase"
          style={{
            color: theme.hudAccent,
            opacity: 0.2,
            fontSize: 14,
            letterSpacing: "0.3em",
          }}
          aria-hidden
        >
          {theme.watermark}
        </div>
      )}

      {/* Top-right: mute toggle. */}
      {sceneActive && (
        <button
          type="button"
          onClick={() => setAudioEnabled((v) => !v)}
          className="absolute top-4 right-4 z-[1] text-white transition-opacity hover:opacity-100"
          style={{
            opacity: 0.4,
            fontSize: 16,
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          aria-label={audioEnabled ? "Mute ambient audio" : "Unmute ambient audio"}
          title={audioEnabled ? "Mute" : "Unmute"}
        >
          {audioEnabled ? "🔊" : "🔇"}
        </button>
      )}

      {/* Bottom-left: live stats. Updates as transactions arrive. */}
      {sceneActive && (
        <LiveStats
          accounts={steps.accounts.count ?? 0}
          holdings={steps.holdings.count ?? 0}
          transactions={steps.transactions.count}
          writing={writing}
          waitingForBroker={waitingForBroker}
        />
      )}

      {/* Bottom-right: control hint. */}
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
        ref={cardRef}
        className={`card max-w-md overflow-hidden animate-scale-in z-[2] ${
          recentering ? "transition-all duration-300 ease-out" : ""
        }`}
        style={{
          position: "fixed",
          left: cardPos?.left ?? "50%",
          top: cardPos?.top ?? "50%",
          // Fall back to translate-centering until the measurement
          // effect has run on first paint. Once cardPos is set we use
          // explicit left/top so dragging works.
          transform: cardPos ? "none" : "translate(-50%, -50%)",
          width: "calc(100% - 32px)",
          maxWidth: 448,
          boxShadow:
            "0 24px 60px -12px rgb(0 0 0 / 0.45), 0 8px 20px -6px rgb(0 0 0 / 0.25)",
        }}
      >
        {/* Drag handle. Three dots, cursor flips to grab/grabbing. */}
        <div
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          onDoubleClick={onHandleDoubleClick}
          className="flex items-center justify-center py-2 select-none"
          style={{
            cursor: dragStateRef.current ? "grabbing" : "grab",
            background: "transparent",
            touchAction: "none",
          }}
          role="button"
          aria-label="Drag to move • double-click to recenter"
          title="Drag to move • double-click to recenter"
        >
          <div className="flex gap-1">
            <span className="block w-1 h-1 rounded-full bg-fg-muted/60" />
            <span className="block w-1 h-1 rounded-full bg-fg-muted/60" />
            <span className="block w-1 h-1 rounded-full bg-fg-muted/60" />
          </div>
        </div>

        {/* Progress bar. Phase 2 holds at 40% with a pulse (no shimmer
            — that would fake forward motion the wait doesn't have).
            Phases 1 and 3 use the shimmer overlay. */}
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

          {/* Phase-2 portfolio preview. Hidden in phases 1, 3, 4. */}
          {waitingForBroker && <PortfolioPreview />}

          {/* Phase-specific footer. */}
          <div className="mt-5 pt-4 border-t border-border-subtle space-y-3">
            {waitingForBroker ? (
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

/** Live stats HUD, bottom-left. Surfaces real account/holding/
 *  transaction counts from the steps object so the user has more to
 *  read than the timer during the wait. */
function LiveStats({
  accounts,
  holdings,
  transactions,
  writing,
  waitingForBroker,
}: {
  accounts: number;
  holdings: number;
  transactions: number | undefined;
  writing: boolean;
  waitingForBroker: boolean;
}) {
  const txLabel =
    writing && typeof transactions === "number"
      ? `loading ${transactions} transactions…`
      : waitingForBroker
        ? "transactions loading…"
        : typeof transactions === "number"
          ? `${transactions} transactions`
          : "";
  return (
    <div
      className="absolute bottom-4 left-4 z-[1] text-white pointer-events-none font-num tabular-nums"
      style={{ opacity: 0.55, fontSize: 12 }}
      aria-hidden
    >
      {accounts} account{accounts === 1 ? "" : "s"} · {holdings} holding
      {holdings === 1 ? "" : "s"}
      {txLabel ? ` · ${txLabel}` : ""}
    </div>
  );
}

/** Live portfolio preview shown in the card during Phase 2.
 *  Pulls /api/portfolio/summary + /api/portfolio/holdings. */
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="5 12 10 17 19 7" />
      </svg>
    );
  }
  if (state === "error") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    );
  }
  if (state === "in_progress") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M12 3 a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
        </path>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="3 3" />
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
