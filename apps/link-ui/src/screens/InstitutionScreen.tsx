export function InstitutionScreen({
  institution,
  products,
  onContinue,
  onBack,
}: {
  institution: { id: string; name: string; primaryColor: string };
  products: string[];
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col p-6">
      <button className="text-sm text-slate-400 mb-4" onClick={onBack}>
        ← Back
      </button>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-4"
          style={{ backgroundColor: institution.primaryColor }}
        >
          {institution.name[0]}
        </div>
        <h2 className="text-lg font-semibold mb-1">{institution.name}</h2>
        <p className="text-sm text-slate-400 mb-6">You'll be asked to log in next.</p>
        <div className="bg-bg-overlay rounded-2xl p-4 w-full text-left text-sm space-y-2">
          <div className="font-medium text-slate-200 mb-1">This app will access:</div>
          {products.map((p) => (
            <div key={p} className="flex items-center gap-2 text-slate-300">
              <span className="text-emerald-500">✓</span>
              <span className="capitalize">{p}</span>
            </div>
          ))}
        </div>
      </div>
      <button className="fl-btn-primary w-full mt-6" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
