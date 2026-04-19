export function fmtUsd(n: number, opts: { showSign?: boolean; decimals?: number } = {}) {
  const dec = opts.decimals ?? 2;
  const sign = n > 0 && opts.showSign ? "+" : n < 0 ? "-" : "";
  return (
    sign +
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    })
  );
}

export function fmtPct(n: number, opts: { showSign?: boolean } = {}) {
  const sign = n > 0 && opts.showSign ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function PlText({
  value,
  pct,
  size = "md",
}: {
  value: number;
  pct?: number;
  size?: "sm" | "md" | "lg";
}) {
  const positive = value >= 0;
  const sizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  } as const;
  return (
    <span className={`font-num ${sizes[size]} ${positive ? "pos" : "neg"}`}>
      {positive ? "▲" : "▼"} {fmtUsd(Math.abs(value))}
      {pct !== undefined && <span className="ml-1 opacity-70">({fmtPct(Math.abs(pct))})</span>}
    </span>
  );
}
