import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { developer } = useAuth();
  if (!developer) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Settings</h1>
      <ProfileSection />
      <SecuritySection />
      <AppearanceSection />
      <DangerSection />
      <AppInfoSection />
    </div>
  );
}

/* ---------- Profile ---------- */

function ProfileSection() {
  const { developer, updateProfile } = useAuth();
  const [name, setName] = useState(developer?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function save() {
    setBusy(true);
    setOk(false);
    setErr(null);
    setFields({});
    try {
      await updateProfile(name);
      setOk(true);
    } catch (e) {
      const E = e as Error & { fields?: Record<string, string> };
      setFields(E.fields ?? {});
      if (!E.fields || Object.keys(E.fields).length === 0) setErr(E.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Profile">
      <Field label="Name" error={fields.name}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email">
        <input className="input" value={developer?.email ?? ""} disabled />
        <div className="text-[11px] text-slate-500 mt-1">
          Email can't be changed (yet).
        </div>
      </Field>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {ok && <div className="text-sm text-emerald-400">Saved.</div>}
      <button
        className="btn-primary"
        disabled={busy || !name || name === developer?.name}
        onClick={save}
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
    </Section>
  );
}

/* ---------- Security ---------- */

function SecuritySection() {
  const { changePassword, signOutAll } = useAuth();
  const nav = useNavigate();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit() {
    setBusy(true);
    setOk(false);
    setErr(null);
    setFields({});
    try {
      await changePassword(cur, next);
      setOk(true);
      setCur("");
      setNext("");
    } catch (e) {
      const E = e as Error & { fields?: Record<string, string> };
      setFields(E.fields ?? {});
      if (!E.fields || Object.keys(E.fields).length === 0) setErr(E.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    if (!confirm("Sign out of every device? You'll need to log back in here too.")) return;
    await signOutAll();
    nav("/login");
  }

  return (
    <Section title="Security">
      <Field label="Current password" error={fields.current_password}>
        <input
          className="input"
          type="password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
        />
      </Field>
      <Field label="New password" error={fields.new_password} hint="At least 8 characters">
        <input
          className="input"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {ok && (
        <div className="text-sm text-emerald-400">
          Password changed. Other devices will be signed out automatically.
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          className="btn-primary"
          disabled={busy || !cur || next.length < 8}
          onClick={submit}
        >
          {busy ? "Updating…" : "Change password"}
        </button>
        <button className="btn-ghost" onClick={signOutEverywhere}>
          Sign out of all devices
        </button>
      </div>
    </Section>
  );
}

/* ---------- Appearance ---------- */

function AppearanceSection() {
  return (
    <Section title="Appearance">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-white">Theme</div>
          <div className="text-xs text-slate-500">
            Dark mode is the only theme for now. Light mode coming later.
          </div>
        </div>
        <span className="badge-gray">Dark</span>
      </div>
    </Section>
  );
}

/* ---------- Danger zone ---------- */

function DangerSection() {
  const { developer, deleteAccount } = useAuth();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const matches = confirm.trim().toLowerCase() === (developer?.email ?? "").toLowerCase();

  async function doDelete() {
    if (!matches) return;
    if (!window.confirm("This deletes your account and all your data. Really?")) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAccount(confirm);
      nav("/login");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Danger zone" tone="danger">
      <p className="text-sm text-slate-300">
        Deleting your account removes all your connected brokerages, holdings, transactions, and
        history. This cannot be undone.
      </p>
      <Field
        label={`Type your email (${developer?.email}) to confirm`}
        error={err ?? undefined}
      >
        <input
          className="input"
          placeholder={developer?.email}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <button className="btn-danger" disabled={!matches || busy} onClick={doDelete}>
        {busy ? "Deleting…" : "Delete my account"}
      </button>
    </Section>
  );
}

/* ---------- App info ---------- */

function AppInfoSection() {
  const env = (import.meta.env.MODE ?? "development") as string;
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";
  return (
    <Section title="About">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-slate-500">Version</div>
        <div className="font-num text-slate-300">0.1.0</div>
        <div className="text-slate-500">Environment</div>
        <div className="font-num text-slate-300">{env}</div>
        <div className="text-slate-500">API</div>
        <div className="font-num text-slate-300 truncate">{apiUrl}</div>
      </div>
    </Section>
  );
}

/* ---------- Presentation helpers ---------- */

function Section({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div
      className={`card p-5 space-y-3 ${
        tone === "danger" ? "border-rose-900/50" : ""
      }`}
    >
      <div
        className={`text-xs font-semibold uppercase tracking-wider ${
          tone === "danger" ? "text-rose-400" : "text-slate-400"
        }`}
      >
        {title}
      </div>
      {children}
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
    <div>
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
