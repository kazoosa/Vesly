import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "./money";

type Broker =
  | "fidelity"
  | "schwab"
  | "vanguard"
  | "robinhood"
  | "td_ameritrade"
  | "webull"
  | "ibkr";

interface ParsedGroup {
  accountName: string;
  accountMask: string | null;
  positions: Array<{
    ticker: string;
    name: string;
    quantity: number;
    price: number;
    avgCost?: number;
    type?: string;
  }>;
}

interface Preview {
  broker: Broker;
  broker_label: string;
  kind?: "positions" | "activity";
  groups: ParsedGroup[];
  total_holdings: number;
  total_value: number;
  total_transactions?: number;
  transaction_counts?: Record<string, number>;
}

interface DetectResult {
  broker: Broker | null;
  label?: string;
  reason?: "unrecognized" | "ambiguous";
  message?: string;
}

export function CsvImport() {
  const { accessToken } = useAuth();
  const f = apiFetch(() => accessToken);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [broker, setBroker] = useState<Broker | null>(null);
  const [detected, setDetected] = useState<Broker | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<{
    broker_label: string;
    accounts: number;
    holdings: number;
    transactions: number;
    dividends: number;
    kind: "positions" | "activity";
  } | null>(null);

  const brokers = useQuery({
    queryKey: ["csv-brokers"],
    queryFn: () => f<{ brokers: Array<{ key: Broker; label: string }> }>("/api/csv/brokers"),
  });

  const detectMut = useMutation({
    mutationFn: (args: { csv: string }) =>
      f<DetectResult>("/api/csv/detect", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: (data) => {
      if (data.broker) {
        setDetected(data.broker);
        setBroker(data.broker);
        setOverrideOpen(false);
        setErr(null);
      } else {
        setDetected(null);
        setBroker(null);
        setOverrideOpen(true);
        setErr(data.message ?? "Couldn't identify this CSV format.");
      }
    },
    onError: (e: Error) => {
      setDetected(null);
      setBroker(null);
      setOverrideOpen(true);
      setErr(e.message);
    },
  });

  const previewMut = useMutation({
    mutationFn: (args: { broker: Broker; csv: string }) =>
      f<Preview>("/api/csv/preview", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: (data) => {
      setPreview(data);
      setErr(null);
    },
    onError: (e: Error) => setErr(e.message),
  });

  function clearStagingArea() {
    setCsv("");
    setFileName("");
    setBroker(null);
    setDetected(null);
    setOverrideOpen(false);
    setPreview(null);
    setErr(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const importMut = useMutation({
    mutationFn: (args: { broker: Broker; csv: string }) =>
      f<{
        broker_label: string;
        accounts: number;
        holdings: number;
        transactions: number;
        dividends: number;
        kind: "positions" | "activity";
      }>("/api/csv/import", {
        method: "POST",
        body: JSON.stringify(args),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries();
      setLastImport({
        broker_label: data.broker_label,
        accounts: data.accounts ?? 0,
        holdings: data.holdings ?? 0,
        transactions: data.transactions ?? 0,
        dividends: data.dividends ?? 0,
        kind: data.kind,
      });
      clearStagingArea();
    },
    onError: (e: Error) => {
      // Always invalidate caches — a 5xx may still have committed (e.g.
      // the import succeeded but a downstream side-effect threw). The
      // user gets a friendlier message in that case so they don't think
      // their data is lost.
      qc.invalidateQueries();
      // Clear the preview / file so the user isn't left staring at
      // stale rows with no obvious way forward. The error message and
      // the persistent dropzone make "try again" obvious.
      clearStagingArea();
      const status = (e as { status?: number }).status;
      if (status && status >= 500) {
        setErr(
          "The server hiccupped, but your data may have been saved. Refresh the page or check the Holdings tab — your import may already be there.",
        );
      } else {
        setErr(e.message);
      }
    },
  });

  function reset() {
    clearStagingArea();
  }

  async function ingestFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    setPreview(null);
    setErr(null);
    // Auto-detect on ingest — most imports resolve without a click.
    detectMut.mutate({ csv: text });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestFile(file);
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-fg-primary">Import from CSV</h3>
          <p className="text-xs text-fg-muted mt-0.5">
            Drop in your broker's positions or activity export — we detect the format
            automatically.
          </p>
        </div>
      </div>

      {lastImport && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="text-xs text-emerald-300 min-w-0">
            <div className="font-semibold uppercase tracking-widest text-[10px] mb-0.5">
              Import complete
            </div>
            <div>
              <span className="text-fg-primary font-medium">{lastImport.broker_label}</span>
              {" · "}
              {lastImport.accounts > 0 && (
                <span>
                  {lastImport.accounts} account{lastImport.accounts === 1 ? "" : "s"}
                </span>
              )}
              {lastImport.holdings > 0 && (
                <span> · {lastImport.holdings} holding{lastImport.holdings === 1 ? "" : "s"}</span>
              )}
              {lastImport.transactions > 0 && (
                <span>
                  {" · "}
                  {lastImport.transactions} transaction{lastImport.transactions === 1 ? "" : "s"}
                </span>
              )}
              {lastImport.dividends > 0 && (
                <span>
                  {" · "}
                  {lastImport.dividends} dividend{lastImport.dividends === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                clearStagingArea();
                setLastImport(null);
                fileRef.current?.click();
              }}
              className="btn-primary text-xs"
            >
              + Add another CSV
            </button>
            <button
              type="button"
              onClick={() => setLastImport(null)}
              className="text-emerald-300/70 hover:text-emerald-200 text-xs px-2"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {!preview && (
        <>
          <div>
            <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              CSV file
            </label>
            <div
              className="rounded-lg border border-dashed border-border-subtle bg-bg-inset px-4 py-6 text-center cursor-pointer hover:border-border-strong transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={async (e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                await ingestFile(file);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onFile}
              />
              <div className="text-2xl mb-2 text-fg-muted">⬆</div>
              {fileName ? (
                <div className="text-sm text-fg-primary font-medium">{fileName}</div>
              ) : (
                <div className="text-sm text-fg-secondary">
                  Click to choose a file, or drag & drop
                </div>
              )}
              <div className="text-[10px] text-fg-muted mt-1">
                Fidelity, Schwab, Vanguard, Robinhood, TD Ameritrade, Webull,
                or Interactive Brokers export
              </div>
            </div>
          </div>

          {/* Detection status */}
          {csv && (
            <div className="rounded-lg border border-border-subtle bg-bg-inset p-3 flex items-center justify-between gap-3">
              <div className="text-xs">
                {detectMut.isPending ? (
                  <span className="text-fg-muted">Detecting broker…</span>
                ) : broker && !overrideOpen ? (
                  <span className="text-fg-secondary">
                    Detected:{" "}
                    <span className="text-fg-primary font-semibold">
                      {brokers.data?.brokers.find((b) => b.key === broker)?.label ?? broker}
                    </span>
                    {detected === broker && (
                      <button
                        type="button"
                        onClick={() => setOverrideOpen(true)}
                        className="ml-2 text-[11px] text-fg-muted hover:text-fg-primary underline-offset-2 hover:underline"
                      >
                        Not right?
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="text-fg-muted">
                    Couldn't identify this format — pick manually.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Manual override picker — opens when detection fails or
              the user clicks "Not right?". */}
          {csv && overrideOpen && (
            <div>
              <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
                Broker
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(brokers.data?.brokers ?? []).map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => {
                      setBroker(b.key);
                      setOverrideOpen(false);
                      setErr(null);
                    }}
                    className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all border ${
                      broker === b.key
                        ? "border-border-strong bg-bg-overlay text-fg-primary"
                        : "border-border-subtle bg-bg-inset text-fg-secondary hover:bg-bg-hover"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 flex items-start justify-between gap-3">
              <div className="text-xs text-rose-300">{err}</div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-[11px] text-rose-200 hover:text-rose-100 underline-offset-2 hover:underline"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setErr(null)}
                  className="text-rose-300/70 hover:text-rose-100 text-xs"
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              className="btn-primary"
              disabled={!csv || !broker || previewMut.isPending || detectMut.isPending}
              onClick={() => broker && previewMut.mutate({ broker, csv })}
            >
              {previewMut.isPending ? "Parsing…" : "Preview import"}
            </button>
            {csv && (
              <button className="btn-ghost" onClick={reset}>
                Clear
              </button>
            )}
          </div>

          <details className="text-[11px] text-fg-muted">
            <summary className="cursor-pointer hover:text-fg-secondary">
              Where do I find this file?
            </summary>
            <div className="mt-2 space-y-1 pl-2 border-l border-border-subtle">
              <p>
                <b className="text-fg-secondary">Fidelity:</b> Portfolio → Positions → Download →
                choose "All accounts". Activity: History → Download
              </p>
              <p>
                <b className="text-fg-secondary">Schwab:</b> Accounts → Positions → Export (CSV)
              </p>
              <p>
                <b className="text-fg-secondary">Vanguard:</b> My Holdings → Download CSV
              </p>
              <p>
                <b className="text-fg-secondary">Robinhood:</b> no native export; use a 3-column
                CSV: Symbol, Quantity, Price
              </p>
              <p>
                <b className="text-fg-secondary">TD Ameritrade:</b> My Account → Download → choose
                "Account Positions" or "Transaction History"
              </p>
              <p>
                <b className="text-fg-secondary">Webull:</b> Account → Statements → Export
                Positions or Orders CSV
              </p>
              <p>
                <b className="text-fg-secondary">IBKR:</b> Reports → Flex Queries → run a
                "Portfolio Snapshot" or Activity Statement, save as CSV
              </p>
            </div>
          </details>
        </>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="rounded-lg bg-bg-inset border border-border-subtle p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-fg-muted">Ready to import</div>
              <div className="text-sm font-semibold text-fg-primary mt-0.5">
                {preview.kind === "activity" ? (
                  <>
                    {preview.broker_label} · {preview.total_transactions ?? 0} transactions
                    {preview.transaction_counts && (
                      <span className="text-fg-muted font-normal ml-2">
                        ({Object.entries(preview.transaction_counts)
                          .map(([k, v]) => `${v} ${k}`)
                          .join(", ")})
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {preview.broker_label} · {preview.total_holdings} holdings ·{" "}
                    <span className="font-num">{fmtUsd(preview.total_value)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {preview.groups.map((g, gi) => (
            <div key={gi} className="rounded-lg border border-border-subtle overflow-hidden">
              <div className="px-4 py-2 bg-bg-inset text-xs font-semibold text-fg-secondary flex items-center justify-between">
                <span>
                  {g.accountName}
                  {g.accountMask && (
                    <span className="font-num text-fg-muted ml-2">···{g.accountMask}</span>
                  )}
                </span>
                <span className="text-fg-muted font-num">
                  {g.positions.length} positions
                </span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Name</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {g.positions.slice(0, 20).map((p, pi) => (
                    <tr key={pi}>
                      <td className="font-num text-fg-primary font-semibold">{p.ticker}</td>
                      <td className="text-xs text-fg-secondary max-w-[240px] truncate">
                        {p.name}
                      </td>
                      <td className="text-right font-num text-fg-secondary">
                        {p.quantity.toFixed(4)}
                      </td>
                      <td className="text-right font-num text-fg-secondary">
                        {fmtUsd(p.price)}
                      </td>
                      <td className="text-right font-num text-fg-primary">
                        {fmtUsd(p.quantity * p.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {g.positions.length > 20 && (
                <div className="text-[10px] text-fg-muted text-center py-2 bg-bg-inset">
                  …and {g.positions.length - 20} more
                </div>
              )}
            </div>
          ))}

          {err && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 flex items-start justify-between gap-3">
              <div className="text-xs text-rose-300">{err}</div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-[11px] text-rose-200 hover:text-rose-100 underline-offset-2 hover:underline"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setErr(null)}
                  className="text-rose-300/70 hover:text-rose-100 text-xs"
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              className="btn-primary"
              disabled={!broker || importMut.isPending}
              onClick={() => broker && importMut.mutate({ broker, csv })}
            >
              {importMut.isPending
                ? "Importing…"
                : preview.kind === "activity"
                ? `Import ${preview.total_transactions ?? 0} transactions`
                : `Import ${preview.total_holdings} holdings`}
            </button>
            <button className="btn-ghost" onClick={() => setPreview(null)}>
              Back
            </button>
          </div>
          <div className="text-[10px] text-fg-muted">
            Re-importing the same broker replaces its existing CSV-sourced holdings (idempotent).
            Does not affect auto-synced accounts.
          </div>
        </div>
      )}
    </div>
  );
}
