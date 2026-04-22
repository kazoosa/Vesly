/**
 * Broker wordmarks for the "Works with" row on the landing page.
 *
 * These aren't pixel-perfect brand logos — they're tasteful wordmark
 * treatments that keep the row honest ("these are the brokers we support")
 * without pretending to be official partners. Each broker has a distinct
 * colored initial dot so the eye can scan the row quickly; names are in
 * a uniform weight so nothing shouts.
 */

export interface BrokerLogo {
  name: string;
  /** Primary brand color — used for the initial dot. */
  color: string;
  /** Optional — override the initial if the brand uses something special. */
  initial?: string;
}

export const brokerLogos: BrokerLogo[] = [
  { name: "Robinhood",           color: "#00C805" },
  { name: "Interactive Brokers", color: "#D8232A", initial: "IB" },
  { name: "Vanguard",            color: "#96151D" },
  { name: "Webull",              color: "#0076FF" },
  { name: "E*TRADE",             color: "#6633CC", initial: "E" },
  { name: "Wealthsimple",        color: "#000000" },
  { name: "Public",              color: "#111111" },
  { name: "Coinbase",            color: "#0052FF" },
  { name: "Kraken",              color: "#5741D9" },
  { name: "Binance",             color: "#F3BA2F" },
  { name: "Questrade",           color: "#0073B4" },
  { name: "Moomoo",              color: "#1F53FF" },
  { name: "eToro",               color: "#13C636" },
  { name: "tastytrade",          color: "#DE2A2A", initial: "t" },
  { name: "DEGIRO",              color: "#005FAE" },
  { name: "Trading212",          color: "#00AAE4", initial: "T" },
  { name: "AJ Bell",             color: "#4A4A4A", initial: "AJ" },
];

/**
 * Renders a single broker wordmark: a small colored dot with the broker's
 * initial, then the broker name. Base style is muted grey; hover (or an
 * `active` prop) reveals the brand color. Designed to sit inside the
 * marquee track.
 */
export function BrokerWordmark({
  logo,
  className = "",
}: {
  logo: BrokerLogo;
  className?: string;
}) {
  const initial = logo.initial ?? logo.name.charAt(0);
  return (
    <span
      className={`group inline-flex items-center gap-2.5 whitespace-nowrap select-none ${className}`}
      aria-label={logo.name}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold tracking-tighter text-white transition-transform duration-300 group-hover:scale-110"
        style={{ background: logo.color }}
      >
        {initial}
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-[var(--stripe-ink-faint)] transition-colors duration-300 group-hover:text-[var(--stripe-ink)]">
        {logo.name}
      </span>
    </span>
  );
}
