import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { fmtUsd } from "./money";

type Broker = "fidelity" | "schwab" | "vanguard" | "robinhood";

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
  groups: ParsedGroup[];
  total_holdings: number;
  total_value: number;
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

  const importMut = useMutation({
    mutationFn: (args: { broker: Broker; csv: string }) =>
      f<{ accounts: number; holdings: number }>("/api/csv/import", {
        method: "POST",
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      reset();
    },
    onError: (e: Error) => setErr(e.message),
  });

  function reset() {
    setCsv("");
    setFileName("");
    setBroker(null);
    setDetected(null);
    setOverrideOpen(false);
    setPreview(null);
    setErr(null);
    if (fileRef.current) fileRef.current.value = "";
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
            Drop in your broker's positions export — we detect the format automatically.
          </p>
        </div>
      </div>

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
                Fidelity, Schwab, Vanguard, or Robinhood export
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

          {err && <div className="text-xs text-rose-500 dark:text-rose-400">{err}</div>}

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
                choose "All accounts"
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
                {preview.broker_label} · {preview.total_holdings} holdings ·{" "}
                <span className="font-num">{fmtUsd(preview.total_value)}</span>
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

          {err && <div className="text-xs text-rose-500 dark:text-rose-400">{err}</div>}

          <div className="flex items-center gap-2 pt-2">
            <button
              className="btn-primary"
              disabled={!broker || importMut.isPending}
              onClick={() => broker && importMut.mutate({ broker, csv })}
            >
              {importMut.isPending ? "Importing…" : `Import ${preview.total_holdings} holdings`}
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
