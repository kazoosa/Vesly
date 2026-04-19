export function SuccessScreen({
  institution,
  onDone,
}: {
  institution: { name: string; primaryColor: string };
  publicToken: string;
  onDone: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col p-6 items-center justify-center text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-900/50 flex items-center justify-center mb-4">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold mb-1">Account connected</h2>
      <p className="text-sm text-slate-400 mb-8">
        Your {institution.name} account is now linked.
      </p>
      <button className="fl-btn-primary w-full" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
