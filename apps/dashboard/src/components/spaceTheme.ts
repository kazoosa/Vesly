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
  /** Galaxy core glow color. */
  coreColor: number;
  /** Outer halo color around the galaxy core. */
  coreHaloColor: number;
  /** Ambient light tint. */
  ambientColor: number;
  /** Key directional light tint, simulating "light from the core". */
  keyLightColor: number;
  /** Asteroid base surface color. */
  asteroidColor: number;
  /** Asteroid emissive vein color (mineral veins hint). */
  asteroidEmissive: number;
  /** Asteroid material specular highlight color. */
  asteroidSpecular: number;
  /** HUD accent color used for the watermark + accents. */
  hudAccent: string;
}

export const THEME_DEFAULT: BrokerTheme = {
  watermark: "BEACON",
  nebulaColors: ["#9020e0", "#3060ff", "#10a0a0"],
  starTint: 0xffffff,
  coreColor: 0xfff0c0,
  coreHaloColor: 0x9090ff,
  ambientColor: 0x404060,
  keyLightColor: 0xfff0c0,
  asteroidColor: 0x5a4a3a,
  asteroidEmissive: 0x1a1008,
  asteroidSpecular: 0x222222,
  hudAccent: "#aaccff",
};

export const BROKER_THEMES: Record<string, BrokerTheme> = {
  robinhood: {
    watermark: "ROBINHOOD",
    nebulaColors: ["#00C805", "#3aff5a", "#004d00"],
    starTint: 0xfff8e8,
    coreColor: 0xc8ff80,
    coreHaloColor: 0x00C805,
    ambientColor: 0x103010,
    keyLightColor: 0xc0ffa0,
    asteroidColor: 0x2a2a2a,
    asteroidEmissive: 0x003300,
    asteroidSpecular: 0x224422,
    hudAccent: "#00C805",
  },
  fidelity: {
    watermark: "FIDELITY",
    nebulaColors: ["#00285A", "#3a6db0", "#C5922A"],
    starTint: 0xe0eaff,
    coreColor: 0xffd060,
    coreHaloColor: 0xC5922A,
    ambientColor: 0x101830,
    keyLightColor: 0xffe090,
    asteroidColor: 0x2a3040,
    asteroidEmissive: 0x100808,
    asteroidSpecular: 0xC5922A,
    hudAccent: "#C5922A",
  },
  schwab: {
    watermark: "SCHWAB",
    nebulaColors: ["#0047BB", "#4080ff", "#003087"],
    starTint: 0xffffff,
    coreColor: 0xe8f0ff,
    coreHaloColor: 0x0047BB,
    ambientColor: 0x0a1840,
    keyLightColor: 0xc0d8ff,
    asteroidColor: 0x6a7080,
    asteroidEmissive: 0x080810,
    asteroidSpecular: 0xa0c0ff,
    hudAccent: "#0047BB",
  },
  td_ameritrade: {
    watermark: "TD AMERITRADE",
    nebulaColors: ["#3aff8a", "#00b050", "#001a08"],
    starTint: 0xe8ffe0,
    coreColor: 0xa0ff60,
    coreHaloColor: 0x00b050,
    ambientColor: 0x081808,
    keyLightColor: 0xc0ffa0,
    asteroidColor: 0x202820,
    asteroidEmissive: 0x002a08,
    asteroidSpecular: 0x4a8040,
    hudAccent: "#3aff8a",
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
