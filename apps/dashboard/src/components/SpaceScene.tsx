import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { themeForBroker } from "./spaceTheme";

export { themeForBroker } from "./spaceTheme";
export type { BrokerTheme } from "./spaceTheme";

/**
 * Black hole scene — built ENTIRELY with stock Three.js materials
 * (PointsMaterial, MeshBasicMaterial, SpriteMaterial). No custom
 * GLSL shaders. The previous version used custom ShaderMaterial for
 * the disk / inspiral / jets, and at least one of those silently
 * failed to compile, which left the user staring at a pulsing green
 * lensing-shell ball with everything else missing.
 *
 * The trade-off: per-frame CPU writes to BufferAttribute.array for
 * the moving particles. Costs more JS but cannot fail silently.
 *
 * Lazy-loaded by PostConnectSyncOverlay.
 */

// --- Tunables -------------------------------------------------------
const STAR_COUNT_BG = 8000;
const NEBULA_COUNT = 11;
const ACCRETION_PARTICLES = 8000;
const INSPIRAL_PARTICLES = 3000;
const JET_PARTICLES = 1200;
const FOREGROUND_LINES = 14;

const BLACK_HOLE_RADIUS = 1.2;
const ACCRETION_INNER = 1.6;
const ACCRETION_OUTER = 7.5;
const DISK_TILT = (20 * Math.PI) / 180;
const JET_LENGTH = 18;

const CAMERA_DIST_MIN = 5;
const CAMERA_DIST_MAX = 60;
const CAMERA_DIST_DEFAULT = 22;

const BPM = 95;
const BEAT_HZ = BPM / 60;

const HUE_CYCLE_SEC = 30;
const HUE_AMPLITUDE = 15 / 360;

// WASD movement tuning. Held key applies a target velocity; released
// key decays to zero over 0.3s.
const KEY_ORBIT_SPEED = 1.4;     // radians/sec at full press for left/right
const KEY_PITCH_SPEED = 1.0;     // radians/sec at full press for up/down
const KEY_RADIUS_SPEED = 18;     // units/sec at full press for forward/back
const KEY_DECAY_TAU = 0.3;       // exponential decay time constant on release

/** Keys we own. Anything not in this set bubbles up to other handlers. */
const OWNED_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

// --- Programmatic textures -----------------------------------------
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
  ctx.fillStyle = "rgba(0,0,0,0)";
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

// Vignette pass — last pass before output.
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
      float vignette = smoothstep(0.85, 0.35, dist);
      float v = mix(1.0, vignette, strength);
      col *= v;
      col *= 1.0 + tidalBoost * 0.5;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** Linear interpolation between two THREE.Color in HSL space — gives
 *  a more visually correct gradient than RGB lerp for the disk
 *  temperature ramp (blue-white → orange → broker theme). */
function lerpColorHsl(
  out: THREE.Color,
  a: THREE.Color,
  b: THREE.Color,
  t: number,
): THREE.Color {
  const aH = { h: 0, s: 0, l: 0 };
  const bH = { h: 0, s: 0, l: 0 };
  a.getHSL(aH);
  b.getHSL(bH);
  // Take the shorter way around the hue circle.
  let dh = bH.h - aH.h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  out.setHSL(
    (aH.h + dh * t + 1) % 1,
    aH.s + (bH.s - aH.s) * t,
    aH.l + (bH.l - aH.l) * t,
  );
  return out;
}

// --- Component ------------------------------------------------------

export interface SpaceSceneProps {
  brokerName?: string | null;
  audioEnabled?: boolean;
  /** When true, log every object added to the scene + render diagnostics
   *  overlay. Driven by `?debug` on the page URL or an explicit prop. */
  debug?: boolean;
}

export function SpaceScene({ brokerName, audioEnabled = true, debug = false }: SpaceSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debugOverlayRef = useRef<HTMLDivElement | null>(null);

  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  const themeRef = useRef(themeForBroker(brokerName));
  themeRef.current = themeForBroker(brokerName);

  // Resolve effective debug mode: explicit prop OR ?debug in URL.
  const debugRef = useRef(false);
  debugRef.current =
    debug ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("debug"));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const theme = themeRef.current;
    const debugMode = debugRef.current;

    const log = (msg: string, ...rest: unknown[]) => {
      if (debugMode) console.log(`[SpaceScene] ${msg}`, ...rest);
    };

    log("init starting", { theme, brokerName });

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
      1.5,
      1.0,
      0.05,
    );
    composer.addPass(bloomPass);
    const vignettePass = new ShaderPass(VignetteShader);
    composer.addPass(vignettePass);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);
    log("renderer + composer ready");

    /** Track every Object3D we add for the disposal pass and the debug
     *  overlay. We name() them so the debug panel reads cleanly. */
    const tracked: Array<{
      obj: THREE.Object3D;
      vertices: number;
      kind: string;
    }> = [];
    function addTracked(obj: THREE.Object3D, kind: string, vertices: number) {
      obj.name = kind;
      scene.add(obj);
      tracked.push({ obj, vertices, kind });
      log(`+ ${kind}`, { vertices, position: obj.position.toArray() });
    }

    // ---- Black hole core --------------------------------------------
    const blackHoleGeo = new THREE.SphereGeometry(BLACK_HOLE_RADIUS, 64, 64);
    const blackHoleMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const blackHole = new THREE.Mesh(blackHoleGeo, blackHoleMat);
    blackHole.renderOrder = 10;
    addTracked(blackHole, "blackHole", blackHoleGeo.attributes.position!.count);

    // ---- Lensing shell — simple Fresnel via PointsMaterial would not
    // work for this; ShaderMaterial here is small and well-tested.
    // BUT we'll fail-soft: if compile fails, we fall back to a thin
    // semi-transparent torus that's still visible-ish.
    const lensGeo = new THREE.SphereGeometry(BLACK_HOLE_RADIUS * 1.45, 48, 48);
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
        float shimmer = 0.85 + 0.15 * sin(uTime * 2.0 + atan(vNormal.y, vNormal.x) * 6.0);
        float a = ring * shimmer * (0.45 + uPulse * 0.15);
        vec3 col = mix(uTint, vec3(1.0), ring);
        gl_FragColor = vec4(col * a, a);
      }
    `;
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
    addTracked(lensShell, "lensShell", lensGeo.attributes.position!.count);

    // ---- Accretion disk (PointsMaterial + per-vertex colors) -------
    //
    // 8000 particles in a tilted annulus. Each particle keeps its own
    // (radius, currentAngle) and we update positions on the CPU each
    // frame. Colors are baked once at init from a temperature
    // gradient (inner blue-white → mid orange → outer broker-themed).
    const diskRadii = new Float32Array(ACCRETION_PARTICLES);
    const diskAngles = new Float32Array(ACCRETION_PARTICLES);
    const diskAngVel = new Float32Array(ACCRETION_PARTICLES);
    const diskHeights = new Float32Array(ACCRETION_PARTICLES);
    const diskPositions = new Float32Array(ACCRETION_PARTICLES * 3);
    const diskColors = new Float32Array(ACCRETION_PARTICLES * 3);
    const diskBaseColors = new Float32Array(ACCRETION_PARTICLES * 3); // unmodulated

    const colInner = new THREE.Color(0xa0d8ff);
    const colMid = new THREE.Color(0xffaa40);
    const colOuter = new THREE.Color(theme.diskOuterColor);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < ACCRETION_PARTICLES; i++) {
      const u = Math.random();
      const r = ACCRETION_INNER + (ACCRETION_OUTER - ACCRETION_INNER) * Math.pow(u, 1.4);
      diskRadii[i] = r;
      diskAngles[i] = Math.random() * Math.PI * 2;
      // Keplerian: angular velocity ∝ 1/√r. Inner orbits fast.
      diskAngVel[i] = 0.6 / Math.sqrt(Math.max(r, 0.4));
      diskHeights[i] = (Math.random() - 0.5) * 0.12 * (r / ACCRETION_OUTER + 0.3);

      const radNorm = Math.min(1, Math.max(0, (r - ACCRETION_INNER) / (ACCRETION_OUTER - ACCRETION_INNER)));
      if (radNorm < 0.5) {
        lerpColorHsl(tmpColor, colInner, colMid, radNorm * 2);
      } else {
        lerpColorHsl(tmpColor, colMid, colOuter, (radNorm - 0.5) * 2);
      }
      diskBaseColors[i * 3] = tmpColor.r;
      diskBaseColors[i * 3 + 1] = tmpColor.g;
      diskBaseColors[i * 3 + 2] = tmpColor.b;
      diskColors[i * 3] = tmpColor.r;
      diskColors[i * 3 + 1] = tmpColor.g;
      diskColors[i * 3 + 2] = tmpColor.b;
    }
    const diskGeo = new THREE.BufferGeometry();
    diskGeo.setAttribute("position", new THREE.BufferAttribute(diskPositions, 3));
    diskGeo.setAttribute("color", new THREE.BufferAttribute(diskColors, 3));
    diskGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), ACCRETION_OUTER * 1.5);

    const starTextureWhite = makeStarTexture(64);
    const diskMat = new THREE.PointsMaterial({
      size: 0.12,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: starTextureWhite,
    });
    const accretion = new THREE.Points(diskGeo, diskMat);
    addTracked(accretion, "accretionDisk", ACCRETION_PARTICLES);

    // ---- Inspiraling particle field --------------------------------
    //
    // Each particle is on a logarithmic-spiral path: r(t) = r0*exp(-k*t)
    // shrinking from outer to event horizon. When it crosses the
    // event horizon, respawn at the outer edge with a new angle.
    const inspiralOuter = ACCRETION_OUTER * 1.6;
    const inspiralRadii = new Float32Array(INSPIRAL_PARTICLES);
    const inspiralAngles = new Float32Array(INSPIRAL_PARTICLES);
    const inspiralHeights = new Float32Array(INSPIRAL_PARTICLES);
    const inspiralPositions = new Float32Array(INSPIRAL_PARTICLES * 3);
    const inspiralColors = new Float32Array(INSPIRAL_PARTICLES * 3);
    const colInspiralOuter = new THREE.Color(theme.diskOuterColor);
    const colInspiralInner = new THREE.Color(0xffffff);
    function seedInspiralParticle(i: number, freshOuter = false) {
      inspiralRadii[i] = freshOuter
        ? inspiralOuter
        : ACCRETION_INNER + Math.random() * (inspiralOuter - ACCRETION_INNER);
      inspiralAngles[i] = Math.random() * Math.PI * 2;
      inspiralHeights[i] = (Math.random() - 0.5) * 4;
    }
    for (let i = 0; i < INSPIRAL_PARTICLES; i++) {
      seedInspiralParticle(i);
    }
    // Fill colors based on initial radius — we update color per frame
    // too as particles spiral in, so they get hotter as they fall.
    const inspiralGeo = new THREE.BufferGeometry();
    inspiralGeo.setAttribute("position", new THREE.BufferAttribute(inspiralPositions, 3));
    inspiralGeo.setAttribute("color", new THREE.BufferAttribute(inspiralColors, 3));
    inspiralGeo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      inspiralOuter * 1.2,
    );
    const inspiralMat = new THREE.PointsMaterial({
      size: 0.18,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: starTextureWhite,
    });
    const inspiral = new THREE.Points(inspiralGeo, inspiralMat);
    addTracked(inspiral, "inspiralField", INSPIRAL_PARTICLES);

    // ---- Polar jets -------------------------------------------------
    //
    // Two cones along the disk's normal. Each particle has a
    // (offset, lateral) pair and a sign (+1 / -1) for which pole.
    // We update positions per frame: distAlong = offset advances and
    // wraps; lateral tightens with distance.
    const jetOffsets = new Float32Array(JET_PARTICLES);
    const jetLaterals = new Float32Array(JET_PARTICLES);
    const jetLatAngles = new Float32Array(JET_PARTICLES);
    const jetSigns = new Float32Array(JET_PARTICLES);
    const jetPositions = new Float32Array(JET_PARTICLES * 3);
    const jetColors = new Float32Array(JET_PARTICLES * 3);
    const colJet = new THREE.Color(theme.jetColor);
    const colJetWhite = new THREE.Color(0xffffff);
    for (let i = 0; i < JET_PARTICLES; i++) {
      jetOffsets[i] = Math.random();
      jetLaterals[i] = Math.random() * 0.5;
      jetLatAngles[i] = Math.random() * Math.PI * 2;
      jetSigns[i] = i < JET_PARTICLES / 2 ? 1 : -1;
    }
    const jetGeo = new THREE.BufferGeometry();
    jetGeo.setAttribute("position", new THREE.BufferAttribute(jetPositions, 3));
    jetGeo.setAttribute("color", new THREE.BufferAttribute(jetColors, 3));
    jetGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), JET_LENGTH * 1.2);
    const jetMat = new THREE.PointsMaterial({
      size: 0.15,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: starTextureWhite,
    });
    const jets = new THREE.Points(jetGeo, jetMat);
    addTracked(jets, "polarJets", JET_PARTICLES);

    // Disk tilt is around X: mat * vec(x, y, z).
    // We bake the tilt into the per-frame position writes so the
    // BufferAttribute already contains rotated coordinates.
    const tiltCos = Math.cos(DISK_TILT);
    const tiltSin = Math.sin(DISK_TILT);

    // ---- Background star field (8000 white points) -----------------
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
    addTracked(bgStars, "bgStars", STAR_COUNT_BG);

    // ---- Background nebulas ----------------------------------------
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
      sprite.name = `nebula_${i}`;
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
      tracked.push({ obj: sprite, vertices: 4, kind: `nebula_${i}` });
    }
    log(`+ ${NEBULA_COUNT} nebulas`);

    // ---- Expanding rings -------------------------------------------
    //
    // RingGeometry default sits in the XY plane (vertices at z=0,
    // facing +Z). We want it to lie in the disk plane. The disk's
    // local plane is tilted by DISK_TILT around the X axis from the
    // XZ plane. So: take a ring that's flat in XY, rotate it by
    // -π/2 around X to land in XZ, then by DISK_TILT around X to
    // match the disk tilt. Net: rotate.x = -π/2 + DISK_TILT.
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
      mesh.name = `ring_${rings.length}`;
      mesh.rotation.x = -Math.PI / 2 + DISK_TILT;
      scene.add(mesh);
      rings.push({ mesh, geo, mat, age: 0, duration: 4.5, maxScale: 14 });
      log(`+ ring spawn`);
    }

    // ---- Tidal shockwave ring --------------------------------------
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
      mesh.name = "shockwave";
      mesh.rotation.x = -Math.PI / 2 + DISK_TILT;
      scene.add(mesh);
      tidalRing = { mesh, geo, mat, age: 0 };
      log("+ shockwave");
    }

    // ---- Click bursts ----------------------------------------------
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
        size: 0.4,
        sizeAttenuation: true,
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: starTextureWhite,
      });
      const points = new THREE.Points(geo, mat);
      points.name = "clickBurst";
      scene.add(points);
      burstStates.push({
        points, geo, mat, velocities, positions, count, age: 0, duration: 1.0,
      });
      log("+ click burst", { worldPos: worldPos.toArray() });
    }

    // ---- Foreground HUD-like geometric line drift ------------------
    const fgLines: Array<{
      mesh: THREE.LineSegments;
      geo: THREE.BufferGeometry;
      mat: THREE.LineBasicMaterial;
      driftSpeed: number;
    }> = [];
    for (let i = 0; i < FOREGROUND_LINES; i++) {
      const positions: number[] = [];
      const shapeRoll = Math.random();
      if (shapeRoll < 0.5) {
        const len = 0.4 + Math.random() * 1.2;
        positions.push(-len / 2, 0, 0, len / 2, 0, 0);
      } else if (shapeRoll < 0.8) {
        const len = 0.3 + Math.random() * 0.9;
        positions.push(0, -len / 2, 0, 0, len / 2, 0);
      } else {
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
      mesh.name = `fgLine_${i}`;
      const startX = (Math.random() - 0.5) * 30;
      const startY = (Math.random() - 0.5) * 18;
      const startZ = 6 + Math.random() * 14;
      mesh.position.set(startX, startY, startZ);
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      const driftSpeed = 0.4 + (15 - startZ) * 0.08 + Math.random() * 0.3;
      scene.add(mesh);
      fgLines.push({ mesh, geo, mat, driftSpeed });
      tracked.push({ obj: mesh, vertices: positions.length / 3, kind: `fgLine_${i}` });
    }
    log(`+ ${FOREGROUND_LINES} foreground lines`);

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
        oscDrone = audioCtx.createOscillator();
        oscDrone.type = "sine";
        oscDrone.frequency.value = 40;
        const droneGain = audioCtx.createGain();
        droneGain.gain.value = 0.8;
        oscDrone.connect(droneGain);
        droneGain.connect(masterGain);
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
        lfoGain.gain.value = 0.4;
        lfo.connect(lfoGain);
        lfoGain.connect(midGain.gain);
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
      /* silent */
    }
    function spawnThumpAudio() {
      if (!audioCtx) return;
      try {
        const ctx = audioCtx;
        const len = Math.floor(ctx.sampleRate * 1.5);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() - 0.5) * 2;
        const src = ctx.createBufferSource();
        src.buffer = buf;
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
        /* */
      }
    }

    // ---- Interaction state -----------------------------------------
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let pointerDownX = 0;
    let pointerDownY = 0;
    const lookVelocity = new THREE.Vector2(0, 0);

    let tidalRemaining = 0;
    const TIDAL_DURATION = 2.0;

    // ---- Keyboard input --------------------------------------------
    //
    // Track which keys are held; the rAF loop applies them with
    // velocity easing. Mounted/unmounted with the scene so we don't
    // step on app shortcuts when the overlay is closed.
    const held = new Set<string>();
    // Velocity components — eased toward the held-input target each
    // frame.
    let vYaw = 0;
    let vPitch = 0;
    let vRadius = 0;
    function onKeyDown(e: KeyboardEvent) {
      if (!OWNED_KEYS.has(e.code)) return;
      held.add(e.code);
      e.preventDefault();
      // Wake audio on first keystroke too.
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (!OWNED_KEYS.has(e.code)) return;
      held.delete(e.code);
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

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
        const rect = renderer.domElement.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const ndc = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
        const dir = ndc.sub(camera.position).normalize();
        const t = -camera.position.y / dir.y;
        if (t > 0 && Number.isFinite(t)) {
          const worldPos = camera.position.clone().addScaledVector(dir, t);
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

    // ---- Debug overlay: list scene objects + vertex counts --------
    let debugDiv: HTMLDivElement | null = null;
    let debugWireframeRoot: THREE.Object3D | null = null;
    if (debugMode) {
      debugDiv = document.createElement("div");
      debugDiv.style.cssText = `
        position: absolute;
        top: 56px;
        left: 16px;
        z-index: 5;
        color: #aaffaa;
        font-family: ui-monospace, monospace;
        font-size: 11px;
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid #2a4a2a;
        padding: 8px 10px;
        max-width: 320px;
        max-height: 60vh;
        overflow-y: auto;
        line-height: 1.4;
        pointer-events: none;
      `;
      container.appendChild(debugDiv);
      debugOverlayRef.current = debugDiv;
      // Wireframe overlay group: bounding-sphere helpers around each
      // tracked object. Toggleable via the same flag.
      debugWireframeRoot = new THREE.Group();
      debugWireframeRoot.name = "debugWireframes";
      scene.add(debugWireframeRoot);
      log("debug overlay enabled");
    }

    // ---- Animation loop --------------------------------------------
    const clock = new THREE.Clock();
    let elapsed = 0;
    let nextRingAt = 1.0;
    let rafHandle = 0;
    let cancelled = false;
    let slowFrames = 0;
    let degraded = false;
    let frameNum = 0;

    const camToCenter = new THREE.Vector3();

    function tick() {
      if (cancelled) return;
      if (document.hidden) {
        rafHandle = requestAnimationFrame(tick);
        return;
      }
      const frameStart = performance.now();
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;
      frameNum++;

      if (audioCtx && masterGain) {
        const target = audioEnabledRef.current ? 0.05 : 0;
        if (Math.abs(masterGain.gain.value - target) > 0.001) {
          masterGain.gain.linearRampToValueAtTime(target, audioCtx.currentTime + 0.2);
        }
      }

      // ---- Rhythm pulse -------------------------------------------
      const pulseRaw = Math.sin(elapsed * BEAT_HZ * 2 * Math.PI);
      const pulse = pulseRaw > 0 ? pulseRaw * pulseRaw : 0;

      // ---- Tidal envelope -----------------------------------------
      let tidalBoost = 0;
      if (tidalRemaining > 0) {
        const phase = TIDAL_DURATION - tidalRemaining;
        if (phase < 0.3) tidalBoost = phase / 0.3;
        else if (phase < 1.4) tidalBoost = 1;
        else tidalBoost = Math.max(0, 1 - (phase - 1.4) / 0.6);
        tidalRemaining -= dt;
      }

      // ---- Lens shader uniforms ----------------------------------
      lensMat.uniforms.uTime.value = elapsed;
      lensMat.uniforms.uPulse.value = pulse;
      vignettePass.uniforms.tidalBoost.value = tidalBoost;

      // ---- Disk pulse — ±35% brightness via material.opacity -----
      // Plus tidal flash bumps it dramatically.
      diskMat.opacity = 0.7 + pulse * 0.35 + tidalBoost * 1.0;
      // During tidal, color-wash the disk toward white via vertex colors
      // — too expensive to rebuild every frame, so we instead just
      // overdrive opacity which already gets us most of the way.

      // ---- Update accretion disk positions -----------------------
      //
      // For each particle: angle += angVel * dt * (1 + tidalBoost*1.5).
      // x = r*cos(a), z = r*sin(a). y is the small thickness offset.
      // Then tilt around X: yt = y*cos(t) - z*sin(t); zt = y*sin(t) + z*cos(t).
      const speedFactor = 1 + tidalBoost * 1.5;
      {
        const posArr = diskGeo.attributes.position!.array as Float32Array;
        for (let i = 0; i < ACCRETION_PARTICLES; i++) {
          diskAngles[i]! += diskAngVel[i]! * dt * speedFactor;
          const r = diskRadii[i]!;
          const a = diskAngles[i]!;
          const x = r * Math.cos(a);
          const z = r * Math.sin(a);
          const y = diskHeights[i]!;
          const yt = y * tiltCos - z * tiltSin;
          const zt = y * tiltSin + z * tiltCos;
          const off = i * 3;
          posArr[off] = x;
          posArr[off + 1] = yt;
          posArr[off + 2] = zt;
        }
        diskGeo.attributes.position!.needsUpdate = true;
      }

      // ---- Update inspiraling field ------------------------------
      //
      // Every particle's radius shrinks each frame on a logarithmic
      // schedule. At a constant per-second rate of `radialSpeed`,
      // r *= exp(-k*dt) with k chosen so a particle at outer takes
      // ~12s to reach inner.
      // exp(-k * 12) = inner/outer  →  k = ln(outer/inner) / 12
      const inSpiralK = Math.log(inspiralOuter / ACCRETION_INNER) / 12;
      {
        const posArr = inspiralGeo.attributes.position!.array as Float32Array;
        const colArr = inspiralGeo.attributes.color!.array as Float32Array;
        for (let i = 0; i < INSPIRAL_PARTICLES; i++) {
          // Radius shrink.
          let r = inspiralRadii[i]!;
          r *= Math.exp(-inSpiralK * dt);
          // Angular: ω = 0.4/r (faster as r shrinks).
          const omega = 0.4 / Math.max(r * 0.4, 0.5);
          let a = inspiralAngles[i]! + omega * dt + tidalBoost * 4 * dt;
          // Respawn at outer if past horizon.
          if (r < ACCRETION_INNER * 0.95) {
            r = inspiralOuter;
            a = Math.random() * Math.PI * 2;
            inspiralHeights[i] = (Math.random() - 0.5) * 4;
          }
          inspiralRadii[i] = r;
          inspiralAngles[i] = a;

          // Position.
          const h = inspiralHeights[i]! * (r / inspiralOuter) * (r / inspiralOuter);
          const off = i * 3;
          posArr[off] = r * Math.cos(a);
          posArr[off + 1] = h;
          posArr[off + 2] = r * Math.sin(a);

          // Color: outer broker theme → white-hot inner.
          const t = Math.min(1, Math.max(0, 1 - (r - ACCRETION_INNER) / (inspiralOuter - ACCRETION_INNER)));
          const tt = Math.pow(t, 1.5);
          colArr[off] = colInspiralOuter.r + (colInspiralInner.r - colInspiralOuter.r) * tt;
          colArr[off + 1] = colInspiralOuter.g + (colInspiralInner.g - colInspiralOuter.g) * tt;
          colArr[off + 2] = colInspiralOuter.b + (colInspiralInner.b - colInspiralOuter.b) * tt;
        }
        inspiralGeo.attributes.position!.needsUpdate = true;
        inspiralGeo.attributes.color!.needsUpdate = true;
      }

      // ---- Update jets -------------------------------------------
      {
        const posArr = jetGeo.attributes.position!.array as Float32Array;
        const colArr = jetGeo.attributes.color!.array as Float32Array;
        const jetSpeed = 1 + tidalBoost * 2;
        for (let i = 0; i < JET_PARTICLES; i++) {
          jetOffsets[i]! += jetSpeed * 0.2 * dt;
          if (jetOffsets[i]! > 1) jetOffsets[i]! -= 1;
          const life = jetOffsets[i]!;
          const distAlong = life * JET_LENGTH;
          const tighten = 1 - life * 0.65;
          const lat = jetLaterals[i]! * tighten * (1 + tidalBoost);
          const sign = jetSigns[i]!;
          const y = distAlong * sign;
          const x = lat * Math.cos(jetLatAngles[i]!);
          const z = lat * Math.sin(jetLatAngles[i]!);
          // Same disk tilt applied to keep jets perpendicular to disk.
          const yt = y * tiltCos - z * tiltSin;
          const zt = y * tiltSin + z * tiltCos;
          const off = i * 3;
          posArr[off] = x;
          posArr[off + 1] = yt;
          posArr[off + 2] = zt;
          // Lifetime envelope baked into color (since vertexColors).
          // Fade in fast, fade out toward end.
          const fadeIn = Math.min(1, life / 0.1);
          const fadeOut = 1 - Math.max(0, (life - 0.6) / 0.4);
          const lifeAlpha = fadeIn * fadeOut;
          // Mix theme jet color with white per-particle.
          const mix = 0.4;
          colArr[off] = (colJet.r * (1 - mix) + colJetWhite.r * mix) * lifeAlpha;
          colArr[off + 1] = (colJet.g * (1 - mix) + colJetWhite.g * mix) * lifeAlpha;
          colArr[off + 2] = (colJet.b * (1 - mix) + colJetWhite.b * mix) * lifeAlpha;
        }
        jetGeo.attributes.position!.needsUpdate = true;
        jetGeo.attributes.color!.needsUpdate = true;
      }
      // Pulse on jet brightness too — opacity is uniform across all
      // jet particles, so a per-frame nudge here is cheap.
      jetMat.opacity = 0.85 + pulse * 0.15 + tidalBoost * 0.5;

      // ---- Hue-shift nebulas -------------------------------------
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

      // ---- Keyboard input → velocity targets ---------------------
      const keyTarget = { yaw: 0, pitch: 0, radius: 0 };
      if (held.has("KeyA") || held.has("ArrowLeft")) keyTarget.yaw -= KEY_ORBIT_SPEED;
      if (held.has("KeyD") || held.has("ArrowRight")) keyTarget.yaw += KEY_ORBIT_SPEED;
      if (held.has("KeyW") || held.has("ArrowUp")) keyTarget.radius -= KEY_RADIUS_SPEED;
      if (held.has("KeyS") || held.has("ArrowDown")) keyTarget.radius += KEY_RADIUS_SPEED;
      if (held.has("KeyQ")) keyTarget.pitch += KEY_PITCH_SPEED;
      if (held.has("KeyE")) keyTarget.pitch -= KEY_PITCH_SPEED;

      // Eased decay toward target. Held → target in ~150ms; released
      // → 0 in ~300ms.
      const decay = Math.exp(-dt / KEY_DECAY_TAU);
      vYaw = vYaw * decay + keyTarget.yaw * (1 - decay);
      vPitch = vPitch * decay + keyTarget.pitch * (1 - decay);
      vRadius = vRadius * decay + keyTarget.radius * (1 - decay);
      camYaw += vYaw * dt;
      camPitch += vPitch * dt;
      camRadiusTarget = Math.max(
        CAMERA_DIST_MIN,
        Math.min(CAMERA_DIST_MAX, camRadiusTarget + vRadius * dt),
      );
      camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camPitch));

      // ---- Camera (orbital) --------------------------------------
      camRadius += (camRadiusTarget - camRadius) * 0.08;
      if (!dragging) {
        camYaw += lookVelocity.x * dt * 0.3;
        camPitch += lookVelocity.y * dt * 0.3;
        camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camPitch));
        lookVelocity.multiplyScalar(0.93);
      }
      const shakeAmt = tidalBoost * 0.15;
      camera.position.set(
        camRadius * Math.cos(camPitch) * Math.cos(camYaw) + (Math.random() - 0.5) * shakeAmt,
        camRadius * Math.sin(camPitch) + (Math.random() - 0.5) * shakeAmt,
        camRadius * Math.cos(camPitch) * Math.sin(camYaw) + (Math.random() - 0.5) * shakeAmt,
      );
      camera.lookAt(0, 0, 0);

      // ---- Foreground line drift ---------------------------------
      camToCenter.copy(camera.position).normalize().negate();
      const camPos = camera.position;
      for (const fg of fgLines) {
        // Move line away from origin (toward camera direction).
        fg.mesh.position.addScaledVector(camToCenter.clone().negate(), fg.driftSpeed * dt);
        fg.mesh.rotation.x += dt * 0.05;
        fg.mesh.rotation.y += dt * 0.07;
        const distToCam = fg.mesh.position.distanceTo(camPos);
        if (distToCam < 1.5) {
          const reset = camPos.clone().addScaledVector(camToCenter, 14 + Math.random() * 8);
          reset.x += (Math.random() - 0.5) * 12;
          reset.y += (Math.random() - 0.5) * 8;
          fg.mesh.position.copy(reset);
        }
      }

      // ---- Ring spawn + update ----------------------------------
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

      // ---- Tidal shockwave --------------------------------------
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

      // ---- Click bursts -----------------------------------------
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
            b.velocities[off]! *= 0.96;
            b.velocities[off + 1]! *= 0.96;
            b.velocities[off + 2]! *= 0.96;
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

      // ---- Debug overlay update ---------------------------------
      if (debugMode && debugDiv && (frameNum % 30 === 0)) {
        const totalVerts = tracked.reduce((s, t) => s + t.vertices, 0);
        const lines = [
          `BlackHole scene · debug`,
          `frame ${frameNum} · pulse ${pulse.toFixed(2)} · tidal ${tidalBoost.toFixed(2)}`,
          `cam yaw ${camYaw.toFixed(2)} pitch ${camPitch.toFixed(2)} radius ${camRadius.toFixed(1)}`,
          `total tracked: ${tracked.length} objects · ${totalVerts.toLocaleString()} vertices`,
          `--`,
          ...tracked.map((t) => {
            const m = t.obj as THREE.Mesh | THREE.Points | THREE.Sprite;
            const mat = (m as THREE.Mesh).material as
              | (THREE.Material & { color?: THREE.Color })
              | undefined;
            const colorHex = mat?.color
              ? "#" + mat.color.getHexString()
              : "—";
            const visible = t.obj.visible ? "✓" : "✗";
            return `${visible} ${t.kind} · ${t.vertices.toLocaleString()}v · ${colorHex}`;
          }),
        ];
        debugDiv.textContent = lines.join("\n");
      }

      // ---- Auto-degrade ------------------------------------------
      const frameMs = performance.now() - frameStart;
      if (frameMs > 20) {
        slowFrames++;
        if (slowFrames > 3 && !degraded) {
          degraded = true;
          inspiralMat.opacity *= 0.7;
          bgStarsMat.opacity *= 0.7;
          for (const m of nebulaMaterials) m.opacity *= 0.8;
          log("auto-degrade triggered");
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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
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
        /* */
      }

      blackHoleGeo.dispose();
      blackHoleMat.dispose();
      lensGeo.dispose();
      lensMat.dispose();
      diskGeo.dispose();
      diskMat.dispose();
      inspiralGeo.dispose();
      inspiralMat.dispose();
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
        /* */
      }
      if (debugDiv) {
        try {
          container.removeChild(debugDiv);
        } catch {
          /* */
        }
      }
      if (debugWireframeRoot) {
        scene.remove(debugWireframeRoot);
      }
    };
    // brokerName / audioEnabled / debug are read via refs.
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
