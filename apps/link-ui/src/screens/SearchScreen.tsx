import { useEffect, useState } from "react";
import { api, type Institution } from "../api";

export function SearchScreen({ onPick }: { onPick: (inst: Institution) => void }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .institutions(query || undefined)
        .then((r) => setRows(r.institutions))
        .finally(() => setLoading(false));
    }, query ? 180 : 0);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="flex-1 flex flex-col p-6">
      <h2 className="text-lg font-semibold mb-4">Select your bank</h2>
      <input
        autoFocus
        className="fl-input"
        placeholder="Search 20+ institutions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-4 flex-1 overflow-y-auto -mx-2">
        {loading && <div className="text-sm text-slate-500 px-2">Searching…</div>}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-slate-400 px-2">No results. Try "Chase" or "Fidelity".</div>
        )}
        <ul>
          {rows.map((i) => (
            <li key={i.id}>
              <button
                className="w-full flex items-center gap-3 px-2 py-3 hover:bg-bg-overlay rounded-lg text-left"
                onClick={() => onPick(i)}
              >
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: i.primaryColor }}
                >
                  {i.name[0]}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-xs text-slate-500">{i.supportedProducts.slice(0, 3).join(" · ")}</div>
                </div>
                <span className="text-slate-600">›</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button className="fl-btn-ghost mt-2 w-full" disabled>
        Don't see your bank?
      </button>
    </div>
  );
}
