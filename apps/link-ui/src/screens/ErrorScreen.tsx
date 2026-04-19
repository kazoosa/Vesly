export function ErrorScreen({
  message,
  onRetry,
  onExit,
}: {
  message: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col p-6 items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-rose-950/50 text-rose-400 border border-rose-900/50 flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4m0 4h.01M5 19h14a2 2 0 001.73-3l-7-12a2 2 0 00-3.46 0l-7 12A2 2 0 005 19z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold mb-1">Something went wrong</h2>
      <p className="text-sm text-slate-400 mb-8 max-w-xs">{message}</p>
      <button className="fl-btn-primary w-full mb-2" onClick={onRetry}>
        Try again
      </button>
      <button className="fl-btn-ghost w-full" onClick={onExit}>
        Exit
      </button>
    </div>
  );
}
