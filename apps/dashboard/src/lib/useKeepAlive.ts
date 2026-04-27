import { useEffect } from "react";

/**
 * Render's free-tier services spin down after ~15 minutes of
 * inactivity. The first request after spindown takes 10-30s while
 * the container cold-starts, which makes Refresh-now feel broken
 * even when the rest of the app is fast.
 *
 * This hook fires a lightweight GET /health every 4 minutes while
 * the user is on an authenticated page, keeping the instance warm.
 * No auth header needed — /health is public. Silent: no React
 * state, no UI, no error handling beyond catch-and-ignore.
 *
 * 4-minute interval picked to comfortably beat Render's 15-minute
 * spindown threshold without being noisy. Uses
 * VITE_API_URL so it points at whichever backend the dashboard
 * was built against.
 */
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";
const KEEP_ALIVE_MS = 4 * 60_000;

export function useKeepAlive(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    function ping() {
      if (cancelled) return;
      // We don't care about the response — just touching the
      // endpoint is enough to reset Render's idle timer.
      fetch(`${API}/health`, { method: "GET", keepalive: true }).catch(() => {
        /* swallow — keep-alive failures aren't actionable */
      });
    }
    // Fire one ping immediately on mount so the backend starts
    // waking up while the user's first authenticated query is
    // still being prepared. This shaves Render's 3-5s cold-start
    // off the perceived load time on the Overview page after
    // periods of inactivity. Subsequent pings keep it warm.
    ping();
    const t = window.setInterval(ping, KEEP_ALIVE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [enabled]);
}
