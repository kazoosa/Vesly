/**
 * Beacon converge mark — six lines meeting at a central dot.
 * Uses currentColor so it inherits the surrounding ink color; safe on any
 * background. Never alter the geometry.
 */
export function BeaconMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M6 14 L32 32" />
      <path d="M58 14 L32 32" />
      <path d="M6 32 L32 32" />
      <path d="M58 32 L32 32" />
      <path d="M6 50 L32 32" />
      <path d="M58 50 L32 32" />
      <circle cx="32" cy="32" r="5" fill="currentColor" stroke="none" />
    </svg>
  );
}
