import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SnapTradeReact } from "snaptrade-react";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";

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
  const fetcher = apiFetch(() => accessToken);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapLoginLink, setSnapLoginLink] = useState<string | null>(null);
  const syncFiredRef = useRef(false);
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

  /**
   * Sync after a brokerage was just connected.
   *
   * `firstConnect=true` means this fires from SnapTradeReact's
   * onSuccess (vs the Refresh button). Some brokers — Robinhood
   * especially — lag 30-60s between authorizing the connection and
   * having transaction history available via SnapTrade's API. If the
   * first call returns transactions: 0, we wait and retry once before
   * showing the result, so the user doesn't see a fake-empty banner
   * and have to click Refresh.
   */
  async function afterSnapTradeConnect(firstConnect = false) {
    setSyncResult(null);
    if (firstConnect) {
      setSyncResult({
        ok: true,
        accounts: 0,
        holdings: 0,
        transactions: 0,
        fully_succeeded: true,
        // pending flag drives a "Pulling your history…" message in the
        // banner so the user sees activity instead of an empty banner
        // while we wait for SnapTrade to catch up.
        pending: true,
      });
    }
    try {
      let out = await runOneSync();
      // Aggressive retry on cold-start lag. Only on first connects,
      // only when we got 0 transactions AND 0 raw activities back
      // (the cold-start signature — distinguishes from "user has no
      // history" which still returns the activity rows we asked for).
      // Three attempts total at 0s + 5s + 15s ≈ 20s wall time worst
      // case. After that we trust the result and stop hammering
      // SnapTrade's API.
      const RETRY_DELAYS_MS = [5_000, 15_000];
      for (const delay of RETRY_DELAYS_MS) {
        const empty =
          firstConnect &&
          (out.transactions ?? 0) === 0 &&
          (out.raw_activities ?? 0) === 0;
        if (!empty) break;
        await new Promise((r) => setTimeout(r, delay));
        out = await runOneSync();
      }
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
    } catch (err) {
      // The endpoint itself throwing is now rare — every per-call
      // failure is wrapped on the backend. This branch is for true
      // outages (backend down, network error, JSON parse failure).
      console.error("sync endpoint unreachable", err);
      setSyncResult({ ok: false, message: (err as Error).message });
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
            return (
              <div
                role="status"
                className={`mt-3 rounded-md border p-2.5 text-[12px] leading-snug ${tone}`}
              >
                <div className="font-semibold">Pulling history…</div>
                <div className="mt-1 opacity-90">
                  Connection accepted. Some brokers (notably Robinhood) take
                  up to a minute to expose transaction history after first
                  connect — this banner will update as soon as the data arrives.
                </div>
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
                {syncResult.transactions} transaction{syncResult.transactions === 1 ? "" : "s"} pulled
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

      <SnapTradeReact
        loginLink={snapLoginLink ?? ""}
        isOpen={Boolean(snapLoginLink)}
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
          // SnapTradeReact fires both onSuccess and onExit on a successful
          // connect. Without the ref guard we'd kick off two parallel
          // /sync calls (~25s each) on every connect. onExit without
          // a successful onSuccess means the user closed the modal
          // mid-flow, possibly after adding an extra account — sync
          // anyway, but as a "first connect" so the same retry-once
          // logic applies.
          if (!syncFiredRef.current) {
            afterSnapTradeConnect(true);
          }
          syncFiredRef.current = false;
          setSnapLoginLink(null);
        }}
      />
    </div>
  );
}
