/**
 * Shared SVG filters and reusable visual primitives for the Aperture
 * overlay shots. The point of this module is to give each shot
 * cinematic-quality lighting, depth, and texture without per-shot
 * one-off filter definitions cluttering the component file.
 *
 * Filters provided:
 *   atmospheric-haze   — feGaussianBlur on a colored mask, layered
 *                        as a separate <feMerge> branch so haze sits
 *                        between scene layers without losing detail
 *   film-grain          — feTurbulence + feColorMatrix tinted to
 *                        the per-shot grade, low-opacity multiply
 *   shimmer-distort     — feTurbulence + feDisplacementMap for
 *                        the orb-light shimmer (Shot 4) and the
 *                        atmospheric rays (Shot 6)
 *   vignette-warm       — radial darken at edges, slight warm push
 *                        toward magenta (matches the source's edge grade)
 *
 * Reusable primitives:
 *   <LitMoon />         — actual sphere shading with terminator,
 *                        rim, surface noise via feTurbulence
 *   <GodRay />          — single volumetric ray, fades along length
 *   <AtmosphericLayer/> — full-screen radial-gradient haze, animated
 *                        slow drift via translateX(±2px) + feTurbulence
 *   <RimLitSilhouette/> — black silhouette with a per-edge rim
 *                        highlight in a chosen color (the one thing
 *                        I was failing at most)
 */

import { useEffect, useRef, useState } from "react";

// ----------------------------------------------------------------------
// Filter definitions — render once at the top of the overlay tree, then
// reference by id from individual shots. SVG filters defined inside a
// hidden <svg> are shared across the page so cost is paid once.
// ----------------------------------------------------------------------

export function ApertureFilters() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        {/* Animated film grain. Source: feTurbulence with a high
            baseFrequency for fine-grain noise, animated via
            feTurbulence's seed attribute changed in JS for motion
            (browsers won't animate it via SMIL anymore). We render
            a tile and CSS-animate its position to fake motion
            instead — much cheaper. */}
        <filter id="ap-grain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.2"
            numOctaves="2"
            stitchTiles="stitch"
            seed="3"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0.05 0"
          />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>

        {/* Atmospheric haze — used by feMerge or composited as an
            overlay div with mix-blend-mode: screen. Just a soft
            blurred radial. */}
        <filter id="ap-soft-blur-12" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id="ap-soft-blur-6" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="ap-soft-blur-3" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>

        {/* Glow filter — for orb / moon / light sources. The
            standard "outer glow" approach. */}
        <filter id="ap-glow-warm" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" result="blur1" />
          <feFlood floodColor="#ff8030" floodOpacity="0.6" result="warm" />
          <feComposite in="warm" in2="blur1" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="ap-glow-cold" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="20" result="blur1" />
          <feFlood floodColor="#a0c8ff" floodOpacity="0.7" result="cold" />
          <feComposite in="cold" in2="blur1" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Shimmer / heat distortion — feTurbulence into
            feDisplacementMap. We expose a basis filter; shots can
            override the scale per-instance. */}
        <filter id="ap-shimmer" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.020"
            numOctaves="2"
            seed="7"
          />
          <feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Color-grade matrices — apply at the SHOT level so the
            entire scene reads color-corrected.
            Cool-magenta grade (Shot 4): pull greens down, lift
            blues + reds slightly, crush blacks. */}
        <filter id="ap-grade-coolmagenta" x="0%" y="0%" width="100%" height="100%">
          <feColorMatrix
            type="matrix"
            values="1.05 0   0   0   -0.02
                    0    0.85 0   0   -0.02
                    0.04 0   1.1 0   0
                    0    0   0   1   0"
          />
        </filter>
        {/* Warm-architectural grade (Shot 6): warm midtones, cool
            highlights, slight saturation lift. */}
        <filter id="ap-grade-archmoon" x="0%" y="0%" width="100%" height="100%">
          <feColorMatrix
            type="matrix"
            values="1.0  0.05 0    0   0
                    0    1.0  0.05 0   0
                    0.08 0    1.05 0   0
                    0    0    0    1   0"
          />
        </filter>
        {/* Twilight-blue grade (Shot 14): pull oranges in, push
            blues, soft contrast curve via slope-then-bias. */}
        <filter id="ap-grade-twilight" x="0%" y="0%" width="100%" height="100%">
          <feColorMatrix
            type="matrix"
            values="0.9  0   0.05 0   0
                    0    0.95 0.1 0   0
                    0.05 0   1.15 0   0.02
                    0    0   0    1   0"
          />
        </filter>

        {/* Vignette mask — radial alpha falloff. We composite this
            as a separate top-level overlay div in CSS rather than
            applying it via SVG, but it's here in case a shot wants
            to bake it into a single SVG group. */}
        <radialGradient id="ap-vignette" cx="50%" cy="50%" r="65%">
          <stop offset="60%" stopColor="black" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.85" />
        </radialGradient>

        {/* Moon surface noise — a low-res turbulence tinted to look
            like terrain shadow. Used by <LitMoon />. */}
        <filter id="ap-moon-surface" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="11" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.4
                    0 0 0 0 0.4
                    0 0 0 0 0.45
                    0 0 0 0.18 0"
          />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

// ----------------------------------------------------------------------
// <LitMoon /> — sphere with terminator line, rim light, surface noise.
//
// Renders an SVG circle with three layered radial gradients (lit,
// shadow, rim) plus a noise overlay. The viewBox is fixed so the
// caller controls size via the wrapping element.
// ----------------------------------------------------------------------

export interface LitMoonProps {
  /** 0..1 phase. 0 = fully lit (full moon), 0.5 = half, 1 = new
   *  (we never go that far in this app). Default 0.0 (full). */
  phase?: number;
  /** Color of the lit hemisphere. */
  litColor?: string;
  /** Color of the shadowed hemisphere. */
  shadowColor?: string;
  /** Color of the rim highlight (atmospheric refraction). */
  rimColor?: string;
  /** Atmospheric glow color around the moon. */
  glowColor?: string;
  /** Direction of light source — angle in degrees. 0 = light from
   *  the right, 90 = light from below. Default -30 (upper-right). */
  lightAngle?: number;
  /** Pixel size of the moon (its diameter). */
  size: number;
  /** When true, animate a faint surface drift / rim breathing.
   *  Costs nothing — just a CSS animation on the rim layer. */
  breathe?: boolean;
}

export function LitMoon({
  phase = 0,
  litColor = "#fff8e8",
  shadowColor = "#1a1820",
  rimColor = "#a0c0ff",
  glowColor = "#80a0ff",
  lightAngle = -30,
  size,
  breathe = true,
}: LitMoonProps) {
  // The terminator is drawn as an offset circle clipped to the
  // moon. We use an SVG mask: the lit area is a circle offset
  // toward the light; the shadow is the moon minus that mask.
  // For phase=0 (full moon), the lit circle covers everything and
  // there's no terminator.
  const offsetMag = 30 * phase; // % of moon radius the terminator is offset
  const lightX = Math.cos((lightAngle * Math.PI) / 180);
  const lightY = Math.sin((lightAngle * Math.PI) / 180);
  const dx = -lightX * offsetMag; // negative because shadow opposes light
  const dy = -lightY * offsetMag;

  const id = useId();
  const litId = `lit-${id}`;
  const shadowId = `shadow-${id}`;
  const rimId = `rim-${id}`;
  const glowId = `glow-${id}`;
  const noiseId = `noise-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        // Slight CSS breath cycle if requested
        animation: breathe ? `ap-moon-breathe 6.5s ease-in-out infinite` : undefined,
        overflow: "visible",
      }}
    >
      <defs>
        {/* Outer atmospheric glow — soft, large radial */}
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glowColor} stopOpacity="0.5" />
          <stop offset="40%" stopColor={glowColor} stopOpacity="0.15" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
        </radialGradient>

        {/* Lit hemisphere — radial gradient slightly offset toward
            the light source so shading reads dimensional */}
        <radialGradient
          id={litId}
          cx={`${50 + lightX * 25}%`}
          cy={`${50 + lightY * 25}%`}
          r="65%"
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="40%" stopColor={litColor} stopOpacity="1" />
          <stop offset="80%" stopColor={litColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor={shadowColor} stopOpacity="0.95" />
        </radialGradient>

        {/* Shadow hemisphere — darker radial, no white core */}
        <radialGradient id={shadowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={shadowColor} stopOpacity="0.95" />
          <stop offset="100%" stopColor={shadowColor} stopOpacity="1" />
        </radialGradient>

        {/* Rim highlight — thin atmospheric bright ring */}
        <radialGradient id={rimId} cx="50%" cy="50%" r="50%">
          <stop offset="92%" stopColor={rimColor} stopOpacity="0" />
          <stop offset="97%" stopColor={rimColor} stopOpacity="0.6" />
          <stop offset="100%" stopColor={rimColor} stopOpacity="0" />
        </radialGradient>

        {/* Surface noise mask — turbulence clipped to the moon
            disc, very low opacity so it reads as terrain not
            artifact */}
        <filter id={noiseId} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed={Math.floor(Math.random() * 100)} />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.4
                    0 0 0 0 0.4
                    0 0 0 0 0.45
                    0 0 0 0.22 0"
          />
        </filter>
      </defs>

      {/* Atmospheric glow — drawn outside the disc */}
      <circle cx="50" cy="50" r="80" fill={`url(#${glowId})`} />

      {/* Shadow base */}
      <circle cx="50" cy="50" r="42" fill={`url(#${shadowId})`} />

      {/* Lit hemisphere — drawn ABOVE shadow, offset by the
          terminator. With phase=0 this fully covers the disc. */}
      <circle cx={50 + dx} cy={50 + dy} r="42" fill={`url(#${litId})`} />

      {/* Surface noise (clipped to disc) */}
      <g style={{ mixBlendMode: "multiply" }}>
        <circle cx="50" cy="50" r="42" fill="white" filter={`url(#${noiseId})`} />
      </g>

      {/* Rim highlight (atmospheric refraction) */}
      <circle cx="50" cy="50" r="44" fill={`url(#${rimId})`} />

      <style>{`
        @keyframes ap-moon-breathe {
          0%, 100% { filter: brightness(1) drop-shadow(0 0 8px ${glowColor}); }
          50%      { filter: brightness(1.04) drop-shadow(0 0 14px ${glowColor}); }
        }
      `}</style>
    </svg>
  );
}

// ----------------------------------------------------------------------
// <RimLitSilhouette /> — a black silhouette with a colored rim
// highlight along the edge facing a light source. This is the thing
// I was getting most wrong: the source has actual rim light on her
// shoulder + hair from the orb. We fake it with a light-colored
// stroke inside a clipPath plus a screen-blended halo.
// ----------------------------------------------------------------------

export interface RimLitSilhouetteProps {
  /** SVG path data for the silhouette (filled). Origin at top-left
   *  of the viewBox. */
  pathD: string;
  /** SVG viewBox dimensions. */
  viewBoxW: number;
  viewBoxH: number;
  /** Color of the rim highlight. */
  rimColor: string;
  /** Direction of the light source as { x, y } unit vector. The rim
   *  appears on the edge facing this direction. */
  lightDir: { x: number; y: number };
  /** Strength of rim — 0..1, default 0.7. */
  rimStrength?: number;
  /** Optional bounce-light color (warm under-light). */
  bounceColor?: string;
  bounceStrength?: number;
}

export function RimLitSilhouette({
  pathD,
  viewBoxW,
  viewBoxH,
  rimColor,
  lightDir,
  rimStrength = 0.7,
  bounceColor,
  bounceStrength = 0.4,
}: RimLitSilhouetteProps) {
  const id = useId();
  const clipId = `rim-clip-${id}`;
  const rimGradId = `rim-grad-${id}`;
  const bounceGradId = `bounce-grad-${id}`;

  // Rim is drawn as a wide stroke clipped to the silhouette path
  // so only the inside edge facing the light shows. The light-side
  // gradient is positioned outside the silhouette so the gradient
  // lights the matching edge.
  const dx = lightDir.x;
  const dy = lightDir.y;
  // Gradient runs from light-source-direction (full alpha) to the
  // opposite edge (zero alpha).
  const gx1 = 50 - dx * 100; // far end
  const gy1 = 50 - dy * 100;
  const gx2 = 50 + dx * 100; // toward light
  const gy2 = 50 + dy * 100;

  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      width="100%"
      height="100%"
      style={{ overflow: "visible" }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={pathD} />
        </clipPath>
        <linearGradient
          id={rimGradId}
          x1={`${gx1}%`}
          y1={`${gy1}%`}
          x2={`${gx2}%`}
          y2={`${gy2}%`}
        >
          <stop offset="0%" stopColor={rimColor} stopOpacity="0" />
          <stop offset="80%" stopColor={rimColor} stopOpacity="0" />
          <stop offset="98%" stopColor={rimColor} stopOpacity={rimStrength} />
          <stop offset="100%" stopColor={rimColor} stopOpacity="0" />
        </linearGradient>
        {bounceColor && (
          <linearGradient
            id={bounceGradId}
            x1={`${gx2}%`}
            y1={`${gy2}%`}
            x2={`${gx1}%`}
            y2={`${gy1}%`}
          >
            <stop offset="0%" stopColor={bounceColor} stopOpacity={bounceStrength} />
            <stop offset="35%" stopColor={bounceColor} stopOpacity="0" />
          </linearGradient>
        )}
      </defs>

      {/* Black silhouette base */}
      <path d={pathD} fill="#000" />

      {/* Bounce light from the dark side (warm undertone bouncing
          back from environment toward the figure) */}
      {bounceColor && (
        <g clipPath={`url(#${clipId})`} style={{ mixBlendMode: "screen" }}>
          <rect width={viewBoxW} height={viewBoxH} fill={`url(#${bounceGradId})`} />
        </g>
      )}

      {/* Rim light — clipped to silhouette, blend-mode screen so
          it ADDS to the black */}
      <g clipPath={`url(#${clipId})`} style={{ mixBlendMode: "screen" }}>
        <rect width={viewBoxW} height={viewBoxH} fill={`url(#${rimGradId})`} />
      </g>

      {/* Subtle halo OUTSIDE the silhouette near the light edge —
          fakes light wrapping around the silhouette */}
      <g style={{ mixBlendMode: "screen", filter: "blur(4px)", opacity: 0.5 }}>
        <path d={pathD} fill="none" stroke={rimColor} strokeWidth="2" pathLength="100" />
      </g>
    </svg>
  );
}

// ----------------------------------------------------------------------
// <AtmosphericHaze /> — full-screen overlay of soft radial color
// that breathes slowly. Use as the FIRST or LAST layer of a shot to
// give the whole scene atmosphere.
// ----------------------------------------------------------------------

export interface AtmosphericHazeProps {
  /** CSS color string. */
  color: string;
  /** Opacity baseline 0..1. Default 0.25. */
  opacity?: number;
  /** Position of the haze focus in % of viewport. */
  cx?: string;
  cy?: string;
  /** Radius of the haze in vmin units. */
  radius?: number;
  /** Set true for the layer to drift slowly (recommended for "still"
   *  shots so they never freeze). */
  drift?: boolean;
  /** Layer z. Default 1 (between background and content). */
  z?: number;
}

export function AtmosphericHaze({
  color,
  opacity = 0.25,
  cx = "50%",
  cy = "50%",
  radius = 50,
  drift = true,
  z = 1,
}: AtmosphericHazeProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: "-10%",
        background: `radial-gradient(ellipse ${radius}vmin ${radius * 0.7}vmin at ${cx} ${cy}, ${color} 0%, transparent 70%)`,
        opacity,
        mixBlendMode: "screen",
        animation: drift ? "ap-haze-drift 14s ease-in-out infinite" : undefined,
        pointerEvents: "none",
        zIndex: z,
      }}
    />
  );
}

// ----------------------------------------------------------------------
// <FilmGrain /> — full-screen animated grain overlay. Cheap by
// design: a fixed turbulence-filtered SVG tile, CSS animation
// translates it to fake motion (much cheaper than re-rendering
// turbulence per frame).
// ----------------------------------------------------------------------

export function FilmGrain({ opacity = 0.06 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: "-5%",
        opacity,
        pointerEvents: "none",
        mixBlendMode: "overlay",
        backgroundImage:
          // Embedded SVG turbulence — generated once, reused.
          `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0'/></filter><rect width='200' height='200' filter='url(%23g)'/></svg>")`,
        backgroundSize: "200px 200px",
        animation: "ap-grain-shift 0.6s steps(8) infinite",
        zIndex: 50,
      }}
    />
  );
}

// ----------------------------------------------------------------------
// Tiny useId helper. We don't import React's useId so the component
// keeps backward compat with React 17 type expectations. SSR safe
// only because these are client-only.
// ----------------------------------------------------------------------
function useId(): string {
  const ref = useRef<string>("");
  if (!ref.current) {
    ref.current = Math.random().toString(36).slice(2, 10);
  }
  return ref.current;
}

// ----------------------------------------------------------------------
// Global keyframes — injected once. Side-effect-on-mount via a
// useEffect in the consumer module.
// ----------------------------------------------------------------------

const KEYFRAMES = `
@keyframes ap-grain-shift {
  0%   { transform: translate(0, 0); }
  10%  { transform: translate(-3%, -2%); }
  20%  { transform: translate(2%, 3%); }
  30%  { transform: translate(-2%, 1%); }
  40%  { transform: translate(3%, -1%); }
  50%  { transform: translate(-1%, 2%); }
  60%  { transform: translate(2%, -3%); }
  70%  { transform: translate(-3%, 2%); }
  80%  { transform: translate(1%, -2%); }
  90%  { transform: translate(-2%, -1%); }
  100% { transform: translate(0, 0); }
}
@keyframes ap-haze-drift {
  0%, 100% { transform: translate(0, 0) scale(1); opacity: var(--ap-haze-base, 0.25); }
  50%      { transform: translate(2%, -2%) scale(1.05); opacity: calc(var(--ap-haze-base, 0.25) * 1.2); }
}
@keyframes ap-orb-pulse {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50%      { transform: scale(1.04); filter: brightness(1.15); }
}
@keyframes ap-orb-flicker {
  0%, 92%, 100% { opacity: 1; }
  93%, 95%      { opacity: 0.85; }
  94%           { opacity: 0.95; }
}
@keyframes ap-godray-shift {
  0%, 100% { opacity: 0.55; transform: translateX(0); }
  50%      { opacity: 0.7;  transform: translateX(1.5%); }
}
@keyframes ap-camera-rise {
  from { transform: translateY(0); }
  to   { transform: translateY(-6%); }
}
`;

export function ApertureKeyframes() {
  // Ensure the keyframes block is in the document exactly once.
  // useState lazy-init runs on first render and never again.
  useState(() => {
    if (typeof document === "undefined") return null;
    const existing = document.getElementById("ap-keyframes");
    if (!existing) {
      const style = document.createElement("style");
      style.id = "ap-keyframes";
      style.textContent = KEYFRAMES;
      document.head.appendChild(style);
    }
    return null;
  });
  // Also add the cleanup-aware useEffect — but keyframes are
  // intentionally NOT cleaned up because other instances may rely
  // on them.
  useEffect(() => {}, []);
  return null;
}
