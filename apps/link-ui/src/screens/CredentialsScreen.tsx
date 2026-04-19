import { useState } from "react";

export function CredentialsScreen({
  institution,
  onBack,
  onSubmit,
}: {
  institution: { id: string; name: string; primaryColor: string };
  onBack: () => void;
  onSubmit: (u: string, p: string) => Promise<void>;
}) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="flex-1 flex flex-col p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
          await onSubmit(u, p);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <button type="button" className="text-sm text-slate-400 mb-4" onClick={onBack}>
        ← Back
      </button>
      <div className="flex items-center gap-3 mb-4">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: institution.primaryColor }}
        >
          {institution.name[0]}
        </span>
        <div>
          <div className="font-semibold">{institution.name}</div>
          <div className="text-xs text-slate-500">Sign in with your online banking credentials</div>
        </div>
      </div>
      <div className="space-y-3 flex-1">
        <input
          className="fl-input"
          autoFocus
          placeholder="Username"
          value={u}
          onChange={(e) => setU(e.target.value)}
        />
        <input
          className="fl-input"
          placeholder="Password"
          type="password"
          value={p}
          onChange={(e) => setP(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" className="rounded" /> Remember this device
        </label>
        <button type="button" className="text-sm text-slate-500 hover:text-slate-300" disabled>
          Forgot password?
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-4 mb-3">
        Sandbox: any credentials work. Use <code className="text-accent-green">user_bad</code> to simulate failure.
      </p>
      <button type="submit" className="fl-btn-primary w-full" disabled={!u || !p || submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
