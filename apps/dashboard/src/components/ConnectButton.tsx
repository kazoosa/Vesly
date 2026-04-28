import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SnapTradeReact } from "snaptrade-react";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { PostConnectSyncOverlay, type StepState } from "./PostConnectSyncOverlay";
import { useToast } from "./Toast";

declare global {
  interface Window {
    FinLink?: {
      create: (args: {
        token: string;
        modalUrl?: string;
        onSuccess?: (pt: string, meta: unknown) => void;
        onExit?: (err: Error | null, meta: unknown) => void;
      }) => { open: () => void; exit: () => void; destroy: () => void };
    };
  }
}

const LINK_UI_URL = (import.meta.env.VITE_LINK_UI_URL as string | undefined) ?? "http://localhost:5175";

export function ConnectButton() {
  const { accessToken, developer } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const fetcher = apiFetch(() => accessToken);
  // Used by the wait-for-broker loop to bail out without saving the
  // (still-empty) state when the user clicks "Continue without
  // transactions" after the 10-minute escape hatch appears.
  const skipWaitRef = useRef(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapLoginLink, setSnapLoginLink] = useState<string | null>(null);
  const syncFiredRef = useRef(false);

  // First-connect overlay state. Hidden for Refresh-now flows.
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayReady, setOverlayReady] = useState(false);
  const [overlayElapsed, setOverlayElapsed] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const [overlaySteps, setOverlaySteps] = useState<{
    connecting: { state: StepState };
    accounts: { state: StepState; count?: number };
    holdings: { state: StepState; count?: number };
    transactions: {
      state: StepState;
      count?: number;
      attempt?: number;
      maxAttempts?: number;
      waitingForBroker?: boolean;
      writing?: boolean;
    };
  }>({
    connecting: { state: "pending" },
    accounts: { state: "pending" },
    holdings: { state: "pending" },
    transactions: { state: "pending" },
  });
  // Surface what the post-connect sync actually pulled. Without this,
  // a successful connect that finds zero history is indistinguishable
  // from a silent failure — both leave Transactions/Dividends blank.
  // Per-step error rows the backend returns when one or more
  // SnapTrade calls failed. The user-visible banner lists them so the
  // user can see exactly which data type came through and which one
  // didn't, instead of a generic "Sync failed".
  type SyncError = {
    step: string;
    accountId?: string;
    message: string;
    status?: number;
  };
  const [syncResult, setSyncResult] = useState<
    | {
        ok: true;
        accounts: number;
        holdings: number;
        transactions: number;
        options_fetched?: number;
        raw_activities?: number;
        skipped_unknown?: number;
        skipped_labels?: string[];
        errors?: SyncError[];
        fully_succeeded?: boolean;
        /** True between the first /sync call and the (possible) retry,
         *  so the banner shows "Pulling history…" instead of misleading
         *  zeros while we wait for SnapTrade's broker-side cold start. */
        pending?: boolean;
      }
    | { ok: false; message: string }
    | null
  >(null);

  const isDemo = developer?.email === "demo@finlink.dev";

  // Preload the mock SDK for demo account. Non-demo accounts use SnapTrade,
  // which is loaded via the snaptrade-react package — no script tag needed.
  useEffect(() => {
    if (!isDemo) {
      setSdkReady(true);
      return;
    }
    if (window.FinLink) {
      setSdkReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-finlink-sdk="1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => setSdkReady(true));
      return;
    }
    const s = document.createElement("script");
    s.src = `${LINK_UI_URL}/sdk/finlink.js?v=${Date.now()}`;
    s.dataset.finlinkSdk = "1";
    s.onload = () => setSdkReady(true);
    document.body.appendChild(s);
  }, [isDemo]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetcher<
        | { mode: "mock"; link_token: string }
        | { mode: "snaptrade"; redirect_url: string }
        | { mode: "unconfigured"; message: string }
      >("/api/portfolio/connect-token", { method: "POST" });

      if (resp.mode === "unconfigured") {
        setError(resp.message);
        return;
      }

      if (resp.mode === "mock") {
        if (!window.FinLink) {
          setError("Mock SDK failed to load");
          return;
        }
        const handler = window.FinLink.create({
          token: resp.link_token,
          modalUrl: LINK_UI_URL,
          onSuccess: async (pt) => {
            try {
              await fetcher("/api/portfolio/exchange", {
                method: "POST",
                body: JSON.stringify({ public_token: pt }),
              });
              qc.invalidateQueries();
            } catch (err) {
              console.error("exchange failed", err);
            }
          },
        });
        handler.open();
        return;
      }

      // SnapTrade path — open the embedded portal (no popup window).
      setSnapLoginLink(resp.redirect_url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Run a single /api/snaptrade/sync call and surface the result.
   * Extracted so afterSnapTradeConnect can call it twice with a delay
   * in between when the first call comes back empty (see retry note).
   */
  async function runOneSync() {
    return fetcher<{
      connections: number;
      accounts: number;
      holdings: number;
      transactions: number;
      options_fetched?: number;
      raw_activities?: number;
      skipped_unknown?: number;
      skipped_labels?: string[];
      errors?: SyncError[];
      fully_succeeded?: boolean;
    }>("/api/snaptrade/sync", { method: "POST" });
  }

  function startOverlayTimer() {
    setOverlayElapsed(0);
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = window.setInterval(
      () => setOverlayElapsed((s) => s + 1),
      1000,
    );
  }
  function stopOverlayTimer() {
    if (elapsedTimerRef.current) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }
  useEffect(() => stopOverlayTimer, []);

  // Navigation lock — only active while a real sync is in flight
  // (overlay is open AND not yet ready). The browser's stock
  // beforeunload prompt warns the user before they accidentally
  // tab-close / refresh / hit Back mid-sync. Releases the moment
  // overlayReady flips true OR the user dismisses the overlay.
  // Critically: this never fires for the modal-open-then-close
  // flow because that path doesn't open the overlay.
  useEffect(() => {
    if (!overlayOpen || overlayReady) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message but still show their
      // own prompt as long as preventDefault was called.
      e.returnValue = "Sync still in progress. Leaving now will lose your connection.";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [overlayOpen, overlayReady]);

  /**
   * Poll the activities-only endpoint every 60s until transactions
   * actually arrive. Resolves to the poll response when a non-zero
   * count lands, or to null when the user clicks the 10-minute
   * escape hatch (skipWaitRef flips true). Never times out on its
   * own — the user is the one who decides to bail.
   *
   * Poll-first ordering: the previous implementation slept 60s
   * BEFORE the first poll, on the assumption that an immediate
   * re-poll would be wasteful because "the foreground sync just
   * returned 0." That used to be true when this ran right after
   * a heavy retry-sync; the cold-cache path no longer does that
   * (see afterSnapTradeConnect). Trying once immediately costs
   * one cheap activities-only round-trip and saves up to 60s on
   * the critical path when the broker happens to be ready right
   * after the first sync wrote accounts + holdings.
   */
  async function pollUntilTransactionsArrive(): Promise<{
    transactionsAdded: number;
  } | null> {
    skipWaitRef.current = false;
    const POLL_MS = 60_000;
    while (true) {
      if (skipWaitRef.current) return null;

      try {
        const res = await fetcher<{
          transactionsAdded: number;
          totalReturned: number;
          fullySucceeded: boolean;
        }>("/api/snaptrade/poll-activities", { method: "POST" });
        if (skipWaitRef.current) return null;
        if (res.transactionsAdded > 0) {
          // Real transactions just landed. Refresh anything that
          // depends on them so the dashboard renders fresh data
          // the moment the overlay dismisses.
          qc.invalidateQueries({ queryKey: ["tx"] });
          qc.invalidateQueries({ queryKey: ["dividends"] });
          qc.invalidateQueries({ queryKey: ["summary"] });
          qc.invalidateQueries({ queryKey: ["holdings"] });
          return res;
        }
      } catch {
        // Network blip on a single poll isn't fatal — log nothing,
        // try again on the next 60s tick. The user sees the same
        // pulsing 90% bar regardless.
      }

      // Empty response (or network blip) — sleep before the next
      // poll. Watch the skip ref every 250ms during the sleep so
      // the escape hatch button responds quickly instead of
      // waiting up to a minute.
      await new Promise<void>((resolve) => {
        const t = window.setTimeout(resolve, POLL_MS);
        const check = window.setInterval(() => {
          if (skipWaitRef.current) {
            window.clearTimeout(t);
            window.clearInterval(check);
            resolve();
          }
        }, 250);
        // Cleanup the watcher even on the natural-resolve path.
        window.setTimeout(() => window.clearInterval(check), POLL_MS + 50);
      });
    }
  }

  /**
   * Sync after a brokerage was just connected.
   *
   * On firstConnect=true we open a blocking overlay that doesn't
   * dismiss until accounts + holdings + transactions have all
   * resolved. The user can sit there for several minutes if
   * SnapTrade is slow on a fresh Robinhood connect — that's by
   * design, the alternative is showing them half-loaded data
   * and confusing them about what's missing vs what's slow.
   *
   * The backend /sync endpoint is monolithic — it returns once
   * after every step is done — so we drive the overlay's
   * step-by-step display on heuristic timings (accounts and
   * holdings mark "in progress" immediately, flip to "done" after
   * a brief delay since those parts are always fast). Transactions
   * stays "in progress" until the actual response arrives.
   *
   * If the first response had 0 transactions (cold-cache signature),
   * we wait 8s and retry once — same logic as before but driven
   * from inside the overlay so the user stays informed.
   *
   * Refresh-now (firstConnect=false) skips the overlay entirely
   * and just updates the existing inline banner — non-blocking.
   */
  async function afterSnapTradeConnect(firstConnect = false) {
    setSyncResult(null);
    if (firstConnect) {
      // OAuth has just completed (we're inside SnapTradeReact.onSuccess),
      // so connecting is already done. The other three steps flip to
      // in-progress and then to done as the /sync response and its
      // retry resolve. The progress bar fills smoothly between
      // checkpoints — see PostConnectSyncOverlay.tsx for the math.
      setOverlaySteps({
        connecting: { state: "done" },
        accounts: { state: "in_progress" },
        holdings: { state: "in_progress" },
        transactions: { state: "in_progress", attempt: 1, maxAttempts: 2 },
      });
      setOverlayReady(false);
      setOverlayOpen(true);
      startOverlayTimer();
    } else {
      setSyncResult({
        ok: true,
        accounts: 0,
        holdings: 0,
        transactions: 0,
        fully_succeeded: true,
        pending: true,
      });
    }

    try {
      const out = await runOneSync();

      // First sync done: we now know real account / holdings / tx counts.
      // For the overlay: accounts and holdings are definitely done at
      // this point (the backend wouldn't have returned without them).
      // Transactions may legitimately be 0 (cold cache) — kick off
      // retry below if so, otherwise mark done.
      if (firstConnect) {
        setOverlaySteps((prev) => ({
          connecting: prev.connecting,
          accounts: { state: "done", count: out.accounts ?? 0 },
          holdings: { state: "done", count: out.holdings ?? 0 },
          transactions: prev.transactions, // decide below
        }));
      }

      const coldCache =
        firstConnect &&
        (out.transactions ?? 0) === 0 &&
        (out.raw_activities ?? 0) === 0;

      if (coldCache) {
        // First sync wrote accounts + holdings successfully but came
        // back with zero transactions — SnapTrade's broker-side
        // cache is still warming. Earlier code waited 8 seconds and
        // ran a SECOND full syncDeveloper (positions + options +
        // activities for every account); the 8s was a guess and
        // the second full sync re-did positions/options that
        // already wrote. Both wasted time on the critical path.
        //
        // Now: invalidate the cache for accounts + holdings (so the
        // dashboard renders fresh data underneath the overlay),
        // flip the transaction step to the pulsing wait state,
        // and go straight into the poll loop. pollUntilTransactionsArrive
        // hits the cheap activities-only endpoint and the first
        // poll is immediate (see fix #4 in pollUntilTransactionsArrive).
        qc.invalidateQueries({ queryKey: ["accounts"] });
        qc.invalidateQueries({ queryKey: ["holdings"] });
        // Summary drives the overlay's "Your portfolio so far" preview
        // (PortfolioPreview in PostConnectSyncOverlay.tsx). Without this
        // invalidate the preview would render with whatever cached
        // summary the dashboard had pre-connect, which for a brand-new
        // account is nothing.
        qc.invalidateQueries({ queryKey: ["summary"] });
        if (firstConnect) {
          setOverlaySteps((prev) => ({
            ...prev,
            connecting: { state: "done" },
            transactions: { state: "in_progress", waitingForBroker: true },
          }));
        }
        // Stash the first-sync result so we can preserve account /
        // holdings counts in the final syncResult regardless of
        // whether the poll resolves or the user bails.
        setSyncResult({
          ok: true,
          accounts: out.accounts ?? 0,
          holdings: out.holdings ?? 0,
          transactions: 0,
          options_fetched: out.options_fetched,
          raw_activities: out.raw_activities,
          skipped_unknown: out.skipped_unknown,
          skipped_labels: out.skipped_labels,
          errors: out.errors,
          fully_succeeded: out.fully_succeeded,
        });
        const polled = await pollUntilTransactionsArrive();
        if (polled) {
          setSyncResult({
            ok: true,
            accounts: out.accounts ?? 0,
            holdings: out.holdings ?? 0,
            transactions: polled.transactionsAdded,
            options_fetched: out.options_fetched,
            raw_activities: polled.transactionsAdded,
            skipped_unknown: 0,
            skipped_labels: [],
            errors: out.errors,
            fully_succeeded: out.fully_succeeded,
          });
          if (firstConnect) {
            // Phase 3 — writing transactions. The backend already
            // wrote the rows by the time pollUntilTransactionsArrive
            // resolved (the response carries the post-write count),
            // but we hold a brief client-side animation here so the
            // user sees the bar advance from 40% to 100% with the
            // count in view. 1.2s is long enough to read; the
            // overlay's auto-dismiss (500ms hold + 400ms fade) takes
            // over from there.
            setOverlaySteps((prev) => ({
              ...prev,
              transactions: {
                state: "in_progress",
                writing: true,
                count: polled.transactionsAdded,
              },
            }));
            await new Promise((r) => setTimeout(r, 1_200));
            setOverlaySteps((prev) => ({
              ...prev,
              transactions: {
                state: "done",
                count: polled.transactionsAdded,
              },
            }));
            // Success toast — fires now so the toast queue is primed
            // by the time the overlay fades. The user sees the same
            // count one more time in their normal toast position.
            toast.show({
              message: `✓ All done — ${polled.transactionsAdded} transaction${
                polled.transactionsAdded === 1 ? "" : "s"
              } loaded`,
              durationMs: 5_000,
            });
          }
        }
        // If polled is null the user clicked "Continue without
        // transactions" — keep the partial syncResult as-is.
      } else {
        setSyncResult({
          ok: true,
          accounts: out.accounts ?? 0,
          holdings: out.holdings ?? 0,
          transactions: out.transactions ?? 0,
          options_fetched: out.options_fetched,
          raw_activities: out.raw_activities,
          skipped_unknown: out.skipped_unknown,
          skipped_labels: out.skipped_labels,
          errors: out.errors,
          fully_succeeded: out.fully_succeeded,
        });
        if (firstConnect) {
          setOverlaySteps((prev) => ({
            ...prev,
            connecting: { state: "done" },
            transactions: { state: "done", count: out.transactions ?? 0 },
          }));
        }
      }

      if (firstConnect) {
        setOverlayReady(true);
        stopOverlayTimer();
      }
    } catch (err) {
      console.error("sync endpoint unreachable", err);
      setSyncResult({ ok: false, message: (err as Error).message });
      if (firstConnect) {
        setOverlaySteps((prev) => ({
          connecting: prev.connecting,
          accounts: prev.accounts.state === "done" ? prev.accounts : { state: "error" },
          holdings: prev.holdings.state === "done" ? prev.holdings : { state: "error" },
          transactions: { state: "error" },
        }));
        setOverlayReady(true);
        stopOverlayTimer();
      }
    }
    qc.invalidateQueries();
  }

  // Friendly per-step labels for the partial-sync banner. The backend
  // emits step IDs ("activities", "options", etc); the UI translates
  // them into something the user can act on.
  const STEP_LABELS: Record<string, string> = {
    list_connections: "Listing connections",
    list_accounts: "Listing accounts",
    positions: "Holdings (positions)",
    options: "Options holdings",
    activities: "Transactions & dividends",
  };

  return (
    <div>
      {isDemo && (
        <div
          role="note"
          className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-200 dark:text-amber-300"
        >
          <span className="font-semibold uppercase tracking-widest text-[9px] block mb-0.5">
            Demo simulation
          </span>
          This is a simulated brokerage flow. The real account uses SnapTrade
          and looks different — no real credentials are submitted here.
        </div>
      )}
      <button
        className="btn-primary w-full justify-center"
        disabled={!sdkReady || busy}
        onClick={connect}
      >
        {busy ? "Opening…" : "+ Connect brokerage"}
      </button>
      {error && <div className="text-xs text-rose-400 mt-2">{error}</div>}

      {syncResult?.ok === true && (
        (() => {
          // Four banner states based on the backend response:
          //   1. pending === true                       -> blue "Pulling history…"
          //                                                while we wait for SnapTrade
          //                                                to catch up on first connect
          //   2. fully_succeeded === true               -> green "Sync complete"
          //   3. fully_succeeded === false (partial)    -> amber "Partial sync"
          //                                                with per-step error breakdown
          //   4. fully_succeeded undefined (old build)  -> green (back-compat)
          const isPending = syncResult.pending === true;
          const isPartial = syncResult.fully_succeeded === false;
          const errs = syncResult.errors ?? [];
          const tone = isPending
            ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
            : isPartial
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
          if (isPending) {
            const hasPartial = (syncResult.accounts ?? 0) > 0;
            return (
              <div
                role="status"
                className={`mt-3 rounded-md border p-2.5 text-[12px] leading-snug ${tone}`}
              >
                <div className="font-semibold flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
                  {hasPartial ? "Loading transactions…" : "Pulling history…"}
                </div>
                {hasPartial ? (
                  <div className="mt-1 opacity-90">
                    {syncResult.accounts} account{syncResult.accounts === 1 ? "" : "s"} and{" "}
                    {syncResult.holdings} holding{syncResult.holdings === 1 ? "" : "s"}{" "}
                    are in. Transaction history takes a few seconds longer —
                    SnapTrade is fetching it from your broker right now.
                  </div>
                ) : (
                  <div className="mt-1 opacity-90">
                    Connection accepted. Some brokers (notably Robinhood) take
                    up to a minute to expose transaction history after first
                    connect — this banner will update as soon as the data
                    arrives.
                  </div>
                )}
              </div>
            );
          }
          return (
            <div
              role="status"
              className={`mt-3 rounded-md border p-2.5 text-[12px] leading-snug ${tone}`}
            >
              <div className="font-semibold">
                {isPartial ? "Partial sync" : "Sync complete"}
              </div>
              <div className="mt-1">
                {syncResult.accounts} account{syncResult.accounts === 1 ? "" : "s"},{" "}
                {syncResult.holdings} holding{syncResult.holdings === 1 ? "" : "s"},{" "}
                {syncResult.transactions} transaction{syncResult.transactions === 1 ? "" : "s"} on record
                {(syncResult.options_fetched ?? 0) > 0 && (
                  <>, {syncResult.options_fetched} option contract{syncResult.options_fetched === 1 ? "" : "s"}</>
                )}
                .
              </div>

              {isPartial && errs.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="font-semibold text-[11px] uppercase tracking-widest">
                    The following steps failed:
                  </div>
                  <ul className="list-disc list-inside text-[11px] opacity-90 space-y-0.5">
                    {errs.map((e, i) => (
                      <li key={i}>
                        <strong>{STEP_LABELS[e.step] ?? e.step}</strong>
                        {e.accountId && (
                          <span className="opacity-70"> · account {e.accountId.slice(0, 8)}…</span>
                        )}
                        {e.status && <span className="opacity-70"> · HTTP {e.status}</span>}
                        <span className="opacity-80">: {e.message}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-[11px] opacity-80">
                    Click <strong>Refresh now</strong> to retry just the failed steps —
                    successful data above is already saved.
                  </div>
                </div>
              )}

              {!isPartial && syncResult.transactions === 0 && (
                <div className="mt-1 text-[11px] opacity-80 space-y-1">
                  {(syncResult.raw_activities ?? 0) === 0 ? (
                    <div>
                      SnapTrade returned <strong>0 raw activities</strong> for this connection.
                      Either there's no trade history in the configured window, or your broker
                      hasn't shared it yet (some brokers take up to 24h after connect to
                      expose history). Try Refresh again in a bit, or import an activity CSV
                      to backfill.
                    </div>
                  ) : (
                    <div>
                      SnapTrade returned <strong>{syncResult.raw_activities}</strong> activities,
                      but Beacon's classifier didn't recognise{" "}
                      <strong>{syncResult.skipped_unknown}</strong> of them. Send these labels
                      to support so we can map them:{" "}
                      <code className="text-[10px] bg-fg-primary/10 px-1 rounded">
                        {(syncResult.skipped_labels ?? []).join(", ") || "—"}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()
      )}
      {syncResult?.ok === false && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[12px] leading-snug text-rose-700 dark:text-rose-300"
        >
          <div className="font-semibold">Sync request failed</div>
          <div className="mt-1">
            The backend didn't respond. {syncResult.message}
          </div>
        </div>
      )}

      {/* Only mount SnapTradeReact when we actually have a redirect
          URL. Mounting it with loginLink="" caused the inner
          `new URL(loginLink)` call to short-circuit harmlessly, but
          having the modal in the tree at all forces React to set up
          its iframe + window-message handlers on every render, and
          a downstream Antd Modal style change in the snaptrade-react
          package could otherwise leave the modal's internal
          state desynced when isOpen flips. Conditional mount
          guarantees a fresh modal instance per connection attempt. */}
      {snapLoginLink && (
        <SnapTradeReact
          loginLink={snapLoginLink}
          isOpen={true}
          close={() => setSnapLoginLink(null)}
          onSuccess={(id: unknown) => {
            console.log("SnapTrade connected:", id);
            syncFiredRef.current = true;
            afterSnapTradeConnect(true);
            setSnapLoginLink(null);
          }}
          onError={(err: unknown) => {
            console.error("SnapTrade error:", err);
            setError("Connection failed — please try again.");
            setSnapLoginLink(null);
          }}
          onExit={() => {
            // The user closed the modal — either they completed the
            // OAuth flow (in which case onSuccess already fired and
            // started the sync) or they cancelled. In both cases we
            // do NOT trigger a sync from here. A previous version
            // optimistically synced on close-without-success in case
            // the user added an extra account mid-flow, but that
            // misfired on every "open then close immediately" with a
            // ghost loading screen and a useless sync POST. If they
            // genuinely added a brokerage and we missed it, the
            // Refresh-now button on the Accounts page handles it.
            syncFiredRef.current = false;
            setSnapLoginLink(null);
          }}
        />
      )}

      <PostConnectSyncOverlay
        open={overlayOpen}
        steps={overlaySteps}
        elapsedSeconds={overlayElapsed}
        ready={overlayReady}
        onClose={() => {
          setOverlayOpen(false);
          stopOverlayTimer();
        }}
        onSkipWait={() => {
          // 10-minute escape hatch — the user is choosing to bail
          // out of the wait-for-broker loop. Flip the ref so the
          // poll loop returns null on its next tick, then mark the
          // sync ready so the bar finishes to 100% and the overlay
          // auto-dismisses normally.
          skipWaitRef.current = true;
          setOverlaySteps((prev) => ({
            ...prev,
            transactions: {
              state: "in_progress",
              waitingForBroker: false,
              count: 0,
            },
          }));
          setOverlayReady(true);
          stopOverlayTimer();
        }}
      />
    </div>
  );
}
