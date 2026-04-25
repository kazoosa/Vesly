import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "../components/money";
import { CsvImport } from "../components/CsvImport";
import { ConnectButton } from "../components/ConnectButton";

const DEMO_EMAIL = "demo@finlink.dev";

interface Account {
  id: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
  current_balance: number;
  institution: string;
  institution_color: string;
  item_id: string;
}

export function AccountsPage() {
  const { accessToken, developer } = useAuth();
  const f = apiFetch(() => accessToken);
  const qc = useQueryClient();
  const isDemo = developer?.email === DEMO_EMAIL;

  const q = useQuery({
    queryKey: ["accounts"],
    queryFn: () => f<{ accounts: Account[] }>("/api/portfolio/accounts"),
  });

  // Per-row state: which item is pending disconnect, and which item
  // should show the green "Disconnected" banner for 3 seconds after
  // success before the query invalidation drops it naturally.
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [confirmItemId, setConfirmItemId] = useState<string | null>(null);
  const [justDisconnectedItemId, setJustDisconnectedItemId] = useState<string | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  const disconnect = useMutation({
    mutationFn: (itemId: string) => {
      setPendingItemId(itemId);
      return f(`/api/portfolio/accounts/${itemId}`, { method: "DELETE" });
    },
    onSuccess: (_data, itemId) => {
      setPendingItemId(null);
      setJustDisconnectedItemId(itemId);
      qc.invalidateQueries();
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = window.setTimeout(
        () => setJustDisconnectedItemId(null),
        3000,
      );
    },
    onError: () => setPendingItemId(null),
  });

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    };
  }, []);

  type SyncError = {
    step: string;
    accountId?: string;
    message: string;
    status?: number;
  };
  const refresh = useMutation({
    mutationFn: () =>
      f<{
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
      }>("/api/snaptrade/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const STEP_LABELS: Record<string, string> = {
    list_connections: "Listing connections",
    list_accounts: "Listing accounts",
    positions: "Holdings (positions)",
    options: "Options holdings",
    activities: "Transactions & dividends",
  };

  const wipeMock = useMutation({
    mutationFn: () => f<{ removed: number }>("/api/portfolio/wipe-demo", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  // Group by item (brokerage connection)
  const groups = new Map<string, { institution: string; color: string; accounts: Account[] }>();
  for (const a of q.data?.accounts ?? []) {
    const g = groups.get(a.item_id) ?? {
      institution: a.institution,
      color: a.institution_color,
      accounts: [],
    };
    g.accounts.push(a);
    groups.set(a.item_id, g);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Connected accounts</h1>
          <p className="text-xs text-fg-muted mt-1">
            {groups.size} brokerage{groups.size === 1 ? "" : "s"} · {q.data?.accounts.length ?? 0} accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <button
              className="btn-ghost text-xs text-fg-muted"
              onClick={() => {
                if (confirm("Clear all sample / mock brokerages? (Real SnapTrade connections are kept.)"))
                  wipeMock.mutate();
              }}
              disabled={wipeMock.isPending}
            >
              {wipeMock.isPending ? "Clearing…" : "Clear sample data"}
            </button>
          )}
          <button
            className="btn-ghost text-xs"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            {refresh.isPending ? "Refreshing…" : "↻ Refresh now"}
          </button>
        </div>
      </div>

      {refresh.isSuccess && refresh.data && (() => {
        const isPartial = refresh.data.fully_succeeded === false;
        const errs = refresh.data.errors ?? [];
        const tone = isPartial
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
        return (
          <div
            role="status"
            className={`rounded-md border px-3 py-2 text-xs space-y-1 ${tone}`}
          >
            <div>
              <strong>{isPartial ? "Partial sync" : "Last sync"}:</strong>{" "}
              {refresh.data.accounts} account{refresh.data.accounts === 1 ? "" : "s"},{" "}
              {refresh.data.holdings} holding{refresh.data.holdings === 1 ? "" : "s"},{" "}
              {refresh.data.transactions} transaction{refresh.data.transactions === 1 ? "" : "s"}
              {(refresh.data.options_fetched ?? 0) > 0 && (
                <>, {refresh.data.options_fetched} option contract{refresh.data.options_fetched === 1 ? "" : "s"}</>
              )}
              .
            </div>
            {isPartial && errs.length > 0 && (
              <div className="space-y-0.5">
                <div className="font-semibold text-[10px] uppercase tracking-widest mt-1">
                  Failed steps:
                </div>
                <ul className="list-disc list-inside opacity-90">
                  {errs.map((e, i) => (
                    <li key={i}>
                      <strong>{STEP_LABELS[e.step] ?? e.step}</strong>
                      {e.accountId && (
                        <span className="opacity-70"> · {e.accountId.slice(0, 8)}…</span>
                      )}
                      {e.status && <span className="opacity-70"> · HTTP {e.status}</span>}
                      <span className="opacity-80">: {e.message}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-[11px] opacity-80 mt-1">
                  Click <strong>Refresh now</strong> to retry the failed steps. Successful data above is already saved.
                </div>
              </div>
            )}
            {!isPartial && refresh.data.transactions === 0 && (
              <div className="opacity-80">
                {(refresh.data.raw_activities ?? 0) === 0 ? (
                  <>
                    SnapTrade returned <strong>0 raw activities</strong>. Either there's no
                    trade history in the configured window, or your broker hasn't shared it
                    yet (some take up to 24h after first connect). Try Refresh again later
                    or import an activity CSV below.
                  </>
                ) : (
                  <>
                    SnapTrade returned <strong>{refresh.data.raw_activities}</strong>{" "}
                    activities, but{" "}
                    <strong>{refresh.data.skipped_unknown}</strong> had unrecognised type
                    labels:{" "}
                    <code className="text-[10px] bg-fg-primary/10 px-1 rounded">
                      {(refresh.data.skipped_labels ?? []).join(", ") || "—"}
                    </code>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}
      {refresh.isError && (
        <div
          role="alert"
          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
        >
          Sync request failed: {(refresh.error as Error)?.message ?? "Unknown error"}
        </div>
      )}

      {/* Primary CTA — Connect a brokerage. Always visible, not just
          buried in the empty state. */}
      <div className="card p-4 md:p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg-primary">
            Connect a Brokerage
          </div>
          <div className="text-xs text-fg-muted mt-0.5">
            Auto-sync via SnapTrade, or import a CSV below.
          </div>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[220px]">
          <ConnectButton />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...groups.entries()].map(([itemId, g]) => {
          const total = g.accounts.reduce((s, a) => s + a.current_balance, 0);
          return (
            <div key={itemId} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-fg-primary text-sm font-bold"
                    style={{ backgroundColor: g.color }}
                  >
                    {g.institution[0]}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-fg-primary">{g.institution}</div>
                    <div className="text-[10px] text-fg-muted font-mono">item: {itemId.slice(-12)}</div>
                  </div>
                </div>
                <DisconnectControl
                  institution={g.institution}
                  pending={pendingItemId === itemId}
                  justDisconnected={justDisconnectedItemId === itemId}
                  confirmOpen={confirmItemId === itemId}
                  onAskConfirm={() => setConfirmItemId(itemId)}
                  onCancel={() => setConfirmItemId(null)}
                  onConfirm={() => {
                    setConfirmItemId(null);
                    disconnect.mutate(itemId);
                  }}
                />
              </div>
              <div className="space-y-2">
                {g.accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0"
                  >
                    <div>
                      <div className="text-sm text-fg-primary">{a.name}</div>
                      <div className="text-[10px] text-fg-muted">
                        {a.subtype} · ···{a.mask}
                      </div>
                    </div>
                    <div className="font-num text-sm text-fg-primary">{fmtUsd(a.current_balance)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between">
                <span className="text-xs text-fg-muted">Total value</span>
                <span className="font-num text-fg-primary">{fmtUsd(total)}</span>
              </div>
            </div>
          );
        })}
        {groups.size === 0 && (
          <div className="md:col-span-2 card p-10 text-center text-fg-secondary text-sm">
            No brokerages connected yet. Use the "Connect a Brokerage" button
            above — or import a CSV below.
          </div>
        )}
      </div>

      <CsvImport />
    </div>
  );
}

/**
 * Three-state disconnect UI:
 *   idle         → red "Disconnect" button
 *   confirmOpen  → inline Confirm/Cancel prompt (replaces the browser
 *                  `confirm()` dialog, which looks out of place)
 *   pending      → spinner + "Disconnecting…", disabled
 *   just-done    → green "Disconnected" confirmation for 3s before
 *                  the mutation's query invalidation drops the row
 */
function DisconnectControl({
  institution,
  pending,
  justDisconnected,
  confirmOpen,
  onAskConfirm,
  onCancel,
  onConfirm,
}: {
  institution: string;
  pending: boolean;
  justDisconnected: boolean;
  confirmOpen: boolean;
  onAskConfirm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (justDisconnected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs badge badge-green">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Disconnected
      </span>
    );
  }
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
        <Spinner />
        Disconnecting…
      </span>
    );
  }
  if (confirmOpen) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <span className="text-[11px] text-fg-muted mr-1">
          Disconnect {institution}?
        </span>
        <button type="button" className="btn-danger text-xs" onClick={onConfirm}>
          Confirm
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="btn-danger text-xs" onClick={onAskConfirm}>
      Disconnect
    </button>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="w-3 h-3 animate-spin text-fg-muted"
      style={{ animationDuration: "800ms" }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" fill="none" />
      <path
        d="M12 3 A9 9 0 0 1 21 12"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
