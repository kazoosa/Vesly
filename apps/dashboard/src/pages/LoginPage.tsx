import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("demo@finlink.dev");
  const [password, setPassword] = useState("demo1234");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e) {
      setErr((e as Error).message);
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
        <h1 className="text-xl font-semibold text-white mb-1">Sign in</h1>
        <p className="text-sm text-slate-400 mb-6">Track all your investments in one place</p>
        <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
        <input className="input mb-3" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
        <input
          type="password"
          className="input mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div className="text-sm text-rose-400 mb-3">{err}</div>}
        <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="text-xs text-slate-500 mt-4 text-center">
          Need an account?{" "}
          <Link to="/register" className="text-accent-green hover:underline">
            Register
          </Link>
        </div>
        <div className="text-[10px] text-slate-600 mt-6 text-center border-t border-border-subtle pt-4">
          Demo: demo@finlink.dev / demo1234
        </div>
      </form>
    </div>
  );
}
