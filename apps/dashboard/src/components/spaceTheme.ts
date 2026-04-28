/**
 * Broker-specific themes for the post-connect SpaceScene.
 *
 * Lives in a separate file (not inside SpaceScene.tsx) so the overlay
 * can import the theme map without pulling three.js into the main
 * dashboard bundle. The scene file still re-exports themeForBroker
 * for callers that already have it imported.
 */

export interface BrokerTheme {
  /** Top-left HUD watermark text. */
  watermark: string;
  /** Three nebula colors per spec — primary, secondary, tertiary.
   *  Tertiary is near-black for depth contrast. */
  nebulaColors: [string, string, string];
  /** Star tint (numeric hex 0xRRGGBB) applied to far + mid layers. */
  starTint: number;
  /** HUD accent color used for the watermark + accents. */
  hudAccent: string;
  /** Outer-edge color of the accretion disk. The inner disk fades
   *  through orange-yellow to blue-white regardless of theme — the
   *  outer edge is where the broker color lives. */
  diskOuterColor: number;
  /** Color of the relativistic jets shooting out the poles. */
  jetColor: number;
  /** Color of the expanding ring "ripples" that spawn periodically
   *  from the event horizon. */
  ringColor: number;
  /** Color of the foreground HUD-like geometric line drift in the
   *  extreme foreground (Aperture-style). */
  foregroundLineColor: number;
}

export const THEME_DEFAULT: BrokerTheme = {
  watermark: "BEACON",
  nebulaColors: ["#9020e0", "#3060ff", "#10a0a0"],
  starTint: 0xffffff,
  hudAccent: "#aaccff",
  diskOuterColor: 0x6020c0,
  jetColor: 0x60a0ff,
  ringColor: 0x9060ff,
  foregroundLineColor: 0xc0a0ff,
};

export const BROKER_THEMES: Record<string, BrokerTheme> = {
  robinhood: {
    watermark: "ROBINHOOD",
    nebulaColors: ["#003d00", "#005a00", "#00C805"],
    starTint: 0xfff8e8,
    hudAccent: "#00C805",
    diskOuterColor: 0x004a00,
    jetColor: 0x80ff60,
    ringColor: 0x00C805,
    foregroundLineColor: 0x80ff80,
  },
  fidelity: {
    watermark: "FIDELITY",
    nebulaColors: ["#00285A", "#3a6db0", "#1a1404"],
    starTint: 0xe0eaff,
    hudAccent: "#C5922A",
    diskOuterColor: 0x002850,
    jetColor: 0xffd060,
    ringColor: 0xC5922A,
    foregroundLineColor: 0xffe080,
  },
  schwab: {
    watermark: "SCHWAB",
    nebulaColors: ["#001840", "#0047BB", "#80c0ff"],
    starTint: 0xffffff,
    hudAccent: "#0047BB",
    diskOuterColor: 0x002878,
    jetColor: 0xc0e0ff,
    ringColor: 0x0078ff,
    foregroundLineColor: 0xb0d8ff,
  },
  td_ameritrade: {
    watermark: "TD AMERITRADE",
    nebulaColors: ["#001a08", "#00b050", "#3aff8a"],
    starTint: 0xe8ffe0,
    hudAccent: "#3aff8a",
    diskOuterColor: 0x003820,
    jetColor: 0xa0ff60,
    ringColor: 0x3aff8a,
    foregroundLineColor: 0x80ffa0,
  },
};

/** Match a free-text broker name to a theme. Case-insensitive, fuzzy.
 *  Adding a new broker is one entry in BROKER_THEMES. */
export function themeForBroker(name: string | undefined | null): BrokerTheme {
  if (!name) return THEME_DEFAULT;
  const lower = name.toLowerCase();
  if (lower.includes("robinhood")) return BROKER_THEMES.robinhood!;
  if (lower.includes("fidelity")) return BROKER_THEMES.fidelity!;
  if (lower.includes("schwab")) return BROKER_THEMES.schwab!;
  if (lower.includes("td") || lower.includes("ameritrade")) return BROKER_THEMES.td_ameritrade!;
  return THEME_DEFAULT;
}
