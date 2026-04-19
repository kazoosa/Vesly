export function ConsentScreen({
  clientName,
  products,
  institution,
  onBack,
  onConfirm,
}: {
  clientName: string;
  products: string[];
  institution: { name: string; primaryColor: string };
  onBack: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="flex-1 flex flex-col p-6">
      <button type="button" className="text-sm text-slate-400 mb-4" onClick={onBack}>
        ← Back
      </button>
      <h2 className="text-lg font-semibold mb-2">Review and connect</h2>
      <p className="text-sm text-slate-400 mb-6">
        By clicking Connect, you authorize <b>{clientName || "this app"}</b> to access your selected{" "}
        <b>{institution.name}</b> accounts. You can revoke access anytime from the Accounts page.
      </p>

      <ul className="space-y-3 text-sm">
        {products.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="capitalize">{p}</span>
          </li>
        ))}
      </ul>

      <div className="flex-1" />
      <button className="fl-btn-primary w-full" onClick={onConfirm}>
        Connect
      </button>
    </div>
  );
}
