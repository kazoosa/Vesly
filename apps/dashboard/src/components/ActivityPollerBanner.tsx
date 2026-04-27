import { useEffect, useRef } from "react";
import { useActivityPollerContext } from "../lib/activityPollerContext";
import { useToast } from "./Toast";

/**
 * Persistent, unobtrusive banner shown across the app while the
 * background activity poller is running.
 *
 * Three visible states:
 *   - polling      → "Transaction history is being prepared by your
 *                     broker. We'll load it automatically when ready."
 *                     With a pulse dot for motion.
 *   - timed_out    → "Taking longer than usual. Try Refresh manually
 *                     or check back later."
 *   - complete     → fires the success toast once via useEffect, then
 *                     dismisses itself. The user sees a transient
 *                     "✓ N transactions loaded." toast and the banner
 *                     vanishes.
 *
 * Mounted once near the top of the authenticated app tree (Shell)
 * so it's visible everywhere without per-page wiring.
 */
export function ActivityPollerBanner() {
  const ctx = useActivityPollerContext();
  const toast = useToast();
  const completedRef = useRef(false);

  // Fire the success toast exactly once when status flips to complete.
  // Then auto-dismiss the banner after a short delay so the user has
  // a beat to read the count before the row vanishes.
  useEffect(() => {
    if (!ctx) return;
    if (ctx.status === "complete" && !completedRef.current) {
      completedRef.current = true;
      const n = ctx.lastAddedCount;
      toast.show({
        message: `Loaded ${n} transaction${n === 1 ? "" : "s"}.`,
        durationMs: 5_000,
      });
      // Wait a beat so the user notices the banner has resolved
      // before it slides out, then clear poller state entirely.
      const t = window.setTimeout(() => ctx.dismiss(), 2_500);
      return () => window.clearTimeout(t);
    }
    if (ctx.status !== "complete") {
      completedRef.current = false;
    }
  }, [ctx, ctx?.status, ctx?.lastAddedCount, toast]);

  if (!ctx) return null;
  if (ctx.status === "idle" || ctx.status === "complete") return null;

  const polling = ctx.status === "polling";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mx-auto max-w-5xl mt-3 mb-3 px-3 sm:px-4 py-2.5 rounded-md border flex items-start sm:items-center gap-3 text-[12px] leading-snug ${
        polling
          ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      }`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full bg-current flex-shrink-0 mt-1.5 sm:mt-0 ${
          polling ? "animate-pulse" : ""
        }`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        {polling ? (
          <>
            <span className="font-semibold">Transaction history is being prepared by your broker.</span>{" "}
            <span className="opacity-90">
              We'll load it automatically when ready — keep using the app
              normally.
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold">Transaction history is taking longer than usual.</span>{" "}
            <span className="opacity-90">
              Try the Refresh button on your Accounts page or check back
              later.
            </span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => ctx.dismiss()}
        className="text-current opacity-60 hover:opacity-100 text-base leading-none flex-shrink-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
