import { useEffect, useMemo, useRef, useState } from "react";
import { themeForBroker } from "./spaceTheme";

/**
 * Aperture-style 2D overlay. Models the visual energy of Geometry
 * Dash level "Aperture" by chunlv1 — circular focal frame, schematic
 * line work (compass ticks, sprocket holes, constellation arcs), per-
 * phase color grades that hard-cut between phases, vignettes that
 * swap inside the focal frame on a 1.5s rhythm, and a single
 * diagonal red beam that snaps across the frame on every beat.
 *
 * Pure DOM + SVG + CSS animations. No canvas, no Three.js, no
 * shaders that can fail silently. All motion driven by elapsed time
 * and a 95-BPM beat counter.
 *
 * Prop-driven so the same component serves both the real post-connect
 * mount path and the localhost ?preview=overlay shell. Phase is
 * controlled externally — the overlay never advances itself.
 */

// ---- Tunables ------------------------------------------------------
const BPM = 95;
const BEAT_MS = (60 / BPM) * 1000; // ~631ms
const VIGNETTE_HOLD_MS = 1500; // ~2.4 beats per vignette
const BEAM_FADE_MS = 400;
// Completion flash: full-white peak then fade to transparent.
const FLASH_PEAK_MS = 80;
const FLASH_FADE_MS = 400;

export type Phase = 1 | 2 | 3 | "done";

export interface ApertureOverlayProps {
  /** What's currently happening. The overlay never decides this — the
   *  caller drives it. */
  phase: Phase;
  /** Used for the watermark + accent colors. Falls back to default. */
  brokerName?: string | null;
  /** Phase-2 wait timer. Caller is responsible for resetting it
   *  between phases — the overlay just displays. Pass undefined to
   *  hide the timer (phase 1 / phase 3). */
  waitSeconds?: number;
  /** When true, the photographic completion flash plays. Caller
   *  raises this for ~480ms (FLASH_PEAK_MS + FLASH_FADE_MS) at the
   *  moment of dashboard hand-off. */
  flashing?: boolean;
  /** Live counts shown inside the focal frame's vignettes. All
   *  optional — vignettes that depend on a missing field just show
   *  a placeholder. */
  accountsCount?: number;
  holdingsCount?: number;
  transactionsCount?: number;
  /** Top-line message for phase 1 + phase 2 when no vignette is
   *  on screen. Phase 3 / done use their own copy. */
  message?: string;
}

// ---- Phase color grades --------------------------------------------
//
// Aperture color-grades each scene differently. Phases hard-cut
// between palettes — there's no smooth interpolation, that would
// kill the vibe.
interface PhaseGrade {
  /** CSS background — usually a dramatic gradient. */
  background: string;
  /** Color of all the schematic line work (frame ring, ticks,
   *  cross-hairs). White-ish on dark phases, dark on bright. */
  lineColor: string;
  /** Subtle accent color used for the inside of vignettes. */
  vignetteAccent: string;
  /** Color of the phase caption text + ticker numbers. */
  textColor: string;
}

const PHASE_GRADES: Record<Phase, PhaseGrade> = {
  1: {
    background: "radial-gradient(ellipse at 50% 60%, #4a1a3a 0%, #1a0814 60%, #08020a 100%)",
    lineColor: "#f0d8e8",
    vignetteAccent: "#ff80a8",
    textColor: "#f8e8f0",
  },
  2: {
    background: "radial-gradient(ellipse at 50% 50%, #2a1448 0%, #100628 70%, #02000a 100%)",
    lineColor: "#d8c8ff",
    vignetteAccent: "#a080ff",
    textColor: "#e8e0ff",
  },
  3: {
    // Phase 3 — DB writes — Aperture-style cream + black for contrast.
    background: "radial-gradient(ellipse at 50% 50%, #f5ecd8 0%, #e8d8b8 80%, #c8b090 100%)",
    lineColor: "#1a1208",
    vignetteAccent: "#c83020",
    textColor: "#1a1208",
  },
  done: {
    background: "radial-gradient(ellipse at 50% 50%, #1a4030 0%, #08200c 80%, #020806 100%)",
    lineColor: "#a0ffa0",
    vignetteAccent: "#80ff60",
    textColor: "#d0ffd0",
  },
};

// ---- Beat hook -----------------------------------------------------
//
// Returns a monotonically-increasing beat counter that bumps every
// BEAT_MS ms. Components key animations off the change in counter
// rather than off elapsed time so a re-render is cheap and the beam
// fires exactly once per beat.
function useBeat(): { beat: number; phase01: number } {
  const [beat, setBeat] = useState(0);
  // phase01 is 0..1 within the current beat — used for tonal pulse.
  const [phase01, setPhase01] = useState(0);
  const startRef = useRef(performance.now());
  useEffect(() => {
    const startedAt = startRef.current;
    let raf = 0;
    let cancelled = false;
    let lastBeatIndex = -1;
    function tick() {
      if (cancelled) return;
      const elapsed = performance.now() - startedAt;
      const beatIdx = Math.floor(elapsed / BEAT_MS);
      const within = (elapsed % BEAT_MS) / BEAT_MS;
      setPhase01(within);
      if (beatIdx !== lastBeatIndex) {
        lastBeatIndex = beatIdx;
        setBeat(beatIdx);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);
  return { beat, phase01 };
}

// ---- Vignette swap hook --------------------------------------------
//
// Returns the index of the vignette to currently display from a list.
// Cycles every VIGNETTE_HOLD_MS. Resets when the list reference
// changes (e.g. phase change).
function useVignetteIndex(count: number): number {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (count <= 1) {
      setIdx(0);
      return;
    }
    const id = window.setInterval(() => {
      setIdx((cur) => (cur + 1) % count);
    }, VIGNETTE_HOLD_MS);
    return () => window.clearInterval(id);
  }, [count]);
  return idx;
}

// ---- Component -----------------------------------------------------

export function ApertureOverlay({
  phase,
  brokerName,
  waitSeconds,
  flashing = false,
  accountsCount,
  holdingsCount,
  transactionsCount,
  message,
}: ApertureOverlayProps) {
  const theme = themeForBroker(brokerName);
  const grade = PHASE_GRADES[phase];

  const { beat, phase01 } = useBeat();

  // Build the vignette list per phase. Each vignette is a small
  // function that renders inside the circular focal frame.
  const vignettes = useMemo(() => buildVignettes(phase, {
    accountsCount,
    holdingsCount,
    transactionsCount,
    accent: grade.vignetteAccent,
    lineColor: grade.lineColor,
    textColor: grade.textColor,
  }), [phase, accountsCount, holdingsCount, transactionsCount, grade.vignetteAccent, grade.lineColor, grade.textColor]);

  const vIdx = useVignetteIndex(vignettes.length);

  // ---- Completion flash (full white peak, fade to transparent) ----
  //
  // Driven by `flashing` prop. We start a one-shot timeline locally
  // when the prop flips true; the parent only needs to flip it once.
  const [flashOpacity, setFlashOpacity] = useState(0);
  useEffect(() => {
    if (!flashing) {
      setFlashOpacity(0);
      return;
    }
    setFlashOpacity(1);
    const fadeStart = window.setTimeout(() => {
      // Trigger CSS transition by changing opacity; the inline
      // transition prop on the layer drives the timing.
      setFlashOpacity(0);
    }, FLASH_PEAK_MS);
    return () => {
      window.clearTimeout(fadeStart);
    };
  }, [flashing]);

  // ---- Beam: snap diagonally across the frame on every beat ------
  //
  // Driven by the beat counter. We re-key the SVG <line> on each
  // beat so the CSS transition restarts.
  const beamKey = beat;

  // ---- Phase tonal pulse ----------------------------------------
  //
  // The whole overlay slightly dims between beats — emphasizes the
  // beat without being garish. 0.92 → 1.0 → 0.92 across one beat,
  // weighted toward the attack.
  const pulseEnvelope = (() => {
    // Sharper attack, softer decay.
    if (phase01 < 0.15) return 1.0;
    return 0.92 + 0.08 * (1 - (phase01 - 0.15) / 0.85);
  })();

  // ---- Caption above letterbox bottom ---------------------------
  const phaseCaption = (() => {
    if (phase === "done") return "complete";
    if (phase === 1) return "syncing";
    if (phase === 2) return "waiting on broker";
    if (phase === 3) return "loading transactions";
    return "";
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Syncing"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: grade.background,
        // Hard cut on phase change — no transition.
        transition: "none",
        overflow: "hidden",
        // Subtle film grain via a CSS gradient repeating on hover —
        // cheap pseudo-noise.
        filter: `brightness(${pulseEnvelope.toFixed(3)})`,
      }}
    >
      {/* ---- Letterbox bars ---- */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 40,
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          color: theme.hudAccent,
          fontSize: 10,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <span style={{ opacity: 0.7 }}>{theme.watermark}</span>
        <span style={{ opacity: 0.5 }}>{phaseCaption}</span>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 40,
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          color: theme.hudAccent,
          fontSize: 10,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <span style={{ opacity: 0.5 }}>
          {typeof waitSeconds === "number" ? fmtTimer(waitSeconds) : "—"}
        </span>
        <span style={{ opacity: 0.7 }}>phase {phase === "done" ? "—" : phase}</span>
      </div>

      {/* ---- Focal frame: the circular instrument at center ---- */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: "60px 24px",
        }}
      >
        <FocalFrame
          beamKey={beamKey}
          lineColor={grade.lineColor}
          textColor={grade.textColor}
          accentColor={grade.vignetteAccent}
          phase={phase}
        >
          {vignettes[vIdx]?.()}
        </FocalFrame>
      </div>

      {/* ---- Top-line message (phase 1 / 2 narration) ---- */}
      {message && phase !== "done" && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 0,
            right: 0,
            textAlign: "center",
            color: grade.textColor,
            fontSize: 13,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.85,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {message}
        </div>
      )}

      {/* ---- Photographic completion flash ---- */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "#ffffff",
          opacity: flashOpacity,
          transition:
            flashOpacity === 1
              ? "none"
              : `opacity ${FLASH_FADE_MS}ms ease-out`,
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
    </div>
  );
}

// ---- Focal frame component -----------------------------------------
//
// The circular instrument at center: an outer ring with sprocket
// holes, a middle ring with compass ticks at the cardinal directions,
// constellation arcs in the corners, the active vignette in the
// center, and the beat-synced diagonal beam crossing through.
function FocalFrame({
  beamKey,
  lineColor,
  textColor,
  accentColor,
  phase,
  children,
}: {
  beamKey: number;
  lineColor: string;
  textColor: string;
  accentColor: string;
  phase: Phase;
  children?: React.ReactNode;
}) {
  // SVG viewBox is square. We render at the size of the smaller
  // viewport dimension, capped, via a wrapper div.
  const VB = 600;
  const cx = VB / 2;
  const cy = VB / 2;
  const outerR = 270;
  const middleR = 240;
  const innerR = 200;

  // Sprocket holes around the outer ring.
  const SPROCKETS = 36;
  const sprockets = Array.from({ length: SPROCKETS }, (_, i) => {
    const a = (i / SPROCKETS) * Math.PI * 2;
    return { x: cx + Math.cos(a) * outerR, y: cy + Math.sin(a) * outerR };
  });

  // Compass tick marks every 6° on the middle ring; longer ticks at
  // cardinal + ordinal directions.
  const TICKS = 60;
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 15 === 0;
    const isMinor = i % 5 === 0;
    const len = isMajor ? 18 : isMinor ? 10 : 5;
    const x1 = cx + Math.cos(a) * middleR;
    const y1 = cy + Math.sin(a) * middleR;
    const x2 = cx + Math.cos(a) * (middleR - len);
    const y2 = cy + Math.sin(a) * (middleR - len);
    return { x1, y1, x2, y2, isMajor };
  });

  // Cardinal labels (N/E/S/W) just outside the inner ring.
  const cardinals: Array<{ label: string; x: number; y: number }> = [
    { label: "N", x: cx, y: cy - middleR + 32 },
    { label: "E", x: cx + middleR - 30, y: cy + 4 },
    { label: "S", x: cx, y: cy + middleR - 22 },
    { label: "W", x: cx - middleR + 30, y: cy + 4 },
  ];

  // Beam: diagonal line across the frame, snaps in via key change.
  // Random angle per beat keeps it alive but always crossing center.
  const beamAngle = useMemo(() => {
    // Deterministic pseudo-random per beat for stable testing.
    const seed = beamKey * 9301 + 49297;
    const r = (seed % 233280) / 233280;
    return r * Math.PI * 2;
  }, [beamKey]);
  const beamLen = 360;
  const bx1 = cx + Math.cos(beamAngle) * beamLen;
  const by1 = cy + Math.sin(beamAngle) * beamLen;
  const bx2 = cx + Math.cos(beamAngle + Math.PI) * beamLen;
  const by2 = cy + Math.sin(beamAngle + Math.PI) * beamLen;

  return (
    <div
      style={{
        position: "relative",
        width: "min(80vmin, 720px)",
        aspectRatio: "1 / 1",
      }}
    >
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
        role="presentation"
      >
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={lineColor} strokeWidth="1.2" opacity={0.6} />

        {/* Sprocket holes */}
        {sprockets.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={3} fill={lineColor} opacity={0.55} />
        ))}

        {/* Middle ring */}
        <circle cx={cx} cy={cy} r={middleR} fill="none" stroke={lineColor} strokeWidth="1" opacity={0.45} />

        {/* Compass ticks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={lineColor}
            strokeWidth={t.isMajor ? 2 : 1}
            opacity={t.isMajor ? 0.85 : 0.45}
          />
        ))}

        {/* Cardinal letters */}
        {cardinals.map((c) => (
          <text
            key={c.label}
            x={c.x}
            y={c.y}
            fill={textColor}
            fontSize="14"
            fontFamily="ui-monospace, monospace"
            letterSpacing="0.3em"
            textAnchor="middle"
            opacity={0.85}
          >
            {c.label}
          </text>
        ))}

        {/* Inner ring */}
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={lineColor} strokeWidth="1.5" opacity={0.7} />

        {/* Constellation lines — three thin diagonal accents off the
            outer ring suggesting a star map. Static — they don't
            move per beat, just sit there for visual texture. */}
        {Array.from({ length: 3 }, (_, i) => {
          const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
          const x1 = cx + Math.cos(a) * outerR;
          const y1 = cy + Math.sin(a) * outerR;
          const x2 = cx + Math.cos(a + 0.4) * (outerR + 50);
          const y2 = cy + Math.sin(a + 0.4) * (outerR + 50);
          const x3 = cx + Math.cos(a + 0.6) * (outerR + 30);
          const y3 = cy + Math.sin(a + 0.6) * (outerR + 30);
          return (
            <g key={`con-${i}`} opacity={0.4}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={lineColor} strokeWidth="1" strokeDasharray="3 3" />
              <line x1={x2} y1={y2} x2={x3} y2={y3} stroke={lineColor} strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x2} cy={y2} r={3} fill={lineColor} />
              <circle cx={x3} cy={y3} r={2} fill={lineColor} />
            </g>
          );
        })}

        {/* Crosshair through the center — short marks only, like a
            scope reticle. */}
        <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} stroke={lineColor} strokeWidth="1" opacity={0.5} />
        <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} stroke={lineColor} strokeWidth="1" opacity={0.5} />

        {/* ---- The beat-synced diagonal beam.
                Re-keyed every beat so the CSS animation restarts. ---- */}
        <line
          key={beamKey}
          x1={bx1}
          y1={by1}
          x2={bx2}
          y2={by2}
          stroke={accentColor}
          strokeWidth="2.5"
          opacity={0.85}
          style={{
            animation: `aperture-beam ${BEAM_FADE_MS}ms ease-out both`,
            mixBlendMode: phase === 3 ? "multiply" : "screen",
          }}
        />

        {/* Beam keyframes injected once per FocalFrame instance.
            We use stroke-dashoffset to draw the line in fast then
            fade, which reads as a snap rather than a drift. */}
        <defs>
          <style>{`
            @keyframes aperture-beam {
              0% { opacity: 0; transform-origin: 50% 50%; transform: scale(0.6); }
              15% { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(1.05); }
            }
          `}</style>
        </defs>
      </svg>

      {/* ---- Vignette content (HTML, sits inside the inner ring) ---- */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: textColor,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            // Constrain to inner ring's bounding box (innerR * 2 / VB).
            width: "55%",
            height: "55%",
            display: "grid",
            placeItems: "center",
            textAlign: "center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ---- Vignettes -----------------------------------------------------
//
// Each phase has 2-3 vignettes. They cycle on a 1.5s rhythm. Each
// vignette is a render function so it can read live state via
// closure.
function buildVignettes(
  phase: Phase,
  ctx: {
    accountsCount?: number;
    holdingsCount?: number;
    transactionsCount?: number;
    accent: string;
    lineColor: string;
    textColor: string;
  },
): Array<() => React.ReactNode> {
  if (phase === 1) {
    return [
      () => <NumeralVignette label="connecting" digit="01" sub="brokerage handshake" {...ctx} />,
      () => <NumeralVignette label="syncing" digit="02" sub="account discovery" {...ctx} />,
      () => <RingChartVignette label="initializing" {...ctx} />,
    ];
  }
  if (phase === 2) {
    return [
      () => (
        <CountVignette
          label="accounts"
          value={ctx.accountsCount ?? 0}
          {...ctx}
        />
      ),
      () => (
        <CountVignette
          label="holdings"
          value={ctx.holdingsCount ?? 0}
          {...ctx}
        />
      ),
      () => <WaitingVignette {...ctx} />,
    ];
  }
  if (phase === 3) {
    return [
      () => (
        <CountVignette
          label="loading"
          value={ctx.transactionsCount ?? 0}
          unit="txns"
          {...ctx}
        />
      ),
      () => <RingChartVignette label="writing" {...ctx} />,
    ];
  }
  // done
  return [
    () => (
      <CountVignette
        label="loaded"
        value={ctx.transactionsCount ?? 0}
        unit="txns"
        {...ctx}
      />
    ),
  ];
}

// ---- Vignette atoms ------------------------------------------------

function NumeralVignette({
  label,
  digit,
  sub,
  textColor,
}: {
  label: string;
  digit: string;
  sub: string;
  textColor: string;
  accent: string;
  lineColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: textColor,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 96,
          fontWeight: 700,
          color: textColor,
          lineHeight: 1,
          letterSpacing: "-0.04em",
        }}
      >
        {digit}
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: textColor,
          opacity: 0.5,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function CountVignette({
  label,
  value,
  unit,
  textColor,
}: {
  label: string;
  value: number;
  unit?: string;
  textColor: string;
  accent: string;
  lineColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: textColor,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 88,
          fontWeight: 700,
          color: textColor,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString()}
      </div>
      {unit && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: textColor,
            opacity: 0.5,
          }}
        >
          {unit}
        </div>
      )}
    </div>
  );
}

function RingChartVignette({
  label,
  textColor,
  accent,
  lineColor,
}: {
  label: string;
  textColor: string;
  accent: string;
  lineColor: string;
}) {
  // Cute schematic ring chart inside the focal frame.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <svg viewBox="0 0 100 100" style={{ width: 100, height: 100 }}>
        <circle cx="50" cy="50" r="44" stroke={lineColor} strokeWidth="2" fill="none" opacity={0.4} />
        <circle
          cx="50"
          cy="50"
          r="44"
          stroke={accent}
          strokeWidth="3"
          fill="none"
          strokeDasharray="180 1000"
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <circle cx="50" cy="50" r="2" fill={accent} />
      </svg>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: textColor,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function WaitingVignette({
  textColor,
  accent,
  lineColor,
}: {
  textColor: string;
  accent: string;
  lineColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      {/* Three dots that pulse in sequence — schematic loading. */}
      <div style={{ display: "flex", gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: accent,
              opacity: 0.85,
              animation: `aperture-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes aperture-dot {
          0%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: textColor,
          opacity: 0.7,
        }}
      >
        broker prep
      </div>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: lineColor,
          opacity: 0.4,
          maxWidth: 220,
          lineHeight: 1.6,
        }}
      >
        rolling poll · 60s cycle
      </div>
    </div>
  );
}

// ---- Helpers -------------------------------------------------------
function fmtTimer(s: number): string {
  if (s < 60) return `0:${Math.floor(s).toString().padStart(2, "0")}`;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default ApertureOverlay;
