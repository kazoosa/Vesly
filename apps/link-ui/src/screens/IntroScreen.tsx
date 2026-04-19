export function IntroScreen({
  clientName,
  products,
  onContinue,
}: {
  clientName: string;
  products: string[];
  onContinue: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-accent-green/10 rounded-2xl flex items-center justify-center text-accent-green mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s-8-4-8-12V5l8-3 8 3v5c0 8-8 12-8 12z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold mb-2">Connect your account</h1>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          Securely connect your brokerage account to {clientName || "All Accounts"}.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-left w-full max-w-xs">
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-900/50 flex items-center justify-center">✓</span>
            <span className="text-slate-200">Bank-grade encryption protects your data</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-900/50 flex items-center justify-center">✓</span>
            <span className="text-slate-200">Your credentials are never stored</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-900/50 flex items-center justify-center">✓</span>
            <span className="text-slate-200">You can revoke access anytime</span>
          </li>
        </ul>
        {products.length > 0 && (
          <p className="mt-6 text-xs text-slate-500">
            Access requested: {products.join(", ")}
          </p>
        )}
      </div>
      <button className="fl-btn-primary w-full" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
