import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setFields({});
    setBusy(true);
    try {
      await register(name, email, password);
      nav("/");
    } catch (e) {
      const err = e as Error & { fields?: Record<string, string> };
      setFields(err.fields ?? {});
      // Only show the general error if there are no field-level ones
      if (!err.fields || Object.keys(err.fields).length === 0) {
        setErr(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg-base">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-8">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-green to-emerald-700 inline-flex items-center justify-center text-bg-base text-sm font-bold">
            $
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-white">All Accounts</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Stocks</span>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-white mb-1">Create account</h1>
        <p className="text-sm text-slate-400 mb-6">Start tracking your portfolio</p>

        <Field label="Name" error={fields.name}>
          <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" error={fields.email}>
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" error={fields.password} hint="At least 8 characters">
          <input
            type="password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {err && <div className="text-sm text-rose-400 mb-3">{err}</div>}
        <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <div className="text-xs text-slate-500 mt-4 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-accent-green hover:underline">
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      {children}
      {error ? (
        <div className="text-xs text-rose-400 mt-1">{error}</div>
      ) : hint ? (
        <div className="text-xs text-slate-500 mt-1">{hint}</div>
      ) : null}
    </div>
  );
}
