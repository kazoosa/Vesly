import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { apiFetch } from "./api";

/**
 * Background poller that picks up transactions once SnapTrade has
 * warmed up its broker-side cache.
 *
 * Why this exists: connecting Robinhood for the first time often
 * returns 0 activities — SnapTrade is still pulling history from
 * the broker in the background, sometimes for several minutes. We
 * write the holdings the user gets back immediately, then start
 * this poller in the background. Every 2 minutes it hits the cheap
 * activities-only endpoint. The moment it returns transactions, we
 * save them, dismiss the banner, and toast the user.
 *
 * Survives page reloads via localStorage. The user can navigate
 * around the whole app while this runs — no blocking, no spinner.
 *
 * Gives up after 45 minutes. At that point the banner switches to
 * "taking longer than usual" copy with a manual Refresh nudge.
 */

const STORAGE_KEY = "beacon.activityPoller.v1";
const POLL_INTERVAL_MS = 2 * 60_000; // 2 minutes
const TIMEOUT_MS = 45 * 60_000; // 45 minutes

export type PollerStatus = "idle" | "polling" | "timed_out" | "complete";

interface PersistedState {
  startedAt: number;
  status: PollerStatus;
  /** Number of transactions the LAST successful poll saved.
   *  Drives the success toast copy. */
  lastAddedCount: number;
}

export interface ActivityPollerControls {
  status: PollerStatus;
  /** When status === "complete", how many transactions just landed. */
  lastAddedCount: number;
  /** Begin a new poll cycle. Idempotent: starting an already-active
   *  poller resets the timer to "now" so a fresh connect after an
   *  earlier poll restarts the countdown. */
  start: () => void;
  /** Force-stop the poller (e.g. if the user manually hits Refresh
   *  and pulls activities themselves). */
  stop: () => void;
  /** Acknowledge a complete/timed-out toast so it doesn't keep
   *  showing on every page. Does NOT restart the poller. */
  dismiss: () => void;
}

function readPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (typeof parsed.startedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(s: PersistedState | null) {
  try {
    if (s === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota error — ignore, the poller still runs in-memory */
  }
}

export function useActivityPoller(): ActivityPollerControls {
  const { accessToken } = useAuth();
  const qc = useQueryClient();

  // Hydrate synchronously from localStorage so the banner shows on
  // first paint after a reload mid-poll. Recovers transparently if
  // we were already past the 45-minute timeout.
  const [state, setStateRaw] = useState<PersistedState>(() => {
    const saved = readPersisted();
    if (!saved) {
      return { startedAt: 0, status: "idle", lastAddedCount: 0 };
    }
    if (saved.status === "polling" && Date.now() - saved.startedAt > TIMEOUT_MS) {
      return { ...saved, status: "timed_out" };
    }
    return saved;
  });

  // Sync to localStorage on every state change.
  const setState = useCallback((next: PersistedState) => {
    setStateRaw(next);
    writePersisted(next);
  }, []);

  const tickRef = useRef<number | null>(null);

  // Single tick: hit the poll endpoint, decide what to do with the
  // result. Self-rearming via the parent useEffect.
  useEffect(() => {
    if (state.status !== "polling") return;
    if (!accessToken) return;
    const f = apiFetch(() => accessToken);

    let cancelled = false;
    async function tick() {
      try {
        const res = await f<{
          transactionsAdded: number;
          totalReturned: number;
          fullySucceeded: boolean;
        }>("/api/snaptrade/poll-activities", { method: "POST" });
        if (cancelled) return;
        if (res.transactionsAdded > 0) {
          // Hit. Refresh anything that depends on transactions and
          // mark complete — the banner consumer will swap to the
          // success toast.
          qc.invalidateQueries({ queryKey: ["tx"] });
          qc.invalidateQueries({ queryKey: ["dividends"] });
          qc.invalidateQueries({ queryKey: ["summary"] });
          qc.invalidateQueries({ queryKey: ["holdings"] });
          setState({
            startedAt: state.startedAt,
            status: "complete",
            lastAddedCount: res.transactionsAdded,
          });
          return;
        }
        // Still empty. Either rearm or time out.
        if (Date.now() - state.startedAt >= TIMEOUT_MS) {
          setState({ ...state, status: "timed_out" });
          return;
        }
      } catch {
        // Network blip or backend hiccup — silently retry on the
        // next tick. Nothing to surface to the user; this is a
        // best-effort background poll.
      }
    }

    // Fire immediately on entering polling state, then every
    // POLL_INTERVAL_MS thereafter. The immediate fire catches the
    // case where the user reloads the page right when SnapTrade
    // finished warming up.
    tick();
    tickRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.startedAt, accessToken]);

  const start = useCallback(() => {
    setState({ startedAt: Date.now(), status: "polling", lastAddedCount: 0 });
  }, [setState]);

  const stop = useCallback(() => {
    setState({ startedAt: 0, status: "idle", lastAddedCount: 0 });
  }, [setState]);

  const dismiss = useCallback(() => {
    // Going from complete/timed_out -> idle wipes the banner and
    // localStorage, so a fresh page load won't re-surface the toast.
    setState({ startedAt: 0, status: "idle", lastAddedCount: 0 });
  }, [setState]);

  return {
    status: state.status,
    lastAddedCount: state.lastAddedCount,
    start,
    stop,
    dismiss,
  };
}
