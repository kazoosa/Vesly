import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

const DEMO_EMAIL = "demo@finlink.dev";

export function SettingsPage() {
  const { developer } = useAuth();
  if (!developer) return null;
  const isDemo = developer.email === DEMO_EMAIL;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-fg-primary">Settings</h1>
      {isDemo && <DemoNotice />}
      <ProfileSection isDemo={isDemo} />
      <SecuritySection isDemo={isDemo} />
      <AppearanceSection />
      <DangerSection isDemo={isDemo} />
      <AppInfoSection />
    </div>
  );
}

/* ---------- Demo notice ---------- */

function DemoNotice() {
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-[13px] leading-relaxed">
      <div className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
        You're on the demo account
      </div>
      <p className="text-amber-900/90 dark:text-amber-100/90">
        This is a shared read-only account, so profile details, password, and
        deletion are disabled here. Theme changes still work, and anything else
        you do in the app is real-looking but never persisted beyond this
        session.
      </p>
    </div>
  );
}

/* ---------- Profile ---------- */

function ProfileSection({ isDemo }: { isDemo: boolean }) {
  const { developer, updateProfile } = useAuth();
  const [name, setName] = useState(developer?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function save() {
    if (isDemo) return;
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
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isDemo}
        />
      </Field>
      <Field label="Email">
        <input className="input" value={developer?.email ?? ""} disabled />
        <div className="text-[11px] text-fg-muted mt-1">
          {isDemo ? "The demo email is locked." : "Email can't be changed (yet)."}
        </div>
      </Field>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {ok && <div className="text-sm text-emerald-400">Saved.</div>}
      <button
        className="btn-primary"
        disabled={isDemo || busy || !name || name === developer?.name}
        onClick={save}
        title={isDemo ? "Disabled on the demo account" : undefined}
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
    </Section>
  );
}

/* ---------- Security ---------- */

function SecuritySection({ isDemo }: { isDemo: boolean }) {
  const { changePassword, signOutAll } = useAuth();
  const nav = useNavigate();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit() {
    if (isDemo) return;
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
    if (isDemo) {
      // Just sign the demo user out locally. They can re-enter via /demo.
      nav("/login");
      return;
    }
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
          disabled={isDemo}
        />
      </Field>
      <Field label="New password" error={fields.new_password} hint="At least 8 characters">
        <input
          className="input"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={isDemo}
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
          disabled={isDemo || busy || !cur || next.length < 8}
          onClick={submit}
          title={isDemo ? "Disabled on the demo account" : undefined}
        >
          {busy ? "Updating…" : "Change password"}
        </button>
        <button className="btn-ghost" onClick={signOutEverywhere}>
          {isDemo ? "Sign out" : "Sign out of all devices"}
        </button>
      </div>
    </Section>
  );
}

/* ---------- Appearance ---------- */

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const options: Array<{ value: "light" | "dark" | "system"; label: string; hint: string }> = [
    { value: "light", label: "Light", hint: "Bright, high-contrast" },
    { value: "dark", label: "Dark", hint: "Easy on the eyes" },
    { value: "system", label: "System", hint: "Match your device" },
  ];
  return (
    <Section title="Appearance">
      <div className="text-sm text-fg-primary">Theme</div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => {
          const active = theme === o.value;
          return (
            <button
              key={o.value}
              onClick={() => setTheme(o.value)}
              className={`rounded-lg px-3 py-3 text-left transition-all ${
                active
                  ? "bg-bg-overlay ring-2 ring-fg-primary/50"
                  : "bg-bg-inset hover:bg-bg-hover"
              }`}
            >
              <div className="text-sm font-medium text-fg-primary">{o.label}</div>
              <div className="text-[10px] text-fg-muted mt-0.5">{o.hint}</div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/* ---------- Danger zone ---------- */

function DangerSection({ isDemo }: { isDemo: boolean }) {
  const { developer, deleteAccount } = useAuth();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const matches = confirm.trim().toLowerCase() === (developer?.email ?? "").toLowerCase();

  async function doDelete() {
    if (isDemo) return;
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
      {isDemo ? (
        <p className="text-sm text-fg-secondary">
          The demo account is shared — deletion is disabled. Close the tab any
          time; your session lives only in this browser.
        </p>
      ) : (
        <>
          <p className="text-sm text-fg-secondary">
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
        </>
      )}
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
        <div className="text-fg-muted">Version</div>
        <div className="font-num text-fg-secondary">0.1.0</div>
        <div className="text-fg-muted">Environment</div>
        <div className="font-num text-fg-secondary">{env}</div>
        <div className="text-fg-muted">API</div>
        <div className="font-num text-fg-secondary truncate">{apiUrl}</div>
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
          tone === "danger" ? "text-rose-400" : "text-fg-secondary"
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
      <label className="block text-xs font-medium text-fg-secondary mb-1">{label}</label>
      {children}
      {error ? (
        <div className="text-xs text-rose-400 mt-1">{error}</div>
      ) : hint ? (
        <div className="text-xs text-fg-muted mt-1">{hint}</div>
      ) : null}
    </div>
  );
}
