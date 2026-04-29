import { useEffect, useMemo, useRef, useState } from "react";
import { themeForBroker, type BrokerTheme } from "./spaceTheme";
import {
  ApertureFilters,
  ApertureKeyframes,
  AtmosphericHaze,
  FilmGrain,
  LitMoon,
  RimLitSilhouette,
} from "./apertureFilters";

/**
 * Aperture overlay v2 — fixed timeline reproduction of the
 * Geometry Dash level "Aperture" (chunlv1, video uQPMh62HogQ).
 *
 * Plays a 26-shot sequence start-to-finish at source speed. Sync
 * completion does not advance the timeline; only the white-flash
 * transition (Shot 24) is gated on real completion. If sync runs
 * past the natural end of the timeline, Shot 23 (navy radar) holds
 * with an "actively listening" pulse — alert, not sleepy — until
 * sync completes.
 *
 * Pure DOM + SVG + CSS animations. No canvas, no Three.js, no
 * shaders. Each shot is a self-contained component with a fixed
 * duration; the orchestrator picks the active shot based on
 * elapsed time.
 *
 * Asset stand-ins: hand-drawn silhouettes from the source (rocket
 * sketches, the long-haired girl, the captain's-hat character) are
 * replaced with geometric stand-ins.
 */

// ---- Public prop API ----------------------------------------------

export type Phase = 1 | 2 | 3 | "done";

export interface ApertureOverlayProps {
  /** Drives the broker watermark + accent color. */
  brokerName?: string | null;
  /** Live counts surfaced inside the radar HUD vignette (Shot 23
   *  hold) and the credits-style end frame. All optional. */
  accountsCount?: number;
  holdingsCount?: number;
  transactionsCount?: number;
  /** Set true once the parent has confirmed sync completion AND is
   *  ready to hand off to the dashboard. Triggers the final white
   *  flash → fade. The overlay's white flash is the only signal of
   *  "done" — phases 1/2/3 are implicit in the timeline progress
   *  and don't need to be passed in. */
  syncComplete?: boolean;
  /** Called after the white flash completes, signaling the parent
   *  to unmount the overlay and reveal the dashboard. */
  onClose?: () => void;
  /** Dev-only escape hatch for the preview shell. Pre-advances the
   *  overlay's perceived start time by N ms so the preview can jump
   *  to any shot. Production paths should never set this. */
  __previewOffsetMs?: number;
}

// ---- Shot definitions ---------------------------------------------
//
// Each shot is { id, durationMs, render(ctx) }. The shots array is
// the source of truth for the timeline — duration changes here are
// the only edit needed to retime the sequence.

interface ShotContext {
  /** 0..1 progress through the active shot. Use this for in-shot
   *  animations rather than absolute time so retiming is free. */
  shotProgress: number;
  /** Absolute milliseconds since timeline start. Useful for shots
   *  that have their own internal sub-beat rhythm. */
  elapsedMs: number;
  theme: BrokerTheme;
  accountsCount: number;
  holdingsCount: number;
  transactionsCount: number;
}

interface ShotDef {
  id: string;
  durationMs: number;
  render: (ctx: ShotContext) => React.ReactNode;
}

// ---- Constants -----------------------------------------------------
const FLASH_PEAK_MS = 80;
const FLASH_FADE_MS = 400;
// Pulse on the Shot 23 hold — period chosen so it reads as alert
// scanning, not breathing. ~1.1s period at ±6% opacity is the
// sweet spot from earlier tuning rounds.
const RADAR_HOLD_PULSE_MS = 1100;
const RADAR_HOLD_OPACITY_RANGE = 0.06;

// ---- Color helpers -------------------------------------------------
function rgba(hex: number, a: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

// ---- Shot 1 · black void with corner twinkles ---------------------
function Shot1BlackVoid({ shotProgress }: ShotContext) {
  // Twinkle stars at the corners; opacity oscillates fast for life.
  const twinkle = (phase: number) =>
    0.4 + 0.6 * Math.abs(Math.sin(phase + shotProgress * Math.PI * 6));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at 50% 50%, #2a1820 0%, #0a0410 60%, #020208 100%)",
      }}
    >
      {/* Corner twinkles */}
      <div style={{ position: "absolute", left: "8%", bottom: "20%", width: 3, height: 3, background: "#fff", borderRadius: "50%", opacity: twinkle(0) }} />
      <div style={{ position: "absolute", right: "10%", bottom: "26%", width: 2, height: 2, background: "#fff", borderRadius: "50%", opacity: twinkle(1.7) }} />
      <div style={{ position: "absolute", right: "22%", top: "12%", width: 2, height: 2, background: "#fff", borderRadius: "50%", opacity: twinkle(2.9) }} />
      {/* Faint top haze */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(140, 70, 90, 0.18) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ---- Shot 2 · sepia astronomical chart with sun zoom-in -----------
function Shot2AstronomicalChart({ shotProgress, theme }: ShotContext) {
  // Camera pushes forward into the sun: scale grows from 0.92 to 1.6.
  const scale = 0.92 + shotProgress * 0.68;
  // Sun bursts white at the very end (last 12% of shot).
  const sunBurst = shotProgress > 0.88 ? (shotProgress - 0.88) / 0.12 : 0;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, #f4ead0 0%, #e8d8a8 100%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${scale})`,
          transformOrigin: "50% 50%",
          transition: "none",
        }}
      >
        {/* Concentric dotted orbital rings around the sun */}
        <svg viewBox="0 0 1000 600" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {[110, 160, 220, 290].map((r, i) => (
            <circle
              key={i}
              cx={500}
              cy={300}
              r={r}
              fill="none"
              stroke="#5a4030"
              strokeWidth={i === 0 ? 1.2 : 0.8}
              strokeDasharray={i === 0 ? "0" : "1.5 6"}
              opacity={0.55}
            />
          ))}
          {/* Pencil-sketched planets sit on rings */}
          <circle cx={610} cy={300} r={9} fill="#7a6850" opacity={0.7} />
          <circle cx={500} cy={460} r={6} fill="#7a6850" opacity={0.6} />
          <circle cx={290} cy={300} r={5} fill="#7a6850" opacity={0.5} />
          <circle cx={500} cy={140} r={4} fill="#7a6850" opacity={0.5} />
          {/* Hand-sketched constellation lines, lower-left */}
          <g stroke="#5a4030" strokeWidth={0.6} opacity={0.5} fill="none">
            <line x1="60" y1="500" x2="120" y2="470" />
            <line x1="120" y1="470" x2="160" y2="510" />
            <line x1="160" y1="510" x2="220" y2="490" />
            <circle cx={60} cy={500} r={2} fill="#5a4030" />
            <circle cx={120} cy={470} r={2} fill="#5a4030" />
            <circle cx={160} cy={510} r={2} fill="#5a4030" />
            <circle cx={220} cy={490} r={2} fill="#5a4030" />
          </g>
          {/* Hand-written marginalia (stylized as italic monospace text) */}
          <text x={50} y={80} fill="#5a4030" fontSize="10" fontFamily="ui-monospace, monospace" opacity={0.55} fontStyle="italic">{"In r(t) = a · ln(t)"}</text>
          <text x={780} y={130} fill="#5a4030" fontSize="9" fontFamily="ui-monospace, monospace" opacity={0.55} fontStyle="italic">{"Circumcircle"}</text>
          <text x={800} y={520} fill="#5a4030" fontSize="9" fontFamily="ui-monospace, monospace" opacity={0.5} fontStyle="italic">{"orbit · n"}</text>
          {/* Probe / rocket stand-ins (geometric: three triangles on a stem) */}
          <g transform="translate(840, 200) rotate(-25)" opacity={0.7}>
            <rect x={-4} y={-22} width={8} height={28} fill="none" stroke="#5a4030" strokeWidth={1} />
            <polygon points="-4,-22 4,-22 0,-32" fill="none" stroke="#5a4030" strokeWidth={1} />
            <line x1={-8} y1={6} x2={-12} y2={14} stroke="#5a4030" strokeWidth={1} />
            <line x1={8} y1={6} x2={12} y2={14} stroke="#5a4030" strokeWidth={1} />
          </g>
          <g transform="translate(120, 200) rotate(15)" opacity={0.7}>
            <rect x={-4} y={-22} width={8} height={28} fill="none" stroke="#5a4030" strokeWidth={1} />
            <polygon points="-4,-22 4,-22 0,-32" fill="none" stroke="#5a4030" strokeWidth={1} />
          </g>
          {/* The square viewfinder bracket around the sun */}
          <rect x={460} y={260} width={80} height={80} fill="none" stroke="#3a2818" strokeWidth={1.5} opacity={0.7} />
          {/* The sun itself */}
          <defs>
            <radialGradient id="sun2" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#fff8c8" />
              <stop offset="60%" stopColor="#f0c060" />
              <stop offset="100%" stopColor="#d08020" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={500} cy={300} r={45} fill="url(#sun2)" />
          {/* Tiny gameplay character marker around 60% of the shot */}
          {shotProgress > 0.55 && shotProgress < 0.95 && (
            <g transform="translate(610, 300)">
              <polygon points="-6,-6 6,-6 6,6 -6,6" fill={rgba(theme.diskOuterColor, 0.8)} />
            </g>
          )}
        </svg>
      </div>
      {/* Sun-burst white overlay at end of shot */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#fff",
          opacity: sunBurst,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ---- Shot 3 · paper-blueprint workshop with gold border -----------
function Shot3BlueprintWorkshop({ shotProgress, theme }: ShotContext) {
  // Tiny gameplay icon traces a path across the layout.
  const px = 8 + shotProgress * 84;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at 50% 50%, #2a1448 0%, #150828 70%, #0a0418 100%)",
      }}
    >
      {/* Gold border with corner + markers */}
      <div
        style={{
          position: "absolute",
          inset: 14,
          border: `1.5px solid ${rgba(theme.foregroundLineColor, 0.7)}`,
        }}
      />
      {[
        { top: 6, left: 6 },
        { top: 6, right: 6 },
        { bottom: 6, left: 6 },
        { bottom: 6, right: 6 },
      ].map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            color: rgba(theme.foregroundLineColor, 1),
            fontFamily: "ui-monospace, monospace",
            fontSize: 14,
            opacity: 0.8,
            ...p,
          }}
        >
          +
        </div>
      ))}
      {/* Floating paper cutouts at canted angles */}
      <div style={{ position: "absolute", left: "12%", top: "28%", width: 120, height: 90, background: "#e8e0d0", transform: "rotate(-8deg)", boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>
        <div style={{ padding: 8, fontSize: 8, fontFamily: "ui-monospace, monospace", color: "#3a2818", lineHeight: 1.2 }}>
          ──── ──<br />─ ──── ─<br />──<br />────
        </div>
      </div>
      <div style={{ position: "absolute", left: "44%", top: "18%", width: 80, height: 110, background: "#dcd2c0", transform: "rotate(5deg)", boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }} />
      <div style={{ position: "absolute", right: "14%", top: "40%", width: 90, height: 70, background: "#c8b898", transform: "rotate(12deg)", boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>
        {/* Drafting triangle */}
        <svg viewBox="0 0 100 80" style={{ width: "100%", height: "100%" }}>
          <polygon points="10,10 90,10 50,70" fill="none" stroke="#3a2818" strokeWidth="1" />
        </svg>
      </div>
      <div style={{ position: "absolute", right: "8%", bottom: "22%", width: 70, height: 70, background: "#b8a888", transform: "rotate(-15deg)", boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }} />
      {/* Black silhouette beams diagonally crossing */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <line x1="20" y1="0" x2="35" y2="100" stroke="#0a0410" strokeWidth="0.6" />
        <line x1="65" y1="0" x2="80" y2="100" stroke="#0a0410" strokeWidth="0.6" />
        <line x1="0" y1="40" x2="100" y2="60" stroke="#0a0410" strokeWidth="0.4" opacity="0.6" />
      </svg>
      {/* Cyan teleport portals */}
      <div style={{ position: "absolute", left: "26%", top: "60%", width: 18, height: 18, borderRadius: "50%", background: "#40e0ff", boxShadow: "0 0 22px #40e0ff, 0 0 8px #fff" }} />
      <div style={{ position: "absolute", right: "32%", top: "30%", width: 14, height: 14, borderRadius: "50%", background: "#40e0ff", boxShadow: "0 0 18px #40e0ff" }} />
      {/* Tiny gameplay character (geometric stand-in: a small square) */}
      <div
        style={{
          position: "absolute",
          left: `${px}%`,
          top: "48%",
          width: 14,
          height: 14,
          background: theme.diskOuterColor ? `#${theme.diskOuterColor.toString(16).padStart(6, "0")}` : "#c83020",
          boxShadow: "0 0 12px rgba(255,80,80,0.8)",
          transform: "rotate(45deg)",
          transition: "left 60ms linear",
        }}
      />
      {/* Silhouette of long-haired girl on the right (geometric) */}
      {shotProgress > 0.5 && (
        <div
          style={{
            position: "absolute",
            right: "12%",
            bottom: "12%",
            width: 80,
            height: 140,
            opacity: 0.55,
          }}
        >
          <svg viewBox="0 0 80 140" style={{ width: "100%", height: "100%" }}>
            {/* Head */}
            <ellipse cx="40" cy="22" rx="14" ry="16" fill="#0a0410" />
            {/* Long hair / cape */}
            <path d="M 26,30 Q 14,90 26,138 L 54,138 Q 66,90 54,30 Z" fill="#0a0410" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ---- Shot 4 · silhouetted girl with red orb lantern --------------
function Shot4GirlLantern({ shotProgress, theme }: ShotContext) {
  // The orb is the only real light source in the frame. Everything
  // else is a downstream consequence of it: the rim on her hair,
  // the bounce on her chin, the warm haze in the lower-third, the
  // ground twinkles barely catching its glow. The composition is
  // intentionally negative-space-heavy — she's lower-left, the orb
  // is slightly right of center, the rest of the frame is BLACK
  // except for the suggestion of light.

  // Orb pulse + slow drift (it's hovering, not held).
  const orbPulse = 1 + 0.04 * Math.sin(shotProgress * Math.PI * 5);
  const orbDrift = Math.sin(shotProgress * Math.PI * 1.4) * 6; // px

  // Silhouette path — head + body + flowing hair behind + extended
  // arm reaching toward the orb. Hand-tuned to read as the figure
  // from the source frame. ViewBox is 400x600 to give us room for
  // hair flying behind her.
  const silhouettePath = `
    M 200,80
    Q 168,72 152,108
    Q 142,136 152,168
    Q 156,180 164,188
    L 144,210
    Q 96,244 80,304
    Q 68,360 92,412
    Q 116,464 156,512
    L 60,560
    L 60,600
    L 360,600
    L 380,540
    L 320,490
    Q 296,448 296,400
    L 312,408
    Q 350,420 386,406
    L 384,386
    Q 348,390 314,374
    Q 292,360 274,338
    Q 300,304 296,260
    Q 290,212 250,184
    Q 254,160 248,136
    Q 240,98 220,82
    Z

    M 152,108
    Q 100,150 76,232
    Q 60,300 80,372
    Q 96,448 96,508
    Q 116,476 132,420
    Q 144,360 156,304
    Q 168,232 180,172
    Q 168,140 152,108
    Z
  `;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        // Near-black ground with the faintest warm haze pooling at
        // the lower-left where the orb's bounce light would naturally
        // settle.
        background:
          "radial-gradient(ellipse at 38% 62%, #0e0608 0%, #050204 60%, #020102 100%)",
        overflow: "hidden",
      }}
    >
      {/* Ground floor — barely visible, just enough texture so the
          horizon doesn't read as infinite black */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "30%",
          background:
            "linear-gradient(180deg, transparent 0%, #060304 100%)",
        }}
      />

      {/* Floor twinkles — tiny specks catching the orb's distant
          light. Positioned with hand-tuned coordinates so they read
          as a sparse field, not random scatter. */}
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "30%",
        }}
      >
        {[
          { x: 12, y: 20, s: 0.3 },
          { x: 19, y: 32, s: 0.5 },
          { x: 28, y: 14, s: 0.4 },
          { x: 36, y: 36, s: 0.6 },
          { x: 47, y: 22, s: 0.5 },
          { x: 58, y: 30, s: 0.4 },
          { x: 67, y: 18, s: 0.3 },
          { x: 73, y: 44, s: 0.6 },
          { x: 82, y: 26, s: 0.5 },
          { x: 90, y: 38, s: 0.4 },
        ].map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.s * 0.18}
            fill="#fff"
            opacity={0.25 + 0.15 * Math.sin(shotProgress * Math.PI * 3 + i * 0.7)}
          />
        ))}
      </svg>

      {/* Atmospheric haze layered behind the figure — warm, breathy */}
      <AtmosphericHaze
        color="rgba(180, 80, 60, 0.35)"
        opacity={0.3}
        cx="48%"
        cy="46%"
        radius={42}
        z={1}
      />

      {/* Secondary tiny orb higher and to the right of the main one */}
      <div
        style={{
          position: "absolute",
          left: `calc(58% + ${orbDrift * 0.4}px)`,
          top: "26%",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, #fff5b0 0%, #ff8030 35%, #c02020 75%, transparent 100%)",
          boxShadow: "0 0 28px rgba(255, 100, 60, 0.7), 0 0 8px #ff8030",
          opacity: 0.9,
          filter: "blur(0.3px)",
          animation: "ap-orb-flicker 7s ease-in-out infinite",
          zIndex: 3,
        }}
      />

      {/* The shadow blade / curved object near the second orb —
          rendered as a thin curved silhouette at very low opacity,
          gives the frame the second focal element from the source */}
      <svg
        viewBox="0 0 60 80"
        style={{
          position: "absolute",
          left: "62%",
          top: "26%",
          width: 36,
          height: 48,
          opacity: 0.7,
          zIndex: 2,
        }}
      >
        <path
          d="M 30,5 Q 50,30 38,76 Q 28,52 22,30 Z"
          fill="#000"
          stroke="rgba(255, 120, 80, 0.25)"
          strokeWidth="0.4"
        />
      </svg>

      {/* MAIN ORB — the actual light source.
          Layered radial gradients: bright white-yellow core, hot
          orange middle, deep red outer, magenta-pink corona.
          Plus a wide soft halo and a sharp inner highlight. */}
      <div
        style={{
          position: "absolute",
          left: `calc(50% + ${orbDrift}px)`,
          top: "44%",
          transform: `translate(-50%, -50%) scale(${orbPulse})`,
          width: 56,
          height: 56,
          zIndex: 4,
          animation: "ap-orb-pulse 1.6s ease-in-out infinite",
        }}
      >
        {/* Wide outer corona — magenta-pink glow extending far */}
        <div
          style={{
            position: "absolute",
            inset: -120,
            background:
              "radial-gradient(circle, rgba(255, 100, 130, 0.35) 0%, rgba(220, 60, 90, 0.18) 30%, transparent 60%)",
            mixBlendMode: "screen",
          }}
        />
        {/* Mid-range warm halo */}
        <div
          style={{
            position: "absolute",
            inset: -50,
            background:
              "radial-gradient(circle, rgba(255, 160, 80, 0.6) 0%, rgba(255, 80, 60, 0.3) 40%, transparent 70%)",
            mixBlendMode: "screen",
          }}
        />
        {/* Tight inner glow */}
        <div
          style={{
            position: "absolute",
            inset: -16,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255, 240, 200, 0.95) 0%, rgba(255, 140, 60, 0.7) 40%, transparent 75%)",
            mixBlendMode: "screen",
          }}
        />
        {/* The orb body */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 35%, #fff8d8 0%, #ffc060 25%, #f06030 55%, #a01828 80%, #4a0810 100%)",
            boxShadow:
              "inset -4px -6px 12px rgba(80, 0, 20, 0.7), inset 3px 3px 6px rgba(255, 240, 200, 0.5)",
          }}
        />
        {/* Specular highlight */}
        <div
          style={{
            position: "absolute",
            top: "22%",
            left: "28%",
            width: "22%",
            height: "18%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 80%)",
          }}
        />
      </div>

      {/* THE GIRL — silhouette with rim light from the orb, soft
          bounce on the chin/neck. Positioned lower-left.
          Rim light direction = unit vector from her center to
          the orb (orb is to her right and slightly up). */}
      <div
        style={{
          position: "absolute",
          left: "8%",
          bottom: "0%",
          width: "44%",
          height: "92%",
          zIndex: 3,
        }}
      >
        <RimLitSilhouette
          pathD={silhouettePath}
          viewBoxW={400}
          viewBoxH={600}
          rimColor="#ffcc88"
          lightDir={{ x: 0.85, y: -0.45 }} // toward upper-right, where orb is
          rimStrength={0.85}
          bounceColor="#cc4030"
          bounceStrength={0.25}
        />
      </div>

      {/* Light wrap — a soft warm radial overlay positioned where
          the orb is, blended SCREEN to add to the silhouette's
          edge. This is the "light wrapping around her" effect. */}
      <div
        style={{
          position: "absolute",
          left: "30%",
          top: "30%",
          width: "40%",
          height: "55%",
          background:
            "radial-gradient(circle at 70% 30%, rgba(255, 180, 120, 0.4) 0%, transparent 50%)",
          mixBlendMode: "screen",
          pointerEvents: "none",
          zIndex: 4,
          filter: "blur(2px)",
        }}
      />

      {/* Film grain over the whole frame */}
      <FilmGrain opacity={0.07} />

      {/* Subtle vignette — tightens focus to the central orb area */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 48% 50%, transparent 30%, rgba(0,0,0,0.55) 95%)",
          pointerEvents: "none",
          zIndex: 49,
        }}
      />

      {/* Tiny watermark */}
      <div
        style={{
          position: "absolute",
          right: 24,
          top: 24,
          color: theme.hudAccent,
          fontFamily: "ui-monospace, monospace",
          fontSize: 9,
          letterSpacing: "0.3em",
          opacity: 0.22,
          zIndex: 50,
        }}
      >
        I
      </div>
    </div>
  );
}

// ---- Shot 5 · planetarium / armillary sphere interior ------------
function Shot5Planetarium({ shotProgress, theme }: ShotContext) {
  // Armillary slowly rotates.
  const rot = shotProgress * 25;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(180deg, #2a1810 0%, #1a1008 50%, #0a0604 100%)",
      }}
    >
      {/* Stone wall textures (vertical pillars) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "8%",
          background:
            "linear-gradient(90deg, #18100a 0%, transparent 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "8%",
          background:
            "linear-gradient(270deg, #18100a 0%, transparent 100%)",
        }}
      />
      {/* Left arched window with moon */}
      <div
        style={{
          position: "absolute",
          left: "12%",
          top: "10%",
          width: "20%",
          height: "55%",
          background:
            "radial-gradient(ellipse at 50% 60%, #4a3018 0%, #2a1810 70%)",
          borderRadius: "100% 100% 0 0 / 60% 60% 0 0",
          border: "1px solid #3a2418",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "30%",
            top: "20%",
            width: 30,
            height: 30,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, #fff 0%, #f0e0a0 70%, transparent 100%)",
            boxShadow: "0 0 28px #f0e0a0",
          }}
        />
      </div>
      {/* Right side: armillary sphere — concentric rings rotating */}
      <div
        style={{
          position: "absolute",
          right: "8%",
          top: "8%",
          width: 360,
          height: 360,
          maxWidth: "60%",
          maxHeight: "70%",
          aspectRatio: "1",
          transform: `rotate(${rot}deg)`,
        }}
      >
        <svg viewBox="0 0 360 360" style={{ width: "100%", height: "100%" }}>
          {/* Outer ring */}
          <ellipse cx={180} cy={180} rx={160} ry={160} fill="none" stroke="#c89048" strokeWidth={3} opacity={0.85} />
          {/* Tilted ring (equator) */}
          <ellipse cx={180} cy={180} rx={160} ry={50} fill="none" stroke="#c89048" strokeWidth={2.5} opacity={0.85} />
          {/* Inclined ring */}
          <ellipse cx={180} cy={180} rx={155} ry={50} fill="none" stroke="#a07028" strokeWidth={2} opacity={0.7} transform="rotate(45 180 180)" />
          {/* Tick marks around outer ring */}
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const x1 = 180 + Math.cos(a) * 160;
            const y1 = 180 + Math.sin(a) * 160;
            const x2 = 180 + Math.cos(a) * 150;
            const y2 = 180 + Math.sin(a) * 150;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a07028" strokeWidth={1} />;
          })}
          {/* Center bead */}
          <circle cx={180} cy={180} r={12} fill="#f0c060" />
          <circle cx={180} cy={180} r={6} fill="#fff8d0" />
        </svg>
      </div>
      {/* Pedestals running across the bottom */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "8%",
          height: 12,
          background: "#1a1008",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.6)",
        }}
      />
      {/* Tiny gameplay character */}
      <div
        style={{
          position: "absolute",
          left: `${20 + shotProgress * 25}%`,
          bottom: "12%",
          width: 14,
          height: 14,
          background: rgba(theme.diskOuterColor, 1),
          transform: "rotate(45deg)",
          boxShadow: `0 0 12px ${rgba(theme.diskOuterColor, 0.8)}`,
        }}
      />
    </div>
  );
}

// ---- Shot 6 · backlit telescope dolly forward --------------------
function Shot6Telescope({ shotProgress }: ShotContext) {
  // The composition is a one-point perspective: nested arches
  // recede toward the centered moon. The camera slowly dollies
  // forward — the arches expand, the moon's halo grows, the
  // bloom intensifies. Color grade: cool-blue inner core,
  // warm-magenta edges (from a wide vignette gradient pushing
  // into pinks at the outer 30%).

  const dolly = shotProgress; // 0..1
  const moonHaloScale = 1 + dolly * 0.6;
  const archScale = 1 + dolly * 0.2;
  const bloomBoost = 0.7 + dolly * 0.5;

  // Three concentric arches receding toward the moon. Each is
  // sized so it appears further back than the last — width and
  // height shrink, the lateral darken increases.
  const arches = [
    { w: 100, h: 95, fillBg: "#1a1230", fillRing: "#221a3c", strokeOpacity: 0.6, depthScale: 1.0 },
    { w: 70, h: 78, fillBg: "#1a1638", fillRing: "#2a2048", strokeOpacity: 0.55, depthScale: 0.92 },
    { w: 50, h: 64, fillBg: "#1c1a44", fillRing: "#322852", strokeOpacity: 0.5, depthScale: 0.86 },
    { w: 36, h: 52, fillBg: "#221e50", fillRing: "#382c5e", strokeOpacity: 0.45, depthScale: 0.8 },
  ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          // Layered: deep magenta at edges → cool blue at center,
          // exactly like the source's vignette grade.
          `radial-gradient(ellipse at 50% 48%, #2840a8 0%, #1a2068 28%, #0a0a30 60%, #200825 88%, #1a0418 100%)`,
        overflow: "hidden",
      }}
    >
      {/* Outer warm-magenta vignette layer — pushes the corners
          to that violet-pink tone */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(180, 60, 100, 0.18) 65%, rgba(80, 20, 60, 0.5) 100%)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* Stars scattered upper-right + sparse elsewhere — small,
          bright, with proper bloom on each */}
      <svg
        viewBox="0 0 100 56"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {[
          { x: 78, y: 8, r: 0.45, b: 1.5 },
          { x: 87, y: 18, r: 0.55, b: 2.0 },
          { x: 92, y: 12, r: 0.35, b: 1.2 },
          { x: 14, y: 6, r: 0.4, b: 1.4 },
          { x: 22, y: 16, r: 0.3, b: 1.0 },
          { x: 65, y: 5, r: 0.35, b: 1.2 },
          { x: 50, y: 9, r: 0.3, b: 1.0 },
          { x: 96, y: 22, r: 0.4, b: 1.4 },
        ].map((s, i) => (
          <g key={i}>
            <circle cx={s.x} cy={s.y} r={s.r * 2.4} fill="#fff8e0" opacity={0.18 * (1 + 0.3 * Math.sin(shotProgress * 4 + i))} />
            <circle cx={s.x} cy={s.y} r={s.r * 1.4} fill="#fff8e0" opacity={0.4} />
            <circle cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={0.95} />
            {/* 4-point sparkle */}
            <line x1={s.x - s.b} y1={s.y} x2={s.x + s.b} y2={s.y} stroke="#fff" strokeWidth={0.08} opacity={0.7} />
            <line x1={s.x} y1={s.y - s.b} x2={s.x} y2={s.y + s.b} stroke="#fff" strokeWidth={0.08} opacity={0.7} />
          </g>
        ))}
      </svg>

      {/* Receding arch tunnel — nested arch shapes, each smaller and
          deeper into the frame. Built as SVG so we can stack with
          proper z-order and gradient fills. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${archScale})`,
          transformOrigin: "50% 50%",
          transition: "none",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <defs>
            <linearGradient id="arch-stone" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1a1430" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#100828" stopOpacity="1" />
              <stop offset="100%" stopColor="#08041a" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Outermost arch frame — fills the whole top of the
              frame with the stone color, leaves a tall arch
              cutout in the middle. Path: rect minus arch hole. */}
          {arches.map((a, i) => {
            const x0 = (100 - a.w) / 2;
            const x1 = x0 + a.w;
            const y0 = 0; // top of frame
            const yArchTop = 100 - a.h * 0.95;
            const yArchHaunch = 100 - a.h * 0.6;
            const y1 = 100;
            return (
              <path
                key={i}
                d={`
                  M 0,${y0}
                  L 100,${y0}
                  L 100,${y1}
                  L 0,${y1}
                  Z
                  M ${x0},${y1}
                  L ${x0},${yArchHaunch}
                  Q ${x0},${yArchTop} ${(x0 + x1) / 2},${yArchTop}
                  Q ${x1},${yArchTop} ${x1},${yArchHaunch}
                  L ${x1},${y1}
                  Z
                `}
                fillRule="evenodd"
                fill={i === 0 ? "url(#arch-stone)" : a.fillBg}
                stroke={a.fillRing}
                strokeWidth="0.15"
                opacity={a.strokeOpacity}
              />
            );
          })}
        </svg>
      </div>

      {/* GOD-RAY bands — three soft bright triangles emanating
          from the moon position downward through the arch.
          Animated with a slow drift to feel volumetric. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          mixBlendMode: "screen",
          pointerEvents: "none",
          animation: "ap-godray-shift 4.5s ease-in-out infinite",
        }}
      >
        <defs>
          <linearGradient id="godray-grad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#a0c8ff" stopOpacity={0.5 * bloomBoost} />
            <stop offset="60%" stopColor="#80a0ff" stopOpacity={0.15 * bloomBoost} />
            <stop offset="100%" stopColor="#80a0ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points="50,38 38,100 62,100" fill="url(#godray-grad)" />
        <polygon points="50,38 30,100 70,100" fill="url(#godray-grad)" opacity="0.5" />
        <polygon points="50,38 22,100 78,100" fill="url(#godray-grad)" opacity="0.25" />
      </svg>

      {/* MOON — the actual focal point, dead center inside the
          deepest arch. LitMoon for proper sphere shading. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "44%",
          transform: `translate(-50%, -50%) scale(${moonHaloScale})`,
          width: 80,
          height: 80,
          zIndex: 4,
        }}
      >
        <LitMoon
          size={80}
          phase={0}
          litColor="#e8f0ff"
          shadowColor="#1a2848"
          rimColor="#a0c8ff"
          glowColor="#60a0ff"
          lightAngle={-25}
          breathe
        />
      </div>

      {/* Concentric tone rings around the moon — the source has
          this very clearly */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {[8, 12, 17, 23, 30].map((r, i) => (
          <circle
            key={i}
            cx={50}
            cy={44}
            r={r * moonHaloScale}
            fill="none"
            stroke={`rgba(160, 200, 255, ${0.5 - i * 0.08})`}
            strokeWidth={0.18}
          />
        ))}
      </svg>

      {/* Floor strip — thin warm horizon line at the base of the
          deepest arch where the telescope sits */}
      <div
        style={{
          position: "absolute",
          left: "30%",
          right: "30%",
          bottom: "12%",
          height: 1,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(180, 200, 255, 0.6) 50%, transparent 100%)",
          boxShadow: "0 0 8px rgba(180, 200, 255, 0.5)",
        }}
      />

      {/* Telescope — tripod with body + lens. Sits front-center
          but small, framed by the deepest arch. Pure black
          silhouette — no rim, since the source's telescope is
          a clear cutout. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "8%",
          width: 56,
          height: 130,
          marginLeft: -28,
          zIndex: 5,
        }}
      >
        <svg viewBox="0 0 56 130" style={{ width: "100%", height: "100%", overflow: "visible" }}>
          {/* Telescope barrel — small angled tube */}
          <g transform="rotate(-8 28 50)">
            <rect x={20} y={36} width={16} height={36} rx="2" fill="#000" />
            <circle cx={28} cy={36} r={9} fill="#000" />
            {/* Tiny lens reflection */}
            <circle cx={28} cy={36} r={3} fill="rgba(160, 200, 255, 0.8)" />
            <circle cx={26.5} cy={34.5} r={1.2} fill="#fff" opacity="0.85" />
          </g>
          {/* Vertical pole */}
          <rect x={26} y={70} width={4} height={32} fill="#000" />
          {/* Tripod legs spreading out */}
          <line x1={28} y1={102} x2={6} y2={128} stroke="#000" strokeWidth={2.5} />
          <line x1={28} y1={102} x2={50} y2={128} stroke="#000" strokeWidth={2.5} />
          <line x1={28} y1={102} x2={28} y2={128} stroke="#000" strokeWidth={2.5} />
          {/* Foot caps */}
          <circle cx={6} cy={128} r={1.5} fill="#000" />
          <circle cx={50} cy={128} r={1.5} fill="#000" />
          <circle cx={28} cy={128} r={1.5} fill="#000" />
        </svg>
      </div>

      {/* Atmospheric haze in the middle distance — soft warm glow
          that the moon's light is "scattering through" */}
      <AtmosphericHaze
        color="rgba(120, 140, 220, 0.4)"
        opacity={0.4 + dolly * 0.3}
        cx="50%"
        cy="46%"
        radius={36}
        z={2}
        drift
      />

      {/* Bloom growing toward end — the central core brightens,
          eventually flashing into Shot 7 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 44%, rgba(220, 235, 255, 0.6) 0%, rgba(160, 200, 255, 0.25) 25%, transparent 55%)",
          opacity: bloomBoost,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* Final-stretch bloom punch — only the last 30% of shot,
          ramps the bloom into the white-flash transition */}
      {dolly > 0.7 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255, 255, 255, 0.6)",
            opacity: ((dolly - 0.7) / 0.3) * 0.5,
            pointerEvents: "none",
          }}
        />
      )}

      <FilmGrain opacity={0.05} />
    </div>
  );
}

// ---- Shot 7 · first white flash ----------------------------------
function Shot7Flash({ shotProgress }: ShotContext) {
  // Frame is pure white most of the time, fading at end to reveal next shot.
  const opacity = shotProgress < 0.6 ? 1 : 1 - (shotProgress - 0.6) / 0.4;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#f8fbff",
        opacity,
      }}
    />
  );
}

// ---- Shot 8 · rectangular window onto starfield ------------------
function Shot8StarfieldWindow({ shotProgress, theme }: ShotContext) {
  // 200 stars positioned deterministically inside the inner window.
  const stars = useMemo(() => {
    const arr: Array<{ x: number; y: number; r: number; bright: number }> = [];
    let seed = 8;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 220; i++) {
      arr.push({ x: rand() * 100, y: rand() * 100, r: rand() * 1.2 + 0.3, bright: 0.4 + rand() * 0.6 });
    }
    return arr;
  }, []);
  // Character / shooting trail moves left to right inside the window.
  const trailX = 5 + shotProgress * 70;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#020208",
      }}
    >
      {/* Outer window frame letterbox top + bottom */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "12%", background: "#0a060a" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "12%", background: "#0a060a" }} />
      {/* Inner window — the rectangular viewport */}
      <div
        style={{
          position: "absolute",
          left: "10%",
          right: "10%",
          top: "12%",
          bottom: "12%",
          background:
            "radial-gradient(ellipse at 60% 70%, #4a2438 0%, #1a1028 40%, #08051a 100%)",
          overflow: "hidden",
        }}
      >
        {/* Starfield */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.3} fill="#fff" opacity={s.bright} />
          ))}
          {/* Constellation lines forming as character flies */}
          {shotProgress > 0.3 && (
            <g stroke="#a0c0ff" strokeWidth={0.15} opacity={0.6}>
              <line x1={20} y1={50} x2={35} y2={42} />
              <line x1={35} y1={42} x2={50} y2={55} />
              <line x1={50} y1={55} x2={65} y2={48} />
              <line x1={65} y1={48} x2={78} y2={60} />
            </g>
          )}
          {/* Shooting star streak */}
          <line
            x1={trailX - 8}
            y1={50 + Math.sin(shotProgress * 6) * 6}
            x2={trailX}
            y2={50 + Math.sin(shotProgress * 6) * 6}
            stroke="#fff"
            strokeWidth={0.5}
            opacity={0.85}
          />
        </svg>
        {/* Character icon mid-window */}
        <div
          style={{
            position: "absolute",
            left: `${trailX}%`,
            top: `${50 + Math.sin(shotProgress * 6) * 6}%`,
            width: 12,
            height: 12,
            background: rgba(theme.diskOuterColor, 1),
            boxShadow: `0 0 12px ${rgba(theme.diskOuterColor, 0.8)}`,
            transform: "rotate(45deg)",
          }}
        />
        {/* Pink-orange nebula at the bottom */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "30%",
            background:
              "radial-gradient(ellipse at 60% 100%, rgba(220, 100, 80, 0.5) 0%, transparent 60%)",
          }}
        />
      </div>
    </div>
  );
}

// ---- Shot 9 · dual side-by-side viewports ------------------------
function Shot9DualViewports({ shotProgress, theme }: ShotContext) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0a0814",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        padding: "10% 8%",
      }}
    >
      {/* Left frame — empty space, few stars */}
      <div
        style={{
          background:
            "radial-gradient(ellipse, #2a2438 0%, #100820 70%)",
          border: "1px solid #2a2440",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <circle cx="20" cy="30" r="0.6" fill="#fff" opacity="0.7" />
          <circle cx="60" cy="60" r="0.4" fill="#fff" opacity="0.6" />
          <circle cx="80" cy="20" r="0.5" fill="#fff" opacity="0.6" />
          <circle cx="40" cy="80" r="0.5" fill="#fff" opacity="0.5" />
        </svg>
      </div>
      {/* Right frame — character mid-flight + sparkles */}
      <div
        style={{
          background:
            "radial-gradient(ellipse, #38284a 0%, #181030 70%)",
          border: "1px solid #38284a",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2 + shotProgress * 0.5;
            const r = 18;
            return (
              <circle
                key={i}
                cx={50 + Math.cos(a) * r}
                cy={50 + Math.sin(a) * r}
                r="1"
                fill="#fff"
                opacity={0.4 + (i % 3) * 0.2}
              />
            );
          })}
        </svg>
        {/* Character at center */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            background: rgba(theme.diskOuterColor, 1),
            boxShadow: `0 0 16px ${rgba(theme.diskOuterColor, 0.9)}`,
            transform: "rotate(45deg)",
          }}
        />
      </div>
    </div>
  );
}

// ---- Shot 10 · collage / design board ----------------------------
function Shot10CollageBoard({ shotProgress, theme }: ShotContext) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at 50% 50%, #2a1840 0%, #100828 80%)",
      }}
    >
      {/* Film-strip diagonal */}
      <div
        style={{
          position: "absolute",
          left: "30%",
          top: "20%",
          width: "30%",
          height: "60%",
          background: "#000",
          transform: "rotate(8deg)",
          backgroundImage:
            "linear-gradient(180deg, #000 0%, #000 12%, #1a1a1a 12%, #1a1a1a 88%, #000 88%, #000 100%)",
        }}
      >
        {/* Sprocket holes */}
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 4,
              top: `${10 + i * 11}%`,
              width: 6,
              height: 8,
              background: "#0a0a0a",
              border: "1px solid #050505",
            }}
          />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={`r-${i}`}
            style={{
              position: "absolute",
              right: 4,
              top: `${10 + i * 11}%`,
              width: 6,
              height: 8,
              background: "#0a0a0a",
              border: "1px solid #050505",
            }}
          />
        ))}
      </div>
      {/* Index cards */}
      <div style={{ position: "absolute", left: "8%", top: "30%", width: 100, height: 60, background: "#f4ead0", transform: "rotate(-6deg)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)", padding: 6, fontSize: 7, fontFamily: "ui-monospace, monospace", color: "#3a2818", letterSpacing: "0.2em" }}>
        INTEREST<br />TOWARD…
      </div>
      <div style={{ position: "absolute", left: "12%", top: "55%", width: 60, height: 60, background: "#dcd2c0", transform: "rotate(8deg)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)", display: "grid", placeItems: "center", fontSize: 28, fontFamily: "ui-monospace, monospace", color: "#3a2818", fontWeight: 700 }}>
        4
      </div>
      <div style={{ position: "absolute", right: "12%", top: "20%", width: 90, height: 70, background: "#e0d6c0", transform: "rotate(4deg)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
        <svg viewBox="0 0 100 80" style={{ width: "100%", height: "100%" }}>
          {/* Polaroid-style schematic chart */}
          <line x1="10" y1="65" x2="90" y2="65" stroke="#3a2818" strokeWidth="1" />
          <polyline points="15,55 30,40 45,50 60,30 75,45 85,25" fill="none" stroke="#3a2818" strokeWidth="1.2" />
          <circle cx="30" cy="40" r="1.5" fill="#3a2818" />
          <circle cx="60" cy="30" r="1.5" fill="#3a2818" />
          <circle cx="85" cy="25" r="1.5" fill="#3a2818" />
        </svg>
      </div>
      <div style={{ position: "absolute", right: "8%", bottom: "20%", width: 80, height: 80, background: "#c8b898", transform: "rotate(-10deg)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }} />
      {/* Pink/magenta neon arrow */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <polyline points="20,80 40,60 50,70 70,40" fill="none" stroke="#ff40a0" strokeWidth="0.8" opacity="0.8" />
        <polygon points="68,38 73,38 73,43" fill="#ff40a0" />
      </svg>
      {/* Crosshair marker */}
      <div
        style={{
          position: "absolute",
          left: `${30 + shotProgress * 40}%`,
          top: "50%",
          color: "#fff",
          fontFamily: "ui-monospace, monospace",
          fontSize: 18,
          opacity: 0.9,
        }}
      >
        +
      </div>
      {/* Lens flare lower-right */}
      <div
        style={{
          position: "absolute",
          right: "10%",
          bottom: "8%",
          width: 80,
          height: 80,
          background:
            "radial-gradient(circle, rgba(255, 240, 200, 0.55) 0%, transparent 70%)",
          mixBlendMode: "screen",
        }}
      />
      {/* Tiny gameplay character */}
      <div
        style={{
          position: "absolute",
          left: `${15 + shotProgress * 70}%`,
          bottom: "18%",
          width: 12,
          height: 12,
          background: rgba(theme.diskOuterColor, 1),
          transform: "rotate(45deg)",
          boxShadow: `0 0 10px ${rgba(theme.diskOuterColor, 0.8)}`,
        }}
      />
    </div>
  );
}

// ---- Shot 11 · monochrome interior with lamp (NO narrative text) -
function Shot11MonochromeInterior({ shotProgress }: ShotContext) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(180deg, #1a1818 0%, #0a0a0a 80%)",
        filter: "saturate(0.1) contrast(1.05)",
      }}
    >
      {/* Bookcase silhouettes left + right */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "20%",
          background:
            "linear-gradient(90deg, #050505 0%, transparent 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "30%",
          background:
            "linear-gradient(270deg, #050505 0%, transparent 100%)",
        }}
      />
      {/* Stairs */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", left: "8%", bottom: 0, width: "30%", height: "60%" }}>
        <polygon points="0,100 0,30 20,30 20,50 40,50 40,70 60,70 60,90 100,90 100,100" fill="#1a1a1a" />
        <line x1="0" y1="30" x2="20" y2="30" stroke="#3a3a3a" strokeWidth="0.5" />
        <line x1="20" y1="50" x2="40" y2="50" stroke="#3a3a3a" strokeWidth="0.5" />
        <line x1="40" y1="70" x2="60" y2="70" stroke="#3a3a3a" strokeWidth="0.5" />
        <line x1="60" y1="90" x2="100" y2="90" stroke="#3a3a3a" strokeWidth="0.5" />
      </svg>
      {/* Tiffany-style desk lamp */}
      <div
        style={{
          position: "absolute",
          right: "30%",
          bottom: "20%",
          width: 80,
          height: 120,
        }}
      >
        <svg viewBox="0 0 80 120" style={{ width: "100%", height: "100%" }}>
          {/* Lamp shade */}
          <ellipse cx={40} cy={30} rx={32} ry={22} fill="#3a3a3a" />
          <ellipse cx={40} cy={30} rx={28} ry={18} fill="#5a5a48" />
          {/* Lamp post */}
          <rect x={37} y={48} width={6} height={50} fill="#1a1a1a" />
          <rect x={28} y={98} width={24} height={6} fill="#1a1a1a" />
          {/* Light cone */}
          <polygon points="6,52 74,52 96,120 -16,120" fill="rgba(255, 230, 160, 0.18)" />
        </svg>
      </div>
      {/* Tiny gameplay character on the stairs */}
      <div
        style={{
          position: "absolute",
          left: `${12 + shotProgress * 18}%`,
          bottom: `${28 + shotProgress * 30}%`,
          width: 12,
          height: 12,
          background: "#fff",
          transform: "rotate(45deg)",
          opacity: 0.6,
        }}
      />
      {/* Subtle film grain via repeating noise */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 40% 60%, transparent 0%, rgba(0,0,0,0.4) 80%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ---- Shot 12 · monochrome with hanging moons + porthole ---------
function Shot12HangingMoons({ shotProgress }: ShotContext) {
  // Right side brightens — dawn arriving.
  const dawn = Math.min(1, shotProgress * 1.2);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0a0a0a",
        filter: "saturate(0.15) contrast(1.05)",
      }}
    >
      {/* Bookshelves left */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "30%",
          background:
            "linear-gradient(90deg, #1a1a1a 0%, transparent 100%)",
        }}
      />
      {/* Hanging moons (small white spheres on strings) */}
      {[
        { x: "26%", y: 38, size: 22 },
        { x: "32%", y: 28, size: 14 },
        { x: "38%", y: 50, size: 18 },
        { x: "44%", y: 24, size: 12 },
      ].map((m, i) => (
        <div key={i} style={{ position: "absolute", left: m.x, top: 0 }}>
          {/* String */}
          <div style={{ position: "absolute", left: m.size / 2 - 0.5, top: 0, width: 1, height: m.y * 4, background: "#3a3a3a" }} />
          {/* Moon */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: m.y * 4,
              width: m.size,
              height: m.size,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 30% 30%, #f0f0f0 0%, #707070 70%, #2a2a2a 100%)",
              boxShadow: "0 0 8px rgba(255,255,255,0.2)",
            }}
          />
        </div>
      ))}
      {/* Circular porthole, right side, brightening */}
      <div
        style={{
          position: "absolute",
          right: "12%",
          top: "30%",
          width: 200,
          height: 200,
          maxWidth: "32%",
          aspectRatio: "1",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, #ffffff 0%, #c8c8c8 50%, #4a4a4a 100%)",
          opacity: 0.6 + dawn * 0.4,
          boxShadow: `0 0 ${50 + dawn * 80}px rgba(255,255,255,${0.5 + dawn * 0.5})`,
          border: "3px solid #2a2a2a",
        }}
      >
        {/* Light rays */}
        <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={100 + Math.cos(a) * 80}
                y1={100 + Math.sin(a) * 80}
                x2={100 + Math.cos(a) * 130}
                y2={100 + Math.sin(a) * 130}
                stroke="#fff"
                strokeWidth={1.5}
                opacity={dawn * 0.7}
              />
            );
          })}
        </svg>
      </div>
      {/* Tiny gameplay character at base */}
      <div
        style={{
          position: "absolute",
          left: "55%",
          bottom: "22%",
          width: 12,
          height: 12,
          background: "#fff",
          transform: "rotate(45deg)",
          opacity: 0.6,
        }}
      />
    </div>
  );
}

// ---- Shot 13 · cracked porthole, color returning ----------------
function Shot13CrackedPorthole({ shotProgress }: ShotContext) {
  // Saturation returns; cracks fade in then frame brightens.
  const sat = 0.15 + shotProgress * 0.85;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at 65% 50%, #4a3050 0%, #1a0830 60%, #0a0418 100%)",
        filter: `saturate(${sat})`,
      }}
    >
      {/* Porthole, bigger now, almost filling the right half */}
      <div
        style={{
          position: "absolute",
          right: "8%",
          top: "10%",
          width: "60%",
          height: "80%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(160, 200, 255, 0.7) 50%, rgba(80, 80, 160, 0.3) 100%)",
          boxShadow: "0 0 80px rgba(160,200,255,0.6)",
          border: "3px solid rgba(80, 80, 100, 0.6)",
        }}
      >
        {/* Cracks */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <line x1="50" y1="50" x2="20" y2="30" stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" opacity={shotProgress * 0.8} />
          <line x1="50" y1="50" x2="80" y2="20" stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" opacity={shotProgress * 0.8} />
          <line x1="50" y1="50" x2="75" y2="85" stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" opacity={shotProgress * 0.6} />
          <line x1="50" y1="50" x2="25" y2="78" stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" opacity={shotProgress * 0.7} />
        </svg>
      </div>
    </div>
  );
}

// ---- Shot 14 · girl looking up, zoom-out-and-up -----------------
function Shot14GirlLookingUp({ shotProgress }: ShotContext) {
  // Composition is a low-angle observatory shot: a planetarium
  // DOME centered with a tiny girl silhouette on top of it,
  // lamppost foreground-right, distant cityscape silhouette
  // behind the dome, stars above, pink gameplay markers along
  // the foreground railing. Camera dolly-zooms (zoom out + rise),
  // so foreground elements parallax DOWN-and-OUT while the dome
  // and sky reveal. Five depth layers, each translating at a
  // different rate.

  // Eased dolly progress with cubic-bezier-like ease-in-out
  const t = shotProgress;
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // Layer translations (% of viewport) per parallax depth
  const skyShift = -eased * 3;        // distant — barely moves
  const cityShift = -eased * 6;       // far — small move
  const domeShift = -eased * 11;      // mid — medium move
  const lamppostShift = -eased * 18;  // foreground — biggest move
  const railShift = -eased * 22;      // immediate foreground — most

  // Zoom out — foreground scales down faster than background
  const fgZoom = 1.25 - eased * 0.35; // 1.25 → 0.9
  const midZoom = 1.15 - eased * 0.2; // 1.15 → 0.95
  const bgZoom = 1.05 - eased * 0.05; // 1.05 → 1.0

  // Soft star twinkle — different phase per index
  const twinkle = (i: number) =>
    0.45 + 0.45 * Math.abs(Math.sin(t * 3 + i * 0.7));

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          // Twilight gradient — deep navy top → magenta band → dusky horizon
          `linear-gradient(180deg,
            #0a0820 0%,
            #1a1240 25%,
            #2a1450 55%,
            #3a1845 75%,
            #2a1438 90%,
            #1a0a28 100%)`,
        overflow: "hidden",
      }}
    >
      {/* LAYER 1 (deepest): SKY STARS — drift slowly up as
          camera rises. Each star is a real sparkle: dot + cross. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateY(${skyShift}%) scale(${bgZoom})`,
          transformOrigin: "50% 30%",
          transition: "none",
        }}
      >
        <svg
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "55%",
          }}
        >
          {[
            { x: 8, y: 8, s: 0.5 },
            { x: 14, y: 18, s: 0.35 },
            { x: 23, y: 5, s: 0.6 },
            { x: 32, y: 14, s: 0.4 },
            { x: 38, y: 22, s: 0.3 },
            { x: 47, y: 9, s: 0.55 },
            { x: 55, y: 18, s: 0.4 },
            { x: 62, y: 6, s: 0.45 },
            { x: 70, y: 14, s: 0.5 },
            { x: 78, y: 7, s: 0.4 },
            { x: 84, y: 20, s: 0.3 },
            { x: 90, y: 12, s: 0.55 },
            { x: 96, y: 22, s: 0.35 },
            { x: 17, y: 30, s: 0.3 },
            { x: 41, y: 35, s: 0.35 },
            { x: 73, y: 32, s: 0.3 },
          ].map((s, i) => (
            <g key={i} opacity={twinkle(i)}>
              {/* Halo */}
              <circle cx={s.x} cy={s.y} r={s.s * 1.6} fill="#fff8e0" opacity={0.2} />
              {/* Body */}
              <circle cx={s.x} cy={s.y} r={s.s * 0.5} fill="#fff" />
              {/* Cross */}
              <line x1={s.x - s.s * 1.5} y1={s.y} x2={s.x + s.s * 1.5} y2={s.y} stroke="#fff" strokeWidth={0.06} opacity={0.5} />
              <line x1={s.x} y1={s.y - s.s * 1.5} x2={s.x} y2={s.y + s.s * 1.5} stroke="#fff" strokeWidth={0.06} opacity={0.5} />
            </g>
          ))}
        </svg>
      </div>

      {/* LAYER 2: ATMOSPHERIC HORIZON HAZE — a wide warm pink
          band sitting at the horizon line, fading up + down */}
      <div
        style={{
          position: "absolute",
          left: "-5%",
          right: "-5%",
          top: `${52 + skyShift * 0.5}%`,
          height: "26%",
          background:
            "radial-gradient(ellipse 80% 100% at 50% 50%, rgba(220, 130, 160, 0.38) 0%, rgba(160, 70, 110, 0.18) 50%, transparent 80%)",
          mixBlendMode: "screen",
          pointerEvents: "none",
          filter: "blur(6px)",
        }}
      />

      {/* LAYER 3: DISTANT CITYSCAPE silhouette behind the dome,
          very subtle, low contrast. Built as a single SVG with
          irregular building tops. */}
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${58 + cityShift}%`,
          width: "100%",
          height: "12%",
          opacity: 0.55,
          transform: `scale(${midZoom})`,
          transformOrigin: "50% 50%",
        }}
      >
        <defs>
          <linearGradient id="city14" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a0d28" />
            <stop offset="100%" stopColor="#08041a" />
          </linearGradient>
        </defs>
        <path
          d="M 0,30 L 0,18 L 4,18 L 4,12 L 8,12 L 8,8 L 12,8 L 12,16 L 16,16 L 16,5 L 18,5 L 18,16 L 22,16 L 22,10 L 26,10 L 26,18 L 30,18 L 30,14 L 34,14 L 34,9 L 38,9 L 38,16 L 42,16 L 42,7 L 44,7 L 44,16 L 48,16 L 48,11 L 52,11 L 52,16 L 56,16 L 56,8 L 58,8 L 58,16 L 62,16 L 62,10 L 66,10 L 66,15 L 70,15 L 70,9 L 74,9 L 74,17 L 78,17 L 78,12 L 82,12 L 82,16 L 86,16 L 86,8 L 90,8 L 90,15 L 94,15 L 94,12 L 100,12 L 100,30 Z"
          fill="url(#city14)"
        />
        {/* A few warm window lights scattered */}
        {[
          { x: 6, y: 14 },
          { x: 14, y: 10 },
          { x: 32, y: 16 },
          { x: 50, y: 13 },
          { x: 68, y: 12 },
          { x: 84, y: 14 },
        ].map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width={0.4} height={0.4} fill="#ffb060" opacity={0.7 * (0.5 + 0.5 * Math.sin(t * 2 + i))} />
        ))}
      </svg>

      {/* LAYER 4: THE DOME — main subject. Dark hemisphere with
          a bright yellow rim glow at the top. Lampposts /
          structures attached at the base. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: `${56 + domeShift}%`,
          transform: `translateX(-50%) scale(${midZoom})`,
          transformOrigin: "50% 100%",
          width: 460,
          height: 280,
          marginLeft: -230,
          maxWidth: "60%",
          aspectRatio: "460/280",
        }}
      >
        <svg viewBox="0 0 460 280" preserveAspectRatio="xMidYMax meet" style={{ width: "100%", height: "100%", overflow: "visible" }}>
          <defs>
            {/* Dome shading: top-bright, bottom-dark hemisphere */}
            <radialGradient id="dome-shade" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#3a3050" />
              <stop offset="40%" stopColor="#221a3a" />
              <stop offset="100%" stopColor="#0a0820" />
            </radialGradient>
            {/* Top rim glow — warm yellow */}
            <radialGradient id="dome-rim" cx="50%" cy="0%" r="40%">
              <stop offset="0%" stopColor="#ffd070" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#ff9050" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ff9050" stopOpacity="0" />
            </radialGradient>
            {/* Glass observation slit — faint cyan rectangle */}
            <linearGradient id="dome-slit" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#406090" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#1a3050" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Outer rim glow — drawn first so dome covers most of
              it but the top corona shows */}
          <ellipse cx="230" cy="100" rx="280" ry="100" fill="url(#dome-rim)" opacity="0.7" />

          {/* Dome hemisphere */}
          <path
            d="M 30,200 Q 30,40 230,40 Q 430,40 430,200 L 30,200 Z"
            fill="url(#dome-shade)"
            stroke="rgba(120,100,160,0.4)"
            strokeWidth="1"
          />

          {/* Dome paneling — subtle radial stripes for surface */}
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i / 8) * Math.PI;
            const x1 = 230 + Math.cos(Math.PI - a) * 200;
            const y1 = 200 - Math.sin(a) * 158;
            return (
              <line
                key={i}
                x1={230}
                y1={200}
                x2={x1}
                y2={y1}
                stroke="rgba(140, 120, 180, 0.15)"
                strokeWidth="0.7"
              />
            );
          })}

          {/* Observation slit — angled vertical strip on the
              dome, where the telescope would emerge */}
          <path
            d="M 222,40 L 238,40 L 240,160 L 220,160 Z"
            fill="url(#dome-slit)"
            stroke="rgba(160, 200, 255, 0.5)"
            strokeWidth="0.8"
          />

          {/* Foundation strip */}
          <rect x="20" y="200" width="420" height="20" fill="#0a0418" />
          <rect x="20" y="200" width="420" height="2" fill="rgba(180, 150, 200, 0.3)" />

          {/* Stairs at front */}
          <path d="M 180,220 L 280,220 L 290,260 L 170,260 Z" fill="#0a0418" stroke="rgba(120, 100, 160, 0.25)" strokeWidth="0.5" />
          <line x1="175" y1="240" x2="285" y2="240" stroke="rgba(140, 120, 180, 0.2)" strokeWidth="0.6" />

          {/* THE GIRL — tiny silhouette on top of the dome,
              looking up. Small enough that she's a detail, not
              the focal point. */}
          <g transform="translate(220, 36)">
            {/* Hair flowing behind */}
            <path d="M 6,4 Q -2,18 4,30 L 10,30 Q 12,16 10,4 Z" fill="#000" />
            {/* Body */}
            <path d="M 4,8 Q 2,22 6,32 L 14,32 Q 18,22 16,8 Z" fill="#000" />
            {/* Head, tilted up — slightly off-axis to suggest
                the gaze direction (up + slightly right) */}
            <ellipse cx="10" cy="6" rx="4" ry="4.5" fill="#000" />
          </g>
        </svg>
      </div>

      {/* LAYER 5: PINK GAMEPLAY MARKERS — circular pink rings
          along the railing, glowing.  These are the "gameplay
          objects" from the source frame; they sit at the
          horizon line in the foreground. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: `${10 - railShift}%`,
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8%",
          transform: `scale(${fgZoom})`,
          transformOrigin: "50% 100%",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "2px solid #ff60a0",
              boxShadow:
                "0 0 14px rgba(255, 96, 160, 0.8), inset 0 0 6px rgba(255, 96, 160, 0.5)",
              opacity: 0.85,
              animation: `ap-orb-flicker ${5 + i * 0.4}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* LAYER 6: LAMPPOST in the foreground-right —
          parallaxes the most. Old-fashioned wrought-iron-style. */}
      <div
        style={{
          position: "absolute",
          right: "16%",
          bottom: `${5 - lamppostShift * 0.8}%`,
          width: 72,
          height: 320,
          transform: `scale(${fgZoom})`,
          transformOrigin: "50% 100%",
          zIndex: 4,
        }}
      >
        <svg viewBox="0 0 72 320" style={{ width: "100%", height: "100%", overflow: "visible" }}>
          {/* Pole */}
          <rect x="34" y="80" width="4" height="240" fill="#000" />
          {/* Decorative top scrolls */}
          <path
            d="M 36,80 Q 36,72 40,68 Q 44,64 48,68 Q 52,72 50,80 Z"
            fill="#000"
          />
          <path
            d="M 36,80 Q 36,72 32,68 Q 28,64 24,68 Q 20,72 22,80 Z"
            fill="#000"
          />
          {/* Lamp head — square cage with glass */}
          <path d="M 24,40 L 48,40 L 52,75 L 20,75 Z" fill="#0a0610" stroke="#000" strokeWidth="1" />
          {/* Glass — warm glow */}
          <path d="M 27,46 L 45,46 L 48,72 L 24,72 Z" fill="rgba(255, 200, 130, 0.85)" />
          <path d="M 27,46 L 45,46 L 48,72 L 24,72 Z" fill="url(#lamp-glass-grad)" opacity="0.9" />
          <defs>
            <radialGradient id="lamp-glass-grad" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#fff8d8" stopOpacity="1" />
              <stop offset="60%" stopColor="#ffb060" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#cc6020" stopOpacity="0.7" />
            </radialGradient>
          </defs>
          {/* Lamp dome cap */}
          <path d="M 24,40 L 48,40 L 44,28 L 28,28 Z" fill="#000" />
          <circle cx="36" cy="24" r="3" fill="#000" />

          {/* Light cone falling forward — soft warm cone, screen
              blend for additive light feel. Drawn outside the
              SVG via a sibling div below since SVG can't easily
              do the long fade we want without filters. */}

          {/* Crossbar with two hanging pieces */}
          <line x1="20" y1="105" x2="52" y2="105" stroke="#000" strokeWidth="2" />
          <circle cx="20" cy="108" r="3" fill="#000" />
          <circle cx="52" cy="108" r="3" fill="#000" />
        </svg>
        {/* Soft warm cone falling FROM the lamp downward */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 50,
            width: 220,
            height: 180,
            marginLeft: -110,
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(255, 200, 130, 0.4) 0%, rgba(255, 160, 80, 0.18) 30%, transparent 60%)",
            mixBlendMode: "screen",
            pointerEvents: "none",
            filter: "blur(2px)",
          }}
        />
      </div>

      {/* LAYER 7: Foreground railing strip — thin horizontal
          line + balusters near the bottom edge */}
      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: `${railShift * -1 + 2}%`,
          width: "100%",
          height: "5%",
          transform: `scale(${fgZoom})`,
          transformOrigin: "50% 100%",
          zIndex: 5,
        }}
      >
        {/* Top rail */}
        <line x1="0" y1="2" x2="100" y2="2" stroke="#000" strokeWidth="0.4" />
        {/* Balusters */}
        {Array.from({ length: 32 }, (_, i) => (
          <line
            key={i}
            x1={i * 3.2}
            y1="2"
            x2={i * 3.2}
            y2="8"
            stroke="#000"
            strokeWidth="0.18"
            opacity="0.8"
          />
        ))}
        {/* Bottom rail */}
        <line x1="0" y1="7" x2="100" y2="7" stroke="#000" strokeWidth="0.3" />
      </svg>

      {/* OVERALL film grain + subtle vignette */}
      <FilmGrain opacity={0.05} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 60%, transparent 50%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
          zIndex: 49,
        }}
      />
    </div>
  );
}

// ---- Shot 15 · fast-changing transitions (sub-beats) ------------
function Shot15FastTransitions({ shotProgress, theme }: ShotContext) {
  // 4 sub-beats over 4s — each held ~1s with a hard cut.
  const sub = Math.min(3, Math.floor(shotProgress * 4));
  const palettes = [
    { bg: "linear-gradient(45deg, #ff2080 0%, #4010a0 100%)", accent: "#fff", inner: "#ffe040" },
    { bg: "radial-gradient(ellipse at 50% 50%, #f4ead0 0%, #c8a878 80%)", accent: "#3a2818", inner: "#c83020" },
    { bg: "linear-gradient(180deg, #00308a 0%, #001028 100%)", accent: "#80c0ff", inner: "#fff" },
    { bg: "radial-gradient(ellipse at 50% 50%, #4a0040 0%, #1a001a 80%)", accent: "#ff60c0", inner: "#fff" },
  ];
  const p = palettes[sub]!;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: p.bg,
        transition: "none",
      }}
    >
      {/* Big circular focal element, different per sub-beat */}
      <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <circle cx={300} cy={300} r={140} fill="none" stroke={p.accent} strokeWidth={2} />
        <circle cx={300} cy={300} r={110} fill="none" stroke={p.accent} strokeWidth={1.5} strokeDasharray="4 6" opacity={0.7} />
        {sub === 0 && (
          <circle cx={300} cy={300} r={50} fill={p.inner} opacity={0.8} />
        )}
        {sub === 1 && (
          <g>
            <line x1={160} y1={300} x2={440} y2={300} stroke={p.accent} strokeWidth={1.5} />
            <line x1={300} y1={160} x2={300} y2={440} stroke={p.accent} strokeWidth={1.5} />
            <rect x={270} y={270} width={60} height={60} fill="none" stroke={p.inner} strokeWidth={2} />
          </g>
        )}
        {sub === 2 && (
          <g>
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={300 + Math.cos(a) * 140}
                  y1={300 + Math.sin(a) * 140}
                  x2={300 + Math.cos(a) * 200}
                  y2={300 + Math.sin(a) * 200}
                  stroke={p.accent}
                  strokeWidth={2}
                  opacity={0.7}
                />
              );
            })}
            <circle cx={300} cy={300} r={40} fill={p.inner} />
          </g>
        )}
        {sub === 3 && (
          <g>
            {Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2;
              return (
                <polygon
                  key={i}
                  points={`${300 + Math.cos(a) * 80},${300 + Math.sin(a) * 80} ${300 + Math.cos(a + 0.3) * 130},${300 + Math.sin(a + 0.3) * 130} ${300 + Math.cos(a - 0.3) * 130},${300 + Math.sin(a - 0.3) * 130}`}
                  fill={p.accent}
                  opacity={0.6}
                />
              );
            })}
          </g>
        )}
      </svg>
      {/* Watermark to keep theme alive */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 24,
          color: theme.hudAccent,
          fontFamily: "ui-monospace, monospace",
          fontSize: 9,
          letterSpacing: "0.3em",
          opacity: 0.5,
        }}
      >
        {String(sub + 1).padStart(2, "0")} / 04
      </div>
    </div>
  );
}

// ---- Shots 16-18 · abstract flight beats x3 distinct cuts -------
function ShotFlight({ shotProgress, theme, beat }: ShotContext & { beat: number }) {
  // Three beats, each gets its own palette + line motif.
  const palettes = [
    { bg: "linear-gradient(135deg, #1a0838 0%, #5a1080 100%)", line: "#ff80c0", count: 14 },
    { bg: "linear-gradient(180deg, #00204a 0%, #001830 100%)", line: "#80e0ff", count: 18 },
    { bg: "radial-gradient(ellipse at 30% 50%, #1a4030 0%, #04200c 80%)", line: "#80ffa0", count: 12 },
  ];
  const p = palettes[beat]!;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: p.bg,
        overflow: "hidden",
      }}
    >
      {/* High-speed line streaks */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {Array.from({ length: p.count }, (_, i) => {
          const yBase = (i * 7.3) % 100;
          // Lines move L→R fast.
          const speed = 1.5 + ((i * 13) % 10) / 6;
          const x = (shotProgress * 100 * speed + i * 20) % 140 - 20;
          const len = 8 + ((i * 11) % 10);
          return (
            <line
              key={i}
              x1={x}
              y1={yBase}
              x2={x + len}
              y2={yBase}
              stroke={p.line}
              strokeWidth={0.4}
              opacity={0.7}
            />
          );
        })}
        {/* Center accent */}
        <circle cx={50} cy={50} r={2} fill={p.line} opacity={0.9} />
      </svg>
      {/* Tiny gameplay character — flies along */}
      <div
        style={{
          position: "absolute",
          left: `${10 + shotProgress * 80}%`,
          top: `${50 + Math.sin(shotProgress * 8) * 8}%`,
          width: 14,
          height: 14,
          background: rgba(theme.diskOuterColor, 1),
          transform: "rotate(45deg)",
          boxShadow: `0 0 14px ${rgba(theme.diskOuterColor, 0.9)}`,
        }}
      />
    </div>
  );
}

// ---- Shot 19 · cream minimal disc beat ---------------------------
function Shot19MinimalDisc({ shotProgress }: ShotContext) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, #f5ecd8 0%, #e8d8b8 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 110,
          height: 110,
          marginLeft: -55,
          marginTop: -55,
          borderRadius: "50%",
          background: "#1a1830",
          boxShadow: "0 8px 32px rgba(26,24,48,0.3)",
          transform: `scale(${1 + shotProgress * 0.05})`,
        }}
      >
        <svg viewBox="0 0 110 110" style={{ width: "100%", height: "100%" }}>
          <circle cx={55} cy={55} r={40} fill="none" stroke="#fff" strokeWidth={1} opacity={0.5} />
          <circle cx={55} cy={55} r={28} fill="none" stroke="#fff" strokeWidth={1} opacity={0.5} />
          <circle cx={55} cy={55} r={16} fill="none" stroke="#fff" strokeWidth={1} opacity={0.5} />
          <circle cx={55} cy={55} r={4} fill="#fff" />
        </svg>
      </div>
      {/* Few thin radial lines */}
      <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {Array.from({ length: 4 }, (_, i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
          return (
            <line
              key={i}
              x1={400 + Math.cos(a) * 80}
              y1={300 + Math.sin(a) * 80}
              x2={400 + Math.cos(a) * 200}
              y2={300 + Math.sin(a) * 200}
              stroke="#3a2818"
              strokeWidth={0.6}
              opacity={0.4}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ---- Shot 20 · twin-orb climax -----------------------------------
function Shot20TwinOrbs({ shotProgress, theme }: ShotContext) {
  const pulse = Math.abs(Math.sin(shotProgress * Math.PI * 4));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at 50% 50%, #2a1040 0%, #0a0418 80%)",
      }}
    >
      {/* Letterbox */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "8%", background: "#000" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "8%", background: "#000" }} />
      {/* Twin orange-rim orbs */}
      {[
        { left: "18%", scale: 1 + pulse * 0.05 },
        { right: "18%", scale: 1 + pulse * 0.05 },
      ].map((o, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "30%",
            width: "30%",
            aspectRatio: "1",
            maxWidth: 280,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(80,40,80,0.4) 0%, rgba(40,20,40,0.6) 70%, transparent 100%)",
            border: "4px solid #ff8030",
            boxShadow: "0 0 60px #ff6020, inset 0 0 40px rgba(255,128,48,0.4)",
            transform: `scale(${o.scale})`,
            ...o,
          }}
        >
          {/* Mini scene inside the orb */}
          <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <line x1="0" y1="60" x2="100" y2="60" stroke="#fff" strokeWidth="0.5" opacity="0.4" />
            <rect x="20" y="40" width="20" height="20" fill="rgba(255,128,48,0.3)" />
            <rect x="60" y="35" width="20" height="25" fill="rgba(255,128,48,0.3)" />
          </svg>
        </div>
      ))}
      {/* Central magenta starburst */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 80,
          height: 80,
          marginLeft: -40,
          marginTop: -40,
          transform: `scale(${1 + pulse * 0.2})`,
        }}
      >
        <svg viewBox="0 0 80 80" style={{ width: "100%", height: "100%" }}>
          <polygon
            points="40,5 47,33 75,40 47,47 40,75 33,47 5,40 33,33"
            fill="#ff20a0"
            opacity={0.9}
            style={{ filter: "drop-shadow(0 0 20px #ff20a0)" }}
          />
        </svg>
      </div>
      {/* Smaller star points scattered */}
      {[
        { left: "30%", top: "20%", size: 14 },
        { left: "65%", top: "76%", size: 12 },
        { left: "12%", top: "70%", size: 10 },
        { left: "82%", top: "22%", size: 12 },
      ].map((s, i) => (
        <svg key={i} viewBox="0 0 20 20" style={{ position: "absolute", width: s.size, height: s.size, left: s.left, top: s.top }}>
          <polygon points="10,1 12,8 19,10 12,12 10,19 8,12 1,10 8,8" fill={theme.hudAccent} opacity="0.85" />
        </svg>
      ))}
      {/* Tiny gameplay character at center, flying through */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "60%",
          width: 14,
          height: 14,
          marginLeft: -7,
          background: rgba(theme.diskOuterColor, 1),
          transform: "rotate(45deg)",
          boxShadow: `0 0 14px ${rgba(theme.diskOuterColor, 0.9)}`,
        }}
      />
    </div>
  );
}

// ---- Shot 21 · black with diagonal red beam + dial --------------
function Shot21RedBeam({ shotProgress }: ShotContext) {
  // Beam sweeps in fast.
  const beamProg = Math.min(1, shotProgress * 2.5);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#020208",
      }}
    >
      {/* Film-strip top + bottom */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "10%",
          background:
            "linear-gradient(180deg, #000 0%, #000 30%, #1a1a1a 30%, #1a1a1a 70%, #000 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "10%",
          background:
            "linear-gradient(0deg, #000 0%, #000 30%, #1a1a1a 30%, #1a1a1a 70%, #000 70%)",
        }}
      />
      {/* Sprocket holes */}
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={`top-${i}`}
          style={{
            position: "absolute",
            top: "3%",
            left: `${4 + i * 6}%`,
            width: 14,
            height: 16,
            background: "#000",
            border: "1px solid #2a2a2a",
          }}
        />
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={`bot-${i}`}
          style={{
            position: "absolute",
            bottom: "3%",
            left: `${4 + i * 6}%`,
            width: 14,
            height: 16,
            background: "#000",
            border: "1px solid #2a2a2a",
          }}
        />
      ))}
      {/* Diagonal red-pink beam */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="beam21" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ff60a0" stopOpacity="0" />
            <stop offset="40%" stopColor="#ff2080" stopOpacity="1" />
            <stop offset="60%" stopColor="#ff60c0" stopOpacity="1" />
            <stop offset="100%" stopColor="#ff80c0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={100 - beamProg * 100}
          y1={0}
          x2={100 - beamProg * 100 + 30}
          y2={100}
          stroke="url(#beam21)"
          strokeWidth={3}
          opacity={0.95}
        />
      </svg>
      {/* Schematic clock dial bottom-left */}
      <svg viewBox="0 0 100 100" style={{ position: "absolute", left: "12%", bottom: "20%", width: "16%", height: "20%" }}>
        <circle cx={50} cy={50} r={45} fill="none" stroke="#fff" strokeWidth={1} opacity={0.6} />
        <circle cx={50} cy={50} r={32} fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.5} strokeDasharray="2 4" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * 38}
              y1={50 + Math.sin(a) * 38}
              x2={50 + Math.cos(a) * 45}
              y2={50 + Math.sin(a) * 45}
              stroke="#fff"
              strokeWidth={1}
              opacity={0.7}
            />
          );
        })}
        {/* Hand */}
        <line x1={50} y1={50} x2={50 + Math.cos(shotProgress * Math.PI * 2) * 30} y2={50 + Math.sin(shotProgress * Math.PI * 2) * 30} stroke="#ff80c0" strokeWidth={1.5} />
      </svg>
      {/* Two small geometric diamond gameplay icons */}
      <div style={{ position: "absolute", right: "20%", top: "40%", width: 12, height: 12, background: "#80c0ff", transform: "rotate(45deg)", boxShadow: "0 0 10px #80c0ff" }} />
      <div style={{ position: "absolute", right: "12%", top: "60%", width: 14, height: 14, background: "#ff80c0", transform: "rotate(45deg)", boxShadow: "0 0 12px #ff80c0" }} />
    </div>
  );
}

// ---- Shot 22 · cream radial sun-burst ---------------------------
function Shot22RadialBurst({ shotProgress }: ShotContext) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at 50% 50%, #fff4d8 0%, #f0d8a0 80%)",
      }}
    >
      {/* Massive radial line burst */}
      <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const len = 220 + ((i * 17) % 80);
          return (
            <line
              key={i}
              x1={300 + Math.cos(a) * 50}
              y1={300 + Math.sin(a) * 50}
              x2={300 + Math.cos(a) * len * (0.4 + shotProgress * 0.6)}
              y2={300 + Math.sin(a) * len * (0.4 + shotProgress * 0.6)}
              stroke="#3a2818"
              strokeWidth={0.5 + (i % 3) * 0.3}
              opacity={0.5}
            />
          );
        })}
        {/* Constellation dotted lines */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 + 0.2;
          return (
            <line
              key={`d-${i}`}
              x1={300 + Math.cos(a) * 60}
              y1={300 + Math.sin(a) * 60}
              x2={300 + Math.cos(a) * 280}
              y2={300 + Math.sin(a) * 280}
              stroke="#3a2818"
              strokeWidth="1"
              strokeDasharray="2 5"
              opacity="0.4"
            />
          );
        })}
        {/* Center white orb with crescent */}
        <circle cx={300} cy={300} r={36} fill="#fff" />
        <circle cx={310} cy={295} r={28} fill="#fff4d8" />
      </svg>
      {/* Small diamond/star icons orbiting */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + shotProgress * 0.5;
        const cx = 50 + Math.cos(a) * 22;
        const cy = 50 + Math.sin(a) * 22;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${cx}%`,
              top: `${cy}%`,
              width: 10,
              height: 10,
              background: "#3a2818",
              transform: "translate(-50%, -50%) rotate(45deg)",
            }}
          />
        );
      })}
      {/* Red triangle markers top + bottom */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <polygon points="50,4 56,12 44,12" fill="#c83020" />
        <polygon points="50,96 56,88 44,88" fill="#c83020" />
      </svg>
    </div>
  );
}

// ---- Shot 23 · navy radar/scope frame (HOLD STATE) -------------
function Shot23Radar({ shotProgress, theme, accountsCount, holdingsCount, transactionsCount, isHolding, holdElapsedMs }: ShotContext & { isHolding: boolean; holdElapsedMs: number }) {
  // While "playing through", the shot is just the radar frame.
  // While "holding" (sync still in flight), an alert pulse runs on
  // the inner reticle — short period, subtle opacity range so it
  // reads as "actively listening" not "screensaver."
  const holdPulse = isHolding
    ? 1 + Math.sin((holdElapsedMs / RADAR_HOLD_PULSE_MS) * Math.PI * 2) * RADAR_HOLD_OPACITY_RANGE
    : 1;
  // While in normal play (not holding), the reticle slowly rotates 0→25°.
  const rot = isHolding ? (holdElapsedMs / 60) % 360 : shotProgress * 25;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at 50% 50%, #102040 0%, #050818 60%, #02030a 100%)",
      }}
    >
      {/* Scope reticle SVG — fills most of frame */}
      <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {/* Outer thin circle */}
        <circle cx={300} cy={300} r={260} fill="none" stroke="#a0c0ff" strokeWidth={1} opacity={0.5} />
        {/* Tick marks all the way around */}
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i / 72) * Math.PI * 2 - Math.PI / 2;
          const isMajor = i % 18 === 0;
          const isMid = i % 6 === 0;
          const len = isMajor ? 18 : isMid ? 10 : 5;
          return (
            <line
              key={i}
              x1={300 + Math.cos(a) * 260}
              y1={300 + Math.sin(a) * 260}
              x2={300 + Math.cos(a) * (260 - len)}
              y2={300 + Math.sin(a) * (260 - len)}
              stroke="#a0c0ff"
              strokeWidth={isMajor ? 1.5 : 1}
              opacity={isMajor ? 0.85 : 0.5}
            />
          );
        })}
        {/* Constellation patterns rotating around inside */}
        <g transform={`rotate(${rot} 300 300)`} opacity={0.55}>
          {Array.from({ length: 8 }, (_, k) => {
            const a0 = (k / 8) * Math.PI * 2;
            const points: Array<[number, number]> = [];
            for (let j = 0; j < 4; j++) {
              const aa = a0 + j * 0.06;
              const rr = 200 + ((k * 17 + j * 11) % 30);
              points.push([300 + Math.cos(aa) * rr, 300 + Math.sin(aa) * rr]);
            }
            return (
              <g key={k}>
                {points.slice(0, -1).map((p, i) => (
                  <line key={i} x1={p[0]} y1={p[1]} x2={points[i + 1]![0]} y2={points[i + 1]![1]} stroke="#a0c0ff" strokeWidth={0.6} />
                ))}
                {points.map((p, i) => (
                  <circle key={`s-${i}`} cx={p[0]} cy={p[1]} r={2} fill="#fff" />
                ))}
              </g>
            );
          })}
        </g>
        {/* Inner ring with pulse */}
        <circle cx={300} cy={300} r={130 * holdPulse} fill="none" stroke="#c0d8ff" strokeWidth={1.5} opacity={isHolding ? 0.85 : 0.7} />
        {/* Central nebula glow */}
        <defs>
          <radialGradient id="r23neb" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="40%" stopColor="#a0c0ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#503080" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={300} cy={300} r={100} fill="url(#r23neb)" />
        {/* Center bright star */}
        <polygon points="300,275 305,295 325,300 305,305 300,325 295,305 275,300 295,295" fill="#fff" opacity={0.95} />
        {/* Red lightning-bolt corner markers */}
        <polyline points="80,50 110,90 90,100 130,140" stroke="#ff4060" strokeWidth={2.5} fill="none" />
        <polyline points="520,550 490,510 510,500 470,460" stroke="#ff4060" strokeWidth={2.5} fill="none" />
      </svg>
      {/* Numeric ticks at corners */}
      {[
        { tl: { left: 24, top: 24, n: "01" } },
        { tr: { right: 24, top: 24, n: "02" } },
        { bl: { left: 24, bottom: 24, n: "03" } },
        { br: { right: 24, bottom: 24, n: "04" } },
      ].map((entry, i) => {
        const obj = Object.values(entry)[0]!;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              color: theme.hudAccent,
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              letterSpacing: "0.3em",
              opacity: 0.7,
              ...obj,
            }}
          >
            {obj.n}
          </div>
        );
      })}
      {/* Live HUD stats, surfaced when holding */}
      {isHolding && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: "8%",
            transform: "translateX(-50%)",
            color: theme.hudAccent,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            opacity: 0.8 * holdPulse,
            whiteSpace: "nowrap",
          }}
        >
          {accountsCount} accts · {holdingsCount} holdings · listening
        </div>
      )}
    </div>
  );
}

// ---- Shot 24 · final white flash ---------------------------------
function Shot24Flash({ shotProgress }: ShotContext) {
  // Flash IS the completion: full white peak, fade to transparent.
  const peakDur = FLASH_PEAK_MS / (FLASH_PEAK_MS + FLASH_FADE_MS);
  const opacity = shotProgress < peakDur ? 1 : 1 - (shotProgress - peakDur) / (1 - peakDur);
  return <div style={{ position: "absolute", inset: 0, background: "#ffffff", opacity }} />;
}

// ---- Timeline definition -------------------------------------------
const TIMELINE: ShotDef[] = [
  { id: "1-void", durationMs: 3000, render: (ctx) => <Shot1BlackVoid {...ctx} /> },
  { id: "2-chart", durationMs: 10000, render: (ctx) => <Shot2AstronomicalChart {...ctx} /> },
  { id: "3-blueprint", durationMs: 8000, render: (ctx) => <Shot3BlueprintWorkshop {...ctx} /> },
  { id: "4-girl-lantern", durationMs: 3000, render: (ctx) => <Shot4GirlLantern {...ctx} /> },
  { id: "5-planetarium", durationMs: 8000, render: (ctx) => <Shot5Planetarium {...ctx} /> },
  { id: "6-telescope", durationMs: 4000, render: (ctx) => <Shot6Telescope {...ctx} /> },
  { id: "7-flash", durationMs: 400, render: (ctx) => <Shot7Flash {...ctx} /> },
  { id: "8-window", durationMs: 12000, render: (ctx) => <Shot8StarfieldWindow {...ctx} /> },
  { id: "9-dual", durationMs: 6000, render: (ctx) => <Shot9DualViewports {...ctx} /> },
  { id: "10-collage", durationMs: 6000, render: (ctx) => <Shot10CollageBoard {...ctx} /> },
  { id: "11-mono", durationMs: 8000, render: (ctx) => <Shot11MonochromeInterior {...ctx} /> },
  { id: "12-moons", durationMs: 4000, render: (ctx) => <Shot12HangingMoons {...ctx} /> },
  { id: "13-cracked", durationMs: 2000, render: (ctx) => <Shot13CrackedPorthole {...ctx} /> },
  { id: "14-girl-up", durationMs: 4000, render: (ctx) => <Shot14GirlLookingUp {...ctx} /> },
  { id: "15-fast", durationMs: 4000, render: (ctx) => <Shot15FastTransitions {...ctx} /> },
  { id: "16-flight-a", durationMs: 4000, render: (ctx) => <ShotFlight {...ctx} beat={0} /> },
  { id: "17-flight-b", durationMs: 4000, render: (ctx) => <ShotFlight {...ctx} beat={1} /> },
  { id: "18-flight-c", durationMs: 4000, render: (ctx) => <ShotFlight {...ctx} beat={2} /> },
  { id: "19-minimal", durationMs: 3000, render: (ctx) => <Shot19MinimalDisc {...ctx} /> },
  { id: "20-twin-orbs", durationMs: 4000, render: (ctx) => <Shot20TwinOrbs {...ctx} /> },
  { id: "21-red-beam", durationMs: 4000, render: (ctx) => <Shot21RedBeam {...ctx} /> },
  { id: "22-radial", durationMs: 4000, render: (ctx) => <Shot22RadialBurst {...ctx} /> },
  // Shot 23 has special hold-state handling; its play-through duration is 5s.
  // The orchestrator extends it indefinitely if sync isn't done yet.
  { id: "23-radar", durationMs: 5000, render: () => null /* rendered specially */ },
];

const TIMELINE_END_MS = TIMELINE.reduce((a, s) => a + s.durationMs, 0);
// Index of Shot 23 in the array — needed for the hold-state branch.
const RADAR_INDEX = TIMELINE.findIndex((s) => s.id === "23-radar");

// ---- Component -----------------------------------------------------
export function ApertureOverlay({
  brokerName,
  accountsCount = 0,
  holdingsCount = 0,
  transactionsCount = 0,
  syncComplete = false,
  onClose,
  __previewOffsetMs = 0,
}: ApertureOverlayProps) {
  const theme = themeForBroker(brokerName);
  const [now, setNow] = useState(() => performance.now());
  // Seed startRef with the negative of the preview offset so the
  // first rAF tick reads (now - startRef) = offsetMs, jumping the
  // timeline to the desired shot. In prod, __previewOffsetMs is 0
  // and this is a no-op.
  const startRef = useRef<number>(performance.now() - __previewOffsetMs);
  // Once the user signals sync complete, we transition into the
  // final flash (Shot 24). Track that as a separate timeline so we
  // don't have to mutate the TIMELINE array.
  const [flashing, setFlashing] = useState(false);
  const flashStartRef = useRef<number>(0);
  // Once flashing finishes, we call onClose. Track once-only.
  const flashDone = useRef(false);

  // rAF tick — drives EVERYTHING (shot progress, holds, flash).
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Trigger the final-flash transition when syncComplete flips true.
  // The flash plays out (Shot 24) and then onClose fires.
  useEffect(() => {
    if (syncComplete && !flashing) {
      setFlashing(true);
      flashStartRef.current = performance.now();
    }
  }, [syncComplete, flashing]);

  // ---- Resolve which shot is active ------------------------------
  const elapsedMs = now - startRef.current;

  // Phase 4: flashing — render Shot 24 and call onClose at end.
  if (flashing) {
    const flashElapsed = now - flashStartRef.current;
    const flashTotal = FLASH_PEAK_MS + FLASH_FADE_MS;
    const flashProgress = Math.min(1, flashElapsed / flashTotal);
    if (flashProgress >= 1 && !flashDone.current) {
      flashDone.current = true;
      // Defer onClose to the next tick so we don't update parent
      // state inside a child render.
      window.setTimeout(() => onClose?.(), 0);
    }
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
        <Shot24Flash
          shotProgress={flashProgress}
          elapsedMs={flashElapsed}
          theme={theme}
          accountsCount={accountsCount}
          holdingsCount={holdingsCount}
          transactionsCount={transactionsCount}
        />
      </div>
    );
  }

  // Walk the timeline to find the active shot.
  let acc = 0;
  let activeIdx = 0;
  for (let i = 0; i < TIMELINE.length; i++) {
    const s = TIMELINE[i]!;
    if (elapsedMs < acc + s.durationMs) {
      activeIdx = i;
      break;
    }
    acc += s.durationMs;
    if (i === TIMELINE.length - 1) activeIdx = i;
  }
  const activeShot = TIMELINE[activeIdx]!;
  const inShotMs = elapsedMs - acc;
  // For non-final shots, shotProgress clamps 0..1.
  // For the radar shot in hold mode, shotProgress maxes at 1 and we
  // pass holdElapsedMs separately.
  const isOnRadar = activeIdx === RADAR_INDEX;
  const isHoldingOnRadar = isOnRadar && inShotMs > activeShot.durationMs;
  const shotProgress = Math.min(1, inShotMs / activeShot.durationMs);

  const ctx: ShotContext = {
    shotProgress,
    elapsedMs,
    theme,
    accountsCount,
    holdingsCount,
    transactionsCount,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Syncing your brokerage"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "#000",
        overflow: "hidden",
      }}
    >
      {/* Shared SVG filter defs + keyframes. Mount once at the
          top of the overlay so every shot can reference them by id. */}
      <ApertureFilters />
      <ApertureKeyframes />

      {/* Render the active shot. Radar gets the special hold props. */}
      {isOnRadar ? (
        <Shot23Radar
          {...ctx}
          isHolding={isHoldingOnRadar}
          holdElapsedMs={isHoldingOnRadar ? inShotMs - activeShot.durationMs : 0}
        />
      ) : (
        activeShot.render(ctx)
      )}

      {/* Persistent watermark + phase caption — always visible, very
          faint, in the broker's accent color. Reads as a HUD layer
          over whatever shot is on. */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 24,
          color: theme.hudAccent,
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.4em",
          opacity: 0.35,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        {theme.watermark}
      </div>
    </div>
  );
}

export default ApertureOverlay;
