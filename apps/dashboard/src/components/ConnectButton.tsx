import { useEffect, useState } from "react";
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
  // Surface what the post-connect sync actually pulled. Without this,
  // a successful connect that finds zero history is indistinguishable
  // from a silent failure — both leave Transactions/Dividends blank.
  const [syncResult, setSyncResult] = useState<
    | { ok: true; accounts: number; holdings: number; transactions: number }
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

  async function afterSnapTradeConnect() {
    setSyncResult(null);
    try {
      const out = await fetcher<{
        connections: number;
        accounts: number;
        holdings: number;
        transactions: number;
      }>("/api/snaptrade/sync", { method: "POST" });
      setSyncResult({
        ok: true,
        accounts: out.accounts ?? 0,
        holdings: out.holdings ?? 0,
        transactions: out.transactions ?? 0,
      });
    } catch (err) {
      console.error("sync failed", err);
      setSyncResult({ ok: false, message: (err as Error).message });
    }
    qc.invalidateQueries();
  }

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
        <div
          role="status"
          className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-[12px] leading-snug text-emerald-700 dark:text-emerald-300"
        >
          <div className="font-semibold">Sync complete</div>
          <div className="mt-1">
            {syncResult.accounts} account{syncResult.accounts === 1 ? "" : "s"},{" "}
            {syncResult.holdings} holding{syncResult.holdings === 1 ? "" : "s"},{" "}
            {syncResult.transactions} transaction{syncResult.transactions === 1 ? "" : "s"} pulled.
          </div>
          {syncResult.transactions === 0 && (
            <div className="mt-1 text-[11px] opacity-80">
              No transactions came back from your broker for the last 5 years. Some
              brokerages (Robinhood, certain Vanguard accounts) only expose holdings
              through SnapTrade — trade history needs an activity CSV in that case.
            </div>
          )}
        </div>
      )}
      {syncResult?.ok === false && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[12px] leading-snug text-rose-700 dark:text-rose-300"
        >
          <div className="font-semibold">Sync failed</div>
          <div className="mt-1">{syncResult.message}</div>
        </div>
      )}

      <SnapTradeReact
        loginLink={snapLoginLink ?? ""}
        isOpen={Boolean(snapLoginLink)}
        close={() => setSnapLoginLink(null)}
        onSuccess={(id: unknown) => {
          console.log("SnapTrade connected:", id);
          afterSnapTradeConnect();
          setSnapLoginLink(null);
        }}
        onError={(err: unknown) => {
          console.error("SnapTrade error:", err);
          setError("Connection failed — please try again.");
          setSnapLoginLink(null);
        }}
        onExit={() => {
          // User closed without connecting. Still run a sync in case they
          // added an account — no-op if not.
          afterSnapTradeConnect();
          setSnapLoginLink(null);
        }}
      />
    </div>
  );
}
