import { useEffect, useRef, useState } from "react";

export function MfaScreen({
  institution,
  onBack,
  onSubmit,
}: {
  institution: { id: string; name: string; primaryColor: string };
  onBack: () => void;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [cooldown, setCooldown] = useState(30);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const complete = digits.join("");
  const full = complete.length === 6 && /^\d{6}$/.test(complete);

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  }
  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array(6).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    refs.current[Math.min(text.length, 5)]?.focus();
  }

  return (
    <div className="flex-1 flex flex-col p-6">
      <button type="button" className="text-sm text-slate-400 mb-4" onClick={onBack}>
        ← Back
      </button>
      <div className="flex items-center gap-3 mb-6">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: institution.primaryColor }}
        >
          {institution.name[0]}
        </span>
        <div>
          <div className="font-semibold">Verify your identity</div>
          <div className="text-xs text-slate-500">We sent a 6-digit code to ···· 4821</div>
        </div>
      </div>
      <div className="flex justify-between gap-2 mb-6" onPaste={onPaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
            }}
            inputMode="numeric"
            maxLength={1}
            className="w-12 h-14 text-center text-lg rounded-xl border border-border-strong focus:border-accent-green outline-none"
          />
        ))}
      </div>
      <button className="fl-btn-ghost text-sm" disabled={cooldown > 0} onClick={() => setCooldown(30)}>
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </button>
      <div className="flex-1" />
      <p className="text-xs text-slate-500 mb-3">
        Sandbox: any 6-digit code works (000000 simulates failure).
      </p>
      <button
        className="fl-btn-primary w-full"
        disabled={!full}
        onClick={() => onSubmit(complete)}
      >
        Verify
      </button>
    </div>
  );
}
