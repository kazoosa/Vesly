import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { themeForBroker } from "./spaceTheme";

// Re-export so callers that already import themeForBroker from this
// file keep working — the actual theme map lives in ./spaceTheme to
// avoid pulling three.js into the main dashboard bundle.
export { themeForBroker } from "./spaceTheme";
export type { BrokerTheme } from "./spaceTheme";

/**
 * Black-hole-with-accretion-disk scene. Modeled after the visual
 * energy of Geometry Dash level "Aperture" (chunlv1). The black hole
 * is the focal point of the entire scene — perfectly dark center
 * with a glowing accretion disk spiraling inward, twin polar jets,
 * inspiraling particle field, expanding ring ripples, foreground
 * geometric line drift, and a rhythm pulse driving brightness on
 * a 95-BPM heartbeat.
 *
 * Lazy-loaded by PostConnectSyncOverlay so the three.js + post-
 * processing bundle only ships when the overlay actually mounts.
 */

// --- Tunables -------------------------------------------------------
const STAR_COUNT_BG = 8000;
const NEBULA_COUNT = 11;
const ACCRETION_PARTICLES = 8000;
const INSPIRAL_PARTICLES = 3000;
const JET_PARTICLES = 1200; // 600 per pole
const FOREGROUND_LINES = 14;

const BLACK_HOLE_RADIUS = 1.2;
const ACCRETION_INNER = 1.6; // disk starts here
const ACCRETION_OUTER = 7.5;
const DISK_TILT = (20 * Math.PI) / 180;
const JET_LENGTH = 18;

const CAMERA_DIST_MIN = 5;
const CAMERA_DIST_MAX = 60;
const CAMERA_DIST_DEFAULT = 22;

// Rhythm: 95 BPM = ~1.58s per beat.
const BPM = 95;
const BEAT_HZ = BPM / 60;

// Hue cycle: 30s round trip, ±15° (so ±0.0417 in 0..1 hue space).
const HUE_CYCLE_SEC = 30;
const HUE_AMPLITUDE = 15 / 360;

// --- Programmatic textures (no asset deps) --------------------------
function makeStarTexture(size = 64): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeRadialGradientTexture(
  size: number,
  innerColor: string,
  outerColor: string,
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.4, innerColor);
  grad.addColorStop(1, outerColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRingTexture(size = 256): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // White ring with falloff at the edge.
  ctx.fillStyle = "rgba(255,255,255,0)";
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const r0 = size * 0.46;
  const grad = ctx.createRadialGradient(cx, cy, r0 * 0.85, cx, cy, r0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- Color helpers --------------------------------------------------
function hexToColor(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

// --- Custom shaders -------------------------------------------------

/**
 * Accretion disk vertex+fragment shaders.
 *
 * Each particle carries (radius, angle0, layer, intensity) in vertex
 * attributes. The vertex shader rotates each particle around the
 * disk normal using Keplerian angular velocity (∝ 1/√r), tilts the
 * disk on init (already baked into the position), and computes a
 * size that grows slightly as particles approach the inner edge.
 * The fragment shader applies a temperature gradient — blue-white
 * inside, orange-yellow mid, deep red outer fading to broker theme.
 */
const accretionVertex = `
  attribute float aRadius;
  attribute float aAngle0;
  attribute float aThickness;
  attribute float aIntensity;
  uniform float uTime;
  uniform float uPulse;
  uniform float uInnerR;
  uniform float uOuterR;
  uniform float uDiskTilt;
  uniform float uTidalBoost;
  varying float vRadial;
  varying float vIntensity;

  void main() {
    // Keplerian angular velocity ∝ 1/sqrt(r). Inner particles
    // race, outer ones crawl. A small tidal boost flares the
    // whole disk during the disruption event.
    float angVel = 0.55 / sqrt(max(aRadius, 0.4));
    angVel += uTidalBoost * 1.5;
    float angle = aAngle0 + uTime * angVel;

    // Position in the disk plane (xz before tilt).
    float x = aRadius * cos(angle);
    float z = aRadius * sin(angle);
    // Small vertical thickness so the disk has a bit of body.
    float y = aThickness;

    // Tilt disk by uDiskTilt around the X axis.
    float ct = cos(uDiskTilt);
    float st = sin(uDiskTilt);
    float yt = y * ct - z * st;
    float zt = y * st + z * ct;

    vec3 pos = vec3(x, yt, zt);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size: bigger inside (hotter), modulated by pulse.
    float radNorm = clamp((aRadius - uInnerR) / (uOuterR - uInnerR), 0.0, 1.0);
    float baseSize = mix(2.6, 1.0, radNorm);
    float sizeMod = 1.0 + uPulse * 0.25 + uTidalBoost * 1.2;
    gl_PointSize = baseSize * sizeMod * (300.0 / -mvPosition.z);

    vRadial = radNorm;
    vIntensity = aIntensity;
  }
`;

const accretionFragment = `
  uniform vec3 uInnerColor;   // blue-white hottest
  uniform vec3 uMidColor;     // orange-yellow
  uniform vec3 uOuterColor;   // broker theme outer edge
  uniform float uPulse;
  uniform float uTidalBoost;
  varying float vRadial;
  varying float vIntensity;

  void main() {
    // Round point with soft falloff.
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d) * vIntensity;

    // Two-stop gradient inner→mid (radNorm 0..0.5) and mid→outer
    // (radNorm 0.5..1).
    vec3 col;
    if (vRadial < 0.5) {
      col = mix(uInnerColor, uMidColor, vRadial * 2.0);
    } else {
      col = mix(uMidColor, uOuterColor, (vRadial - 0.5) * 2.0);
    }

    // Pulse modulates brightness on a heartbeat. Tidal disruption
    // briefly washes the whole disk to white.
    float brightness = 1.0 + uPulse * 0.35 + uTidalBoost * 2.5;
    col *= brightness;
    col = mix(col, vec3(1.0), uTidalBoost * 0.6);

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

/**
 * Inspiraling particle field shader.
 *
 * Each particle has (radius, angle0, height, lifetime). Over time
 * they spiral inward on a logarithmic curve — angle increases AND
 * radius shrinks. When radius < event horizon, particle respawns
 * at the outer edge with a fresh random angle.
 */
const inspiralVertex = `
  attribute float aRadius;
  attribute float aAngle0;
  attribute float aHeight;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPulse;
  uniform float uTidalBoost;
  uniform float uOuterR;
  uniform float uInnerR;
  varying float vT;

  void main() {
    // Log-spiral: r(t) = outer * exp(-k * (t + phase) mod cycle)
    // Cycle period 12s, k chosen so outer→inner over one cycle.
    float cycle = 12.0;
    float k = log(uOuterR / uInnerR) / cycle;
    float lifetime = mod(uTime + aPhase, cycle);
    float r = uOuterR * exp(-k * lifetime);

    // Angular velocity inversely proportional to radius (matter speeds
    // up as it falls). Keplerian-ish.
    float omega = 0.4 / max(r * 0.4, 0.5);
    float angle = aAngle0 + uTime * omega + uTidalBoost * 4.0;

    // Particles drift slightly out of plane based on aHeight,
    // squashed toward zero as they fall in (everything ends up in
    // the disk plane near the event horizon).
    float h = aHeight * (r / uOuterR) * (r / uOuterR);

    vec3 pos = vec3(r * cos(angle), h, r * sin(angle));
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float t = clamp(1.0 - (r - uInnerR) / (uOuterR - uInnerR), 0.0, 1.0);
    vT = t;

    // Size grows toward center.
    float baseSize = mix(1.5, 4.0, t);
    gl_PointSize = baseSize * (1.0 + uPulse * 0.15 + uTidalBoost * 0.8) * (260.0 / -mvPosition.z);
  }
`;

const inspiralFragment = `
  uniform vec3 uOuterColor;
  uniform vec3 uInnerColor;
  uniform float uTidalBoost;
  varying float vT;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d);

    vec3 col = mix(uOuterColor, uInnerColor, pow(vT, 1.5));
    col *= 1.0 + uTidalBoost * 1.5;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

/**
 * Jet shader. Particles fly along ±Y from origin, fading by lifetime.
 */
const jetVertex = `
  attribute float aPhase;
  attribute float aOffset;     // 0..1, position along jet at t=0
  attribute float aLateral;    // small random transverse offset radius
  attribute float aLatAngle;   // angle for the lateral offset
  attribute float aSign;       // +1 top jet, -1 bottom jet
  uniform float uTime;
  uniform float uLength;
  uniform float uPulse;
  uniform float uTidalBoost;
  uniform float uDiskTilt;
  varying float vLife;

  void main() {
    float speed = 1.0 + uTidalBoost * 2.0;
    float lifetime = mod((uTime * speed * 0.18) + aPhase, 1.0);
    float life = mod(aOffset + lifetime, 1.0);
    float distAlong = life * uLength;

    // Tightening cone — wider at base, narrower toward tip.
    float tighten = 1.0 - life * 0.65;
    float lat = aLateral * tighten * (1.0 + uTidalBoost * 1.0);

    // Jet local frame: along ±Y, with the disk-tilt applied (jets
    // are perpendicular to the disk).
    float y = distAlong * aSign;
    float x = lat * cos(aLatAngle);
    float z = lat * sin(aLatAngle);

    // Apply same tilt as the disk so jets stay perpendicular.
    float ct = cos(uDiskTilt);
    float st = sin(uDiskTilt);
    float yt = y * ct - z * st;
    float zt = y * st + z * ct;

    vec3 pos = vec3(x, yt, zt);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Fade in fast, fade out toward the end.
    vLife = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.6, 1.0, life));

    float baseSize = mix(3.0, 1.2, life);
    gl_PointSize = baseSize * (1.0 + uPulse * 0.2 + uTidalBoost * 1.5) * (220.0 / -mvPosition.z);
  }
`;

const jetFragment = `
  uniform vec3 uJetColor;
  uniform float uTidalBoost;
  varying float vLife;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * vLife;
    vec3 col = mix(uJetColor, vec3(1.0), 0.4) * (1.0 + uTidalBoost * 1.0);
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * Cheap fake gravitational lensing shell. Uses Fresnel + procedural
 * radial distortion in the fragment shader to give the impression of
 * stars curving around the black hole edge — no actual screen-space
 * displacement (which would cost a full extra render pass).
 */
const lensVertex = `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const lensFragment = `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform float uTime;
  uniform float uPulse;
  uniform vec3 uTint;
  void main() {
    vec3 viewDir = normalize(vViewPos);
    float fresnel = 1.0 - max(dot(viewDir, normalize(vNormal)), 0.0);
    float ring = pow(fresnel, 4.0);
    // Subtle shimmer — phase across angle, not strong, just enough
    // to suggest distortion at the edge.
    float shimmer = 0.85 + 0.15 * sin(uTime * 2.0 + atan(vNormal.y, vNormal.x) * 6.0);
    float a = ring * shimmer * (0.55 + uPulse * 0.15);
    vec3 col = mix(uTint, vec3(1.0), ring);
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * Vignette pass — final composition step. Subtle radial darkening
 * focuses the eye on the black hole at center.
 */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0.55 },
    tidalBoost: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float tidalBoost;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 toCenter = vUv - 0.5;
      float dist = length(toCenter);
      // Smooth darken at edges.
      float vignette = smoothstep(0.85, 0.35, dist);
      float v = mix(1.0, vignette, strength);
      col *= v;
      // Tidal flash bumps overall brightness briefly.
      col *= 1.0 + tidalBoost * 0.5;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// --- Component ------------------------------------------------------

export interface SpaceSceneProps {
  brokerName?: string | null;
  audioEnabled?: boolean;
}

export function SpaceScene({ brokerName, audioEnabled = true }: SpaceSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  const themeRef = useRef(themeForBroker(brokerName));
  themeRef.current = themeForBroker(brokerName);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const theme = themeRef.current;

    const W = () => container.clientWidth;
    const H = () => container.clientHeight;

    // ---- Renderer + composer ----------------------------------------
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), H());
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Orbital camera — the user always looks AT the black hole. Drag
    // rotates the camera around the origin; scroll moves it closer/
    // farther. We track yaw/pitch + radius and recompute every frame.
    const camera = new THREE.PerspectiveCamera(60, W() / H(), 0.1, 2000);
    let camYaw = 0.4;
    let camPitch = 0.18;
    let camRadius = CAMERA_DIST_DEFAULT;
    let camRadiusTarget = CAMERA_DIST_DEFAULT;

    const composer = new EffectComposer(renderer);
    composer.setSize(W(), H());
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(W(), H()),
      1.5, // strength
      1.0, // radius
      0.05, // threshold
    );
    composer.addPass(bloomPass);
    const vignettePass = new ShaderPass(VignetteShader);
    composer.addPass(vignettePass);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // ---- Black hole core --------------------------------------------
    //
    // Two meshes:
    //  * Solid black sphere with MeshBasicMaterial. Below the bloom
    //    threshold (0.05) so it doesn't bloom — but more importantly,
    //    we render the black hole AFTER bloom by drawing it on a
    //    separate render group whose render order puts it last.
    //  * A slightly-larger transparent shell with the lensing shader
    //    that draws a Fresnel ring at the silhouette edge.
    //
    // The "black hole stays dark even with aggressive bloom" trick:
    // we use renderOrder + depthWrite tricks. The black hole renders
    // first to write its depth, then opaque content (including the
    // disk) renders behind it (because we only see disk pixels where
    // depth allows them). Bloom samples the rendered pixels — and
    // since the black hole pixels are pure black (luminance 0), they
    // contribute nothing to the bloom buffer. Stars BEHIND the black
    // hole are occluded by the depth pass. Net effect: dark center,
    // glowing rim from the lensing shader, no bloom leakage.
    const blackHoleGeo = new THREE.SphereGeometry(BLACK_HOLE_RADIUS, 64, 64);
    const blackHoleMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
    });
    const blackHole = new THREE.Mesh(blackHoleGeo, blackHoleMat);
    blackHole.renderOrder = 10;
    scene.add(blackHole);

    const lensGeo = new THREE.SphereGeometry(BLACK_HOLE_RADIUS * 1.45, 48, 48);
    const lensMat = new THREE.ShaderMaterial({
      vertexShader: lensVertex,
      fragmentShader: lensFragment,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uTint: { value: new THREE.Color(theme.diskOuterColor) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const lensShell = new THREE.Mesh(lensGeo, lensMat);
    lensShell.renderOrder = 9;
    scene.add(lensShell);

    // ---- Accretion disk (shader-driven Points) ---------------------
    const diskPositions = new Float32Array(ACCRETION_PARTICLES * 3);
    const diskRadii = new Float32Array(ACCRETION_PARTICLES);
    const diskAngles = new Float32Array(ACCRETION_PARTICLES);
    const diskThicknesses = new Float32Array(ACCRETION_PARTICLES);
    const diskIntensities = new Float32Array(ACCRETION_PARTICLES);
    for (let i = 0; i < ACCRETION_PARTICLES; i++) {
      // Bias particles toward inner radii (1/r distribution).
      const u = Math.random();
      const r = ACCRETION_INNER + (ACCRETION_OUTER - ACCRETION_INNER) * Math.pow(u, 1.4);
      diskRadii[i] = r;
      diskAngles[i] = Math.random() * Math.PI * 2;
      // Thickness scales with radius — a tiny bit puffier outside.
      diskThicknesses[i] = (Math.random() - 0.5) * 0.12 * (r / ACCRETION_OUTER + 0.3);
      diskIntensities[i] = 0.6 + Math.random() * 0.6;
      // Position is recomputed in the vertex shader; placeholder.
      diskPositions[i * 3] = 0;
      diskPositions[i * 3 + 1] = 0;
      diskPositions[i * 3 + 2] = 0;
    }
    const diskGeo = new THREE.BufferGeometry();
    diskGeo.setAttribute("position", new THREE.BufferAttribute(diskPositions, 3));
    diskGeo.setAttribute("aRadius", new THREE.BufferAttribute(diskRadii, 1));
    diskGeo.setAttribute("aAngle0", new THREE.BufferAttribute(diskAngles, 1));
    diskGeo.setAttribute("aThickness", new THREE.BufferAttribute(diskThicknesses, 1));
    diskGeo.setAttribute("aIntensity", new THREE.BufferAttribute(diskIntensities, 1));
    // Bounding sphere is required since shaders move geometry off-origin.
    diskGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), ACCRETION_OUTER * 1.5);

    const diskMat = new THREE.ShaderMaterial({
      vertexShader: accretionVertex,
      fragmentShader: accretionFragment,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uInnerR: { value: ACCRETION_INNER },
        uOuterR: { value: ACCRETION_OUTER },
        uDiskTilt: { value: DISK_TILT },
        uTidalBoost: { value: 0 },
        uInnerColor: { value: new THREE.Color(0xa0d8ff) }, // blue-white
        uMidColor: { value: new THREE.Color(0xffaa40) },   // orange-yellow
        uOuterColor: { value: new THREE.Color(theme.diskOuterColor) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const accretion = new THREE.Points(diskGeo, diskMat);
    scene.add(accretion);

    // ---- Inspiraling particle field --------------------------------
    const inPositions = new Float32Array(INSPIRAL_PARTICLES * 3);
    const inRadii = new Float32Array(INSPIRAL_PARTICLES);
    const inAngles = new Float32Array(INSPIRAL_PARTICLES);
    const inHeights = new Float32Array(INSPIRAL_PARTICLES);
    const inPhases = new Float32Array(INSPIRAL_PARTICLES);
    for (let i = 0; i < INSPIRAL_PARTICLES; i++) {
      inRadii[i] = ACCRETION_INNER + Math.random() * (ACCRETION_OUTER * 1.5);
      inAngles[i] = Math.random() * Math.PI * 2;
      inHeights[i] = (Math.random() - 0.5) * 4;
      inPhases[i] = Math.random() * 12;
      inPositions[i * 3] = 0;
      inPositions[i * 3 + 1] = 0;
      inPositions[i * 3 + 2] = 0;
    }
    const inGeo = new THREE.BufferGeometry();
    inGeo.setAttribute("position", new THREE.BufferAttribute(inPositions, 3));
    inGeo.setAttribute("aRadius", new THREE.BufferAttribute(inRadii, 1));
    inGeo.setAttribute("aAngle0", new THREE.BufferAttribute(inAngles, 1));
    inGeo.setAttribute("aHeight", new THREE.BufferAttribute(inHeights, 1));
    inGeo.setAttribute("aPhase", new THREE.BufferAttribute(inPhases, 1));
    inGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), ACCRETION_OUTER * 2);
    const inMat = new THREE.ShaderMaterial({
      vertexShader: inspiralVertex,
      fragmentShader: inspiralFragment,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uTidalBoost: { value: 0 },
        uOuterR: { value: ACCRETION_OUTER * 1.5 },
        uInnerR: { value: ACCRETION_INNER },
        uOuterColor: { value: new THREE.Color(theme.diskOuterColor) },
        uInnerColor: { value: new THREE.Color(0xffffff) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const inspiral = new THREE.Points(inGeo, inMat);
    scene.add(inspiral);

    // ---- Polar jets -------------------------------------------------
    const jetPositions = new Float32Array(JET_PARTICLES * 3);
    const jetPhases = new Float32Array(JET_PARTICLES);
    const jetOffsets = new Float32Array(JET_PARTICLES);
    const jetLaterals = new Float32Array(JET_PARTICLES);
    const jetLatAngles = new Float32Array(JET_PARTICLES);
    const jetSigns = new Float32Array(JET_PARTICLES);
    for (let i = 0; i < JET_PARTICLES; i++) {
      jetPhases[i] = Math.random();
      jetOffsets[i] = Math.random();
      jetLaterals[i] = Math.random() * 0.5; // narrow cone
      jetLatAngles[i] = Math.random() * Math.PI * 2;
      jetSigns[i] = i < JET_PARTICLES / 2 ? 1 : -1;
    }
    const jetGeo = new THREE.BufferGeometry();
    jetGeo.setAttribute("position", new THREE.BufferAttribute(jetPositions, 3));
    jetGeo.setAttribute("aPhase", new THREE.BufferAttribute(jetPhases, 1));
    jetGeo.setAttribute("aOffset", new THREE.BufferAttribute(jetOffsets, 1));
    jetGeo.setAttribute("aLateral", new THREE.BufferAttribute(jetLaterals, 1));
    jetGeo.setAttribute("aLatAngle", new THREE.BufferAttribute(jetLatAngles, 1));
    jetGeo.setAttribute("aSign", new THREE.BufferAttribute(jetSigns, 1));
    jetGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), JET_LENGTH * 1.2);
    const jetMat = new THREE.ShaderMaterial({
      vertexShader: jetVertex,
      fragmentShader: jetFragment,
      uniforms: {
        uTime: { value: 0 },
        uLength: { value: JET_LENGTH },
        uPulse: { value: 0 },
        uTidalBoost: { value: 0 },
        uDiskTilt: { value: DISK_TILT },
        uJetColor: { value: new THREE.Color(theme.jetColor) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const jets = new THREE.Points(jetGeo, jetMat);
    scene.add(jets);

    // ---- Background star field --------------------------------------
    const starTextureWhite = makeStarTexture(64);
    const bgPositions = new Float32Array(STAR_COUNT_BG * 3);
    for (let i = 0; i < STAR_COUNT_BG; i++) {
      const r = 200 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      bgPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      bgPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      bgPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const bgStarsGeo = new THREE.BufferGeometry();
    bgStarsGeo.setAttribute("position", new THREE.BufferAttribute(bgPositions, 3));
    const bgStarsMat = new THREE.PointsMaterial({
      size: 0.7,
      sizeAttenuation: true,
      color: theme.starTint,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: starTextureWhite,
    });
    const bgStars = new THREE.Points(bgStarsGeo, bgStarsMat);
    scene.add(bgStars);

    // ---- Background nebulas (deep, subtle) -------------------------
    const nebulaTextures: THREE.Texture[] = [];
    const nebulaMaterials: THREE.SpriteMaterial[] = [];
    const nebulas: Array<{
      sprite: THREE.Sprite;
      baseHue: number;
      baseSat: number;
      baseLight: number;
    }> = [];
    for (let i = 0; i < NEBULA_COUNT; i++) {
      const colorHex = theme.nebulaColors[i % theme.nebulaColors.length]!;
      const fadeColor = colorHex + "00";
      const tex = makeRadialGradientTexture(256, colorHex + "ff", fadeColor);
      nebulaTextures.push(tex);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.18 + Math.random() * 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      nebulaMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      const r = 90 + Math.random() * 220;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      sprite.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      const scale = 80 + Math.random() * 140;
      sprite.scale.set(scale, scale, 1);
      scene.add(sprite);
      const hsl = { h: 0, s: 0, l: 0 };
      new THREE.Color(colorHex).getHSL(hsl);
      nebulas.push({
        sprite,
        baseHue: hsl.h,
        baseSat: hsl.s,
        baseLight: hsl.l,
      });
    }

    // ---- Expanding ring ripples ------------------------------------
    const ringTexture = makeRingTexture(256);
    const rings: Array<{
      mesh: THREE.Mesh;
      geo: THREE.RingGeometry;
      mat: THREE.MeshBasicMaterial;
      age: number;
      duration: number;
      maxScale: number;
    }> = [];
    function spawnRing() {
      // Thin glowing ring spawns at the event horizon and expands.
      // RingGeometry parameters: (innerRadius, outerRadius, segments).
      // We use a very thin annulus and rely on a glow texture for
      // the soft edge.
      const inner = BLACK_HOLE_RADIUS * 1.05;
      const outer = inner * 1.04;
      const geo = new THREE.RingGeometry(inner, outer, 96);
      const mat = new THREE.MeshBasicMaterial({
        color: theme.ringColor,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        map: ringTexture,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // Tilt the ring to match the disk plane.
      mesh.rotation.x = Math.PI / 2 - DISK_TILT;
      scene.add(mesh);
      rings.push({
        mesh,
        geo,
        mat,
        age: 0,
        duration: 4.5,
        maxScale: 14,
      });
    }

    // ---- Foreground geometric line drift ---------------------------
    //
    // Thin glowing lines and triangles in the extreme foreground —
    // they drift past the camera. Built from BufferGeometry line
    // segments with low opacity. They're not on a plane facing the
    // camera; they're real 3D line segments at z near the camera so
    // parallax shows them moving past faster than anything else.
    const fgLines: Array<{
      mesh: THREE.LineSegments;
      geo: THREE.BufferGeometry;
      mat: THREE.LineBasicMaterial;
      driftZ: number;
      basePos: THREE.Vector3;
    }> = [];
    for (let i = 0; i < FOREGROUND_LINES; i++) {
      // Build a small geometric shape — either a horizontal line, a
      // vertical line, or a triangle outline. Mix gives an HUD-like
      // feel.
      const positions: number[] = [];
      const shapeRoll = Math.random();
      if (shapeRoll < 0.5) {
        // Horizontal short line.
        const len = 0.4 + Math.random() * 1.2;
        positions.push(-len / 2, 0, 0, len / 2, 0, 0);
      } else if (shapeRoll < 0.8) {
        // Vertical short line.
        const len = 0.3 + Math.random() * 0.9;
        positions.push(0, -len / 2, 0, 0, len / 2, 0);
      } else {
        // Triangle outline.
        const r = 0.4 + Math.random() * 0.6;
        const a = Math.random() * Math.PI * 2;
        const p0 = [r * Math.cos(a), r * Math.sin(a), 0];
        const p1 = [r * Math.cos(a + (Math.PI * 2) / 3), r * Math.sin(a + (Math.PI * 2) / 3), 0];
        const p2 = [r * Math.cos(a + (Math.PI * 4) / 3), r * Math.sin(a + (Math.PI * 4) / 3), 0];
        positions.push(...p0, ...p1, ...p1, ...p2, ...p2, ...p0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: theme.foregroundLineColor,
        transparent: true,
        opacity: 0.32 + Math.random() * 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.LineSegments(geo, mat);
      // Place near the camera's initial Z but laterally offscreen so
      // it drifts in. Different starting Zs = parallax depth.
      const startX = (Math.random() - 0.5) * 30;
      const startY = (Math.random() - 0.5) * 18;
      const startZ = 6 + Math.random() * 14;
      const basePos = new THREE.Vector3(startX, startY, startZ);
      mesh.position.copy(basePos);
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      // Drift speed varies — closer ones (smaller basePos.z) move
      // slightly faster for parallax.
      const driftZ = 0.4 + (15 - basePos.z) * 0.08 + Math.random() * 0.3;
      scene.add(mesh);
      fgLines.push({ mesh, geo, mat, driftZ, basePos });
    }

    // ---- Tidal disruption shockwave ring ---------------------------
    const shockwaveTex = makeRingTexture(256);
    let tidalRing: {
      mesh: THREE.Mesh;
      geo: THREE.RingGeometry;
      mat: THREE.MeshBasicMaterial;
      age: number;
    } | null = null;
    function spawnShockwave() {
      const inner = BLACK_HOLE_RADIUS * 1.1;
      const outer = inner * 1.06;
      const geo = new THREE.RingGeometry(inner, outer, 128);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        map: shockwaveTex,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2 - DISK_TILT;
      scene.add(mesh);
      tidalRing = { mesh, geo, mat, age: 0 };
    }

    // ---- One-shot click burst (screen-space approximation) ---------
    //
    // Per spec we use a screen-space approximation: any click counts
    // as a particle-cluster hit. We spawn a small expanding burst
    // of ~80 particles at the world position derived from un-
    // projecting the click into the disk plane.
    const burstStates: Array<{
      points: THREE.Points;
      geo: THREE.BufferGeometry;
      mat: THREE.PointsMaterial;
      velocities: Float32Array;
      positions: Float32Array;
      count: number;
      age: number;
      duration: number;
    }> = [];
    function spawnClickBurst(worldPos: THREE.Vector3) {
      const count = 80;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = worldPos.x;
        positions[i * 3 + 1] = worldPos.y;
        positions[i * 3 + 2] = worldPos.z;
        // Random outward velocity.
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).normalize().multiplyScalar(2 + Math.random() * 4);
        velocities[i * 3] = dir.x;
        velocities[i * 3 + 1] = dir.y;
        velocities[i * 3 + 2] = dir.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: 3.5,
        sizeAttenuation: true,
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: starTextureWhite,
      });
      const points = new THREE.Points(geo, mat);
      scene.add(points);
      burstStates.push({
        points,
        geo,
        mat,
        velocities,
        positions,
        count,
        age: 0,
        duration: 1.0,
      });
    }

    // ---- Web Audio --------------------------------------------------
    let audioCtx: AudioContext | null = null;
    let masterGain: GainNode | null = null;
    let oscDrone: OscillatorNode | null = null;
    let oscMid: OscillatorNode | null = null;
    let oscShimmer: OscillatorNode | null = null;
    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    try {
      const Ctx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audioCtx = new Ctx();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0;
        masterGain.connect(audioCtx.destination);

        // 40Hz black hole drone.
        oscDrone = audioCtx.createOscillator();
        oscDrone.type = "sine";
        oscDrone.frequency.value = 40;
        const droneGain = audioCtx.createGain();
        droneGain.gain.value = 0.8;
        oscDrone.connect(droneGain);
        droneGain.connect(masterGain);

        // 90Hz mid resonance with slow LFO.
        oscMid = audioCtx.createOscillator();
        oscMid.type = "sine";
        oscMid.frequency.value = 90;
        const midGain = audioCtx.createGain();
        midGain.gain.value = 0.5;
        oscMid.connect(midGain);
        midGain.connect(masterGain);
        lfo = audioCtx.createOscillator();
        lfo.frequency.value = 0.05;
        lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 0.4; // modulates midGain depth
        lfo.connect(lfoGain);
        lfoGain.connect(midGain.gain);

        // 600Hz jet shimmer.
        oscShimmer = audioCtx.createOscillator();
        oscShimmer.type = "sine";
        oscShimmer.frequency.value = 600;
        const shimmerGain = audioCtx.createGain();
        shimmerGain.gain.value = 0.4;
        oscShimmer.connect(shimmerGain);
        shimmerGain.connect(masterGain);

        oscDrone.start();
        oscMid.start();
        oscShimmer.start();
        lfo.start();
        audioCtx.resume().catch(() => {});

        const tStart = audioCtx.currentTime;
        masterGain.gain.setValueAtTime(0, tStart);
        masterGain.gain.linearRampToValueAtTime(0.05, tStart + 2);
      }
    } catch {
      /* audio init failed — scene works silently */
    }

    function spawnThumpAudio() {
      if (!audioCtx) return;
      try {
        const ctx = audioCtx;
        // White noise buffer, 0.5s.
        const len = Math.floor(ctx.sampleRate * 1.5);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() - 0.5) * 2;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        // Lowpass filter at 80Hz.
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 80;
        filter.Q.value = 5;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime;
        gain.gain.linearRampToValueAtTime(0.6, t + 0.3);
        gain.gain.linearRampToValueAtTime(0, t + 1.8);
        src.start(t);
        src.stop(t + 2.0);
      } catch {
        /* best-effort */
      }
    }

    // ---- Interaction state -----------------------------------------
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    const lookVelocity = new THREE.Vector2(0, 0);

    /** Tidal disruption seconds remaining (0 = inactive). */
    let tidalRemaining = 0;
    const TIDAL_DURATION = 2.0;

    // Drag threshold: if pointer moves > 4px between down and up,
    // we count it as a drag (no click). Otherwise it's a click and
    // we spawn a burst.
    let pointerDownX = 0;
    let pointerDownY = 0;

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(e.pointerId);
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      camYaw -= dx * 0.005;
      camPitch -= dy * 0.005;
      // Clamp pitch so we never gimbal-flip.
      camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camPitch));
      lookVelocity.set(-dx * 0.005 * 60, -dy * 0.005 * 60);
    }
    function onPointerUp(e: PointerEvent) {
      const dx = e.clientX - pointerDownX;
      const dy = e.clientY - pointerDownY;
      const moved = Math.hypot(dx, dy) > 4;
      dragging = false;
      renderer.domElement.style.cursor = "grab";
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* ok */
      }
      if (!moved) {
        // Click — spawn burst at the un-projected click position
        // mapped to the disk plane (y = 0 after disk tilt).
        const rect = renderer.domElement.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const ndc = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
        const dir = ndc.sub(camera.position).normalize();
        // Intersect with the y=0 plane (disk plane after tilt — close
        // enough for screen-space approximation).
        const t = -camera.position.y / dir.y;
        if (t > 0 && Number.isFinite(t)) {
          const worldPos = camera.position.clone().addScaledVector(dir, t);
          // Clamp to a reasonable region around the disk so clicks
          // off in space still feel like they originated from the
          // disk.
          worldPos.clampLength(0, ACCRETION_OUTER * 1.5);
          spawnClickBurst(worldPos);
        }
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      camRadiusTarget = Math.max(
        CAMERA_DIST_MIN,
        Math.min(CAMERA_DIST_MAX, camRadiusTarget + e.deltaY * 0.015),
      );
    }
    function onDoubleClick() {
      if (tidalRemaining > 0) return;
      tidalRemaining = TIDAL_DURATION;
      spawnShockwave();
      spawnThumpAudio();
      // Burst all the burst-style particles in a sphere around the
      // black hole.
      for (let i = 0; i < 8; i++) {
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).normalize().multiplyScalar(ACCRETION_OUTER * 0.7);
        spawnClickBurst(dir);
      }
    }

    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("dblclick", onDoubleClick);

    function onResize() {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      composer.setSize(W(), H());
      bloomPass.setSize(W(), H());
    }
    window.addEventListener("resize", onResize);

    // ---- Animation loop --------------------------------------------
    const clock = new THREE.Clock();
    let elapsed = 0;
    let nextRingAt = 2.5;
    let rafHandle = 0;
    let cancelled = false;
    let slowFrames = 0;
    let degraded = false;

    // Pre-allocate workspace.
    const tmpHsl = { h: 0, s: 0, l: 0 };
    const tmpColor = new THREE.Color();

    function tick() {
      if (cancelled) return;
      if (document.hidden) {
        rafHandle = requestAnimationFrame(tick);
        return;
      }
      const frameStart = performance.now();
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      // ---- Audio gain follows mute state. -------------------------
      if (audioCtx && masterGain) {
        const target = audioEnabledRef.current ? 0.05 : 0;
        if (Math.abs(masterGain.gain.value - target) > 0.001) {
          masterGain.gain.linearRampToValueAtTime(target, audioCtx.currentTime + 0.2);
        }
      }

      // ---- Rhythm pulse (95 BPM heartbeat) ------------------------
      // Sine on BEAT_HZ, then squared so it has a sharper attack and
      // mellower trough — reads as a beat, not a smooth wave.
      const pulseRaw = Math.sin(elapsed * BEAT_HZ * 2 * Math.PI);
      const pulse = pulseRaw > 0 ? Math.pow(pulseRaw, 2) : 0;

      // ---- Tidal disruption envelope ------------------------------
      let tidalBoost = 0;
      if (tidalRemaining > 0) {
        const phase = TIDAL_DURATION - tidalRemaining;
        if (phase < 0.3) tidalBoost = phase / 0.3;
        else if (phase < 1.4) tidalBoost = 1;
        else tidalBoost = Math.max(0, 1 - (phase - 1.4) / 0.6);
        tidalRemaining -= dt;
      }

      // ---- Update shader uniforms ---------------------------------
      diskMat.uniforms.uTime.value = elapsed;
      diskMat.uniforms.uPulse.value = pulse;
      diskMat.uniforms.uTidalBoost.value = tidalBoost;

      inMat.uniforms.uTime.value = elapsed;
      inMat.uniforms.uPulse.value = pulse;
      inMat.uniforms.uTidalBoost.value = tidalBoost;

      jetMat.uniforms.uTime.value = elapsed;
      jetMat.uniforms.uPulse.value = pulse;
      jetMat.uniforms.uTidalBoost.value = tidalBoost;

      lensMat.uniforms.uTime.value = elapsed;
      lensMat.uniforms.uPulse.value = pulse;

      vignettePass.uniforms.tidalBoost.value = tidalBoost;

      // ---- Hue shift on nebulas (30s round trip, ±15°) ------------
      const hueOffset =
        Math.sin((elapsed / HUE_CYCLE_SEC) * Math.PI * 2) * HUE_AMPLITUDE;
      for (const n of nebulas) {
        tmpColor.setHSL(
          (n.baseHue + hueOffset + 1) % 1,
          n.baseSat,
          n.baseLight,
        );
        n.sprite.material.color.copy(tmpColor);
      }

      // ---- Camera (orbital) ---------------------------------------
      // Smooth zoom toward target.
      camRadius += (camRadiusTarget - camRadius) * 0.08;

      // Look-around inertia after release.
      if (!dragging) {
        camYaw += lookVelocity.x * dt * 0.3;
        camPitch += lookVelocity.y * dt * 0.3;
        camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camPitch));
        lookVelocity.multiplyScalar(0.93);
      }

      // Tidal shake adds noise to camera position briefly.
      const shakeAmt = tidalBoost * 0.15;
      camera.position.set(
        camRadius * Math.cos(camPitch) * Math.cos(camYaw) + (Math.random() - 0.5) * shakeAmt,
        camRadius * Math.sin(camPitch) + (Math.random() - 0.5) * shakeAmt,
        camRadius * Math.cos(camPitch) * Math.sin(camYaw) + (Math.random() - 0.5) * shakeAmt,
      );
      camera.lookAt(0, 0, 0);
      tmpHsl; // (silence unused-var if any)

      // ---- Foreground line drift ----------------------------------
      // Lines drift in +Z (toward and past the camera). When they
      // pass the camera plane (z > camera-relative threshold) they
      // reset to the far end of the foreground volume so it loops.
      // Camera is orbital so "past camera" = projection toward the
      // camera position.
      const camPos = camera.position;
      const camToCenter = camPos.clone().normalize().negate();
      for (const fg of fgLines) {
        // Move the line toward the camera by drifting in the
        // -camToCenter direction (i.e. AWAY from origin, toward
        // where the camera is).
        fg.mesh.position.addScaledVector(camToCenter.clone().negate(), fg.driftZ * dt);
        fg.mesh.rotation.x += dt * 0.05;
        fg.mesh.rotation.y += dt * 0.07;
        // When too close to camera, recycle to the far side relative
        // to the camera direction.
        const distToCam = fg.mesh.position.distanceTo(camPos);
        if (distToCam < 1.5) {
          // Reset to a fresh foreground position. We pick a point
          // 14-22 units toward the origin from the camera.
          const reset = camPos.clone().addScaledVector(camToCenter, 14 + Math.random() * 8);
          // Plus lateral jitter.
          reset.x += (Math.random() - 0.5) * 12;
          reset.y += (Math.random() - 0.5) * 8;
          fg.mesh.position.copy(reset);
          fg.basePos.copy(reset);
        }
      }

      // ---- Ring ripple spawn + update -----------------------------
      if (elapsed >= nextRingAt) {
        spawnRing();
        nextRingAt = elapsed + 3 + Math.random();
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]!;
        r.age += dt;
        const t = r.age / r.duration;
        if (t >= 1) {
          scene.remove(r.mesh);
          r.geo.dispose();
          r.mat.dispose();
          rings.splice(i, 1);
          continue;
        }
        const scale = 1 + t * r.maxScale;
        r.mesh.scale.set(scale, scale, 1);
        r.mat.opacity = (1 - t) * 0.8;
      }

      // ---- Tidal shockwave ring ----------------------------------
      if (tidalRing) {
        tidalRing.age += dt;
        const t = tidalRing.age / 1.6;
        if (t >= 1) {
          scene.remove(tidalRing.mesh);
          tidalRing.geo.dispose();
          tidalRing.mat.dispose();
          tidalRing = null;
        } else {
          const scale = 1 + t * 30;
          tidalRing.mesh.scale.set(scale, scale, 1);
          tidalRing.mat.opacity = (1 - t) * 1.0;
        }
      }

      // ---- Click bursts ------------------------------------------
      for (let i = burstStates.length - 1; i >= 0; i--) {
        const b = burstStates[i]!;
        b.age += dt;
        if (b.age >= b.duration) {
          scene.remove(b.points);
          b.geo.dispose();
          b.mat.dispose();
          burstStates.splice(i, 1);
          continue;
        }
        const positions = b.geo.attributes.position;
        if (positions) {
          for (let j = 0; j < b.count; j++) {
            const off = j * 3;
            // Velocity decays AND particles get pulled back toward
            // black hole — spec says "explodes outward briefly then
            // resumes spiraling inward."
            b.velocities[off]! *= 0.96;
            b.velocities[off + 1]! *= 0.96;
            b.velocities[off + 2]! *= 0.96;
            // Pull-in vector toward origin.
            const px = b.positions[off]!;
            const py = b.positions[off + 1]!;
            const pz = b.positions[off + 2]!;
            const len = Math.hypot(px, py, pz) || 0.001;
            const pullStrength = 1.5 * dt;
            b.velocities[off]! -= (px / len) * pullStrength;
            b.velocities[off + 1]! -= (py / len) * pullStrength;
            b.velocities[off + 2]! -= (pz / len) * pullStrength;
            b.positions[off]! += b.velocities[off]! * dt;
            b.positions[off + 1]! += b.velocities[off + 1]! * dt;
            b.positions[off + 2]! += b.velocities[off + 2]! * dt;
            positions.array[off] = b.positions[off]!;
            positions.array[off + 1] = b.positions[off + 1]!;
            positions.array[off + 2] = b.positions[off + 2]!;
          }
          positions.needsUpdate = true;
        }
        b.mat.opacity = 1 - b.age / b.duration;
      }

      composer.render();

      // ---- Auto-degrade ------------------------------------------
      const frameMs = performance.now() - frameStart;
      if (frameMs > 20) {
        slowFrames++;
        if (slowFrames > 3 && !degraded) {
          degraded = true;
          // Cheap reduction: dim the inspiral field by 20% (visual
          // proxy for fewer particles, which would require a costly
          // geometry rebuild).
          inMat.uniforms.uPulse.value *= 0.8;
          bgStarsMat.opacity *= 0.7;
          for (const m of nebulaMaterials) m.opacity *= 0.8;
        }
      } else {
        slowFrames = 0;
      }

      rafHandle = requestAnimationFrame(tick);
    }
    rafHandle = requestAnimationFrame(tick);

    // ---- Cleanup ---------------------------------------------------
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);

      try {
        if (audioCtx && masterGain) {
          masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
        }
        oscDrone?.stop();
        oscMid?.stop();
        oscShimmer?.stop();
        lfo?.stop();
        if (audioCtx) {
          window.setTimeout(() => audioCtx?.close().catch(() => {}), 600);
        }
      } catch {
        /* best-effort */
      }

      blackHoleGeo.dispose();
      blackHoleMat.dispose();
      lensGeo.dispose();
      lensMat.dispose();
      diskGeo.dispose();
      diskMat.dispose();
      inGeo.dispose();
      inMat.dispose();
      jetGeo.dispose();
      jetMat.dispose();
      bgStarsGeo.dispose();
      bgStarsMat.dispose();
      starTextureWhite.dispose();
      ringTexture.dispose();
      shockwaveTex.dispose();
      for (const t of nebulaTextures) t.dispose();
      for (const m of nebulaMaterials) m.dispose();
      for (const r of rings) {
        r.geo.dispose();
        r.mat.dispose();
      }
      if (tidalRing) {
        tidalRing.geo.dispose();
        tidalRing.mat.dispose();
      }
      for (const b of burstStates) {
        b.geo.dispose();
        b.mat.dispose();
      }
      for (const fg of fgLines) {
        fg.geo.dispose();
        fg.mat.dispose();
      }
      composer.dispose();
      renderer.dispose();
      try {
        container.removeChild(renderer.domElement);
      } catch {
        /* already removed */
      }
    };
    // brokerName / audioEnabled are read via refs so changing them
    // doesn't tear down the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="absolute inset-0"
      style={{ touchAction: "none" }}
    />
  );
}

export default SpaceScene;
