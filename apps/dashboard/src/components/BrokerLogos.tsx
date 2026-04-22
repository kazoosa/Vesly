/**
 * Broker logos for the "Auto-syncs with" row on the landing.
 *
 * Each entry is a simplified inline SVG mark + the broker name set as a
 * wordmark next to it. The marks are our interpretations — simple
 * geometric distillations, not pixel-perfect brand copies. They're
 * good enough to be instantly recognisable without pretending to be
 * official partner assets.
 *
 * Base colour is a muted grey so the row reads as a single calm strip.
 * Hover reveals the real brand colour. Exactly the Stripe pattern.
 */

import type { ReactNode } from "react";

export interface BrokerLogo {
  name: string;
  /** Primary brand color — shown on hover, used in the product mock too. */
  color: string;
  /** Inline SVG mark. Must use `currentColor` so hover/grayscale work. */
  mark: ReactNode;
  /** Width of the whole logo+wordmark in px (so the row looks balanced). */
  width?: number;
}

/* ---------------------------------------------------------------- Marks */

const robinhoodMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx={12} cy={12} r={10} fill="currentColor" />
    <path d="M7 13.5c2 0 2-3 5-3s3 3 5 3" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" fill="none" />
  </svg>
);

const ibkrMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x={2} y={4} width={20} height={16} rx={2} fill="currentColor" />
    <text x={12} y={16} textAnchor="middle" fontFamily="sans-serif" fontWeight={700} fontSize={10} fill="#fff">IB</text>
  </svg>
);

const vanguardMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 5 L12 20 L20 5 L16 5 L12 13 L8 5 Z" fill="currentColor" />
  </svg>
);

const webullMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M3 8 L7 17 L10 11 L12 11 L14 17 L18 11 L20 8 L22 8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx={12} cy={5} r={1.5} fill="currentColor" />
  </svg>
);

const etradeMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x={3} y={5} width={18} height={14} rx={3} fill="currentColor" />
    <text x={12} y={16} textAnchor="middle" fontFamily="sans-serif" fontWeight={800} fontSize={10} fill="#fff">E*</text>
  </svg>
);

const wealthsimpleMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx={12} cy={12} r={10} fill="currentColor" />
    <path d="M7 14 L10 9 L12 13 L14 9 L17 14" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

const publicMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M5 4 H12 a5 5 0 0 1 0 10 H9 V20 H5 Z" fill="currentColor" />
  </svg>
);

const coinbaseMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx={12} cy={12} r={10} fill="currentColor" />
    <rect x={9} y={9} width={6} height={6} rx={1} fill="#fff" />
  </svg>
);

const krakenMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx={12} cy={12} r={10} fill="currentColor" />
    <path d="M7 16 V9 M10 16 V9 M13 16 V9 M16 16 V9" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);

const binanceMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <g fill="currentColor">
      <rect x={10.5} y={3} width={3} height={3} transform="rotate(45 12 4.5)" />
      <rect x={3} y={10.5} width={3} height={3} transform="rotate(45 4.5 12)" />
      <rect x={18} y={10.5} width={3} height={3} transform="rotate(45 19.5 12)" />
      <rect x={10.5} y={18} width={3} height={3} transform="rotate(45 12 19.5)" />
      <rect x={10.5} y={10.5} width={3} height={3} transform="rotate(45 12 12)" />
    </g>
  </svg>
);

const questradeMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 2 a10 10 0 1 0 7 17 l2 2 v-5 a10 10 0 0 0 -9 -14 Z" fill="currentColor" />
  </svg>
);

const moomooMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx={8} cy={12} r={5} fill="currentColor" />
    <circle cx={16} cy={12} r={5} fill="currentColor" />
  </svg>
);

const etoroMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M12 3 a9 9 0 1 1 -7.5 14 h4 a5 5 0 1 0 0 -10 h-4 A9 9 0 0 1 12 3 Z"
      fill="currentColor"
    />
    <rect x={4} y={10.5} width={10} height={3} fill="currentColor" />
  </svg>
);

const tastytradeMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x={3} y={7} width={18} height={10} rx={5} fill="currentColor" />
    <text x={12} y={15} textAnchor="middle" fontFamily="sans-serif" fontWeight={700} fontSize={9} fill="#fff">
      t/t
    </text>
  </svg>
);

const degiroMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 4 h10 a8 8 0 0 1 0 16 h-10 Z" fill="currentColor" />
    <circle cx={12} cy={12} r={4} fill="#fff" />
  </svg>
);

const trading212Mark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x={3} y={3} width={18} height={18} rx={4} fill="currentColor" />
    <text x={12} y={16} textAnchor="middle" fontFamily="sans-serif" fontWeight={800} fontSize={9} fill="#fff">
      212
    </text>
  </svg>
);

const ajbellMark = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 4 L20 20 H4 Z" fill="currentColor" />
  </svg>
);

/* --------------------------------------------------------- Logo entries */

export const brokerLogos: BrokerLogo[] = [
  { name: "Robinhood",           color: "#00C805", mark: robinhoodMark,   width: 150 },
  { name: "Interactive Brokers", color: "#D8232A", mark: ibkrMark,        width: 200 },
  { name: "Vanguard",            color: "#96151D", mark: vanguardMark,    width: 140 },
  { name: "Webull",              color: "#0076FF", mark: webullMark,      width: 130 },
  { name: "E*TRADE",             color: "#6633CC", mark: etradeMark,      width: 140 },
  { name: "Wealthsimple",        color: "#111111", mark: wealthsimpleMark,width: 170 },
  { name: "Public",              color: "#111111", mark: publicMark,      width: 120 },
  { name: "Coinbase",            color: "#0052FF", mark: coinbaseMark,    width: 150 },
  { name: "Kraken",              color: "#5741D9", mark: krakenMark,      width: 130 },
  { name: "Binance",             color: "#F3BA2F", mark: binanceMark,     width: 130 },
  { name: "Questrade",           color: "#0073B4", mark: questradeMark,   width: 150 },
  { name: "Moomoo",              color: "#1F53FF", mark: moomooMark,      width: 130 },
  { name: "eToro",               color: "#13C636", mark: etoroMark,       width: 120 },
  { name: "tastytrade",          color: "#DE2A2A", mark: tastytradeMark,  width: 150 },
  { name: "DEGIRO",              color: "#005FAE", mark: degiroMark,      width: 130 },
  { name: "Trading212",          color: "#00AAE4", mark: trading212Mark,  width: 150 },
  { name: "AJ Bell",             color: "#4A4A4A", mark: ajbellMark,      width: 130 },
];

/**
 * One broker item: SVG mark + wordmark. Base colour is a muted grey that
 * matches surrounding body copy; hover fades to the real brand colour
 * on both the mark (`currentColor`) and the wordmark.
 */
export function BrokerWordmark({ logo }: { logo: BrokerLogo }) {
  return (
    <span
      className="group inline-flex items-center gap-2.5 whitespace-nowrap select-none transition-[color] duration-300"
      style={{ color: "var(--stripe-ink-faint)" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = logo.color)}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--stripe-ink-faint)")}
      aria-label={logo.name}
    >
      <span className="inline-flex" aria-hidden>
        {logo.mark}
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        {logo.name}
      </span>
    </span>
  );
}
