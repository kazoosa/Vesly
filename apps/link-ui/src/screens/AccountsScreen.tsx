import { useEffect, useState } from "react";
import { api, type PreviewAccount } from "../api";

export function AccountsScreen({
  sessionId,
  onBack,
  onContinue,
}: {
  sessionId: string;
  onBack: () => void;
  onContinue: (ids: string[]) => void;
}) {
  const [accounts, setAccounts] = useState<PreviewAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.previewAccounts(sessionId).then((r) => {
      setAccounts(r.accounts);
      setSelected(new Set(r.accounts.map((a) => a.id)));
      setLoading(false);
    });
  }, [sessionId]);

  const allSelected = accounts.length > 0 && selected.size === accounts.length;

  return (
    <div className="flex-1 flex flex-col p-6">
      <button type="button" className="text-sm text-slate-400 mb-4" onClick={onBack}>
        ← Back
      </button>
      <h2 className="text-lg font-semibold mb-1">Select accounts</h2>
      <p className="text-sm text-slate-400 mb-4">Choose which accounts to share.</p>

      <button
        className="text-sm text-accent-green mb-3 self-start"
        onClick={() =>
          setSelected((s) =>
            allSelected ? new Set() : new Set(accounts.map((a) => a.id)),
          )
        }
      >
        {allSelected ? "Deselect all" : "Select all"}
      </button>

      <div className="flex-1 overflow-y-auto -mx-2">
        {loading && <div className="px-2 text-sm text-slate-500">Loading…</div>}
        <ul className="space-y-2">
          {accounts.map((a) => {
            const on = selected.has(a.id);
            return (
              <li key={a.id}>
                <button
                  className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border text-left ${
                    on ? "border-accent-green bg-accent-green/10" : "border-border-strong"
                  }`}
                  onClick={() => {
                    const next = new Set(selected);
                    if (on) next.delete(a.id);
                    else next.add(a.id);
                    setSelected(next);
                  }}
                >
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      {a.subtype} · ···{a.mask}
                    </div>
                  </div>
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center ${
                      on ? "bg-accent-green text-bg-base" : "border border-border-strong"
                    }`}
                  >
                    {on && "✓"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        className="fl-btn-primary w-full mt-4"
        disabled={selected.size === 0}
        onClick={() => onContinue([...selected])}
      >
        Continue ({selected.size})
      </button>
    </div>
  );
}
