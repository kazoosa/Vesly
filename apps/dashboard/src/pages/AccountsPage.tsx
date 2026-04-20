import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "../components/money";

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

  const disconnect = useMutation({
    mutationFn: (itemId: string) =>
      f(`/api/portfolio/accounts/${itemId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const refresh = useMutation({
    mutationFn: () => f("/api/snaptrade/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });

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
          <h1 className="text-xl font-semibold text-white">Connected accounts</h1>
          <p className="text-xs text-slate-500 mt-1">
            {groups.size} brokerage{groups.size === 1 ? "" : "s"} · {q.data?.accounts.length ?? 0} accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <button
              className="btn-ghost text-xs text-slate-500"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...groups.entries()].map(([itemId, g]) => {
          const total = g.accounts.reduce((s, a) => s + a.current_balance, 0);
          return (
            <div key={itemId} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: g.color }}
                  >
                    {g.institution[0]}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white">{g.institution}</div>
                    <div className="text-[10px] text-slate-500 font-mono">item: {itemId.slice(-12)}</div>
                  </div>
                </div>
                <button
                  className="btn-danger text-xs"
                  onClick={() => {
                    if (confirm(`Disconnect ${g.institution}?`)) disconnect.mutate(itemId);
                  }}
                >
                  Disconnect
                </button>
              </div>
              <div className="space-y-2">
                {g.accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0"
                  >
                    <div>
                      <div className="text-sm text-white">{a.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {a.subtype} · ···{a.mask}
                      </div>
                    </div>
                    <div className="font-num text-sm text-white">{fmtUsd(a.current_balance)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between">
                <span className="text-xs text-slate-500">Total value</span>
                <span className="font-num text-white">{fmtUsd(total)}</span>
              </div>
            </div>
          );
        })}
        {groups.size === 0 && (
          <div className="md:col-span-2 card p-10 text-center text-slate-400 text-sm">
            No brokerages connected. Use "+ Connect brokerage" in the sidebar.
          </div>
        )}
      </div>
    </div>
  );
}
