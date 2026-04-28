import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { themeForBroker, type BrokerTheme } from "./spaceTheme";

// Re-export for callers that historically imported themeForBroker
// from this module. The actual map lives in ./spaceTheme so the
// overlay can use it without dragging three.js into the main bundle.
export { themeForBroker } from "./spaceTheme";
export type { BrokerTheme } from "./spaceTheme";

/**
 * First-person galaxy fly-through. Rendered behind the sync overlay
 * during phases 2 (broker wait) and 3 (DB writes). The user is
 * floating in deep space, drifting toward a distant galaxy core,
 * with three layers of stars, layered nebula clouds, asteroid debris,
 * occasional events, and broker-specific theming.
 *
 * Lazy-loaded by PostConnectSyncOverlay so the three.js + post-
 * processing bundle only ships when the overlay actually mounts.
 *
 * Reduced-motion: parent skips mounting this entirely.
 */

// --- Tunables -------------------------------------------------------
const STAR_COUNT_FAR = 8000;
const STAR_COUNT_MID = 2000;
const STAR_COUNT_NEAR = 800;
const NEBULA_COUNT = 15;
const ASTEROID_COUNT = 40;

const FORWARD_SPEED_MIN = 0.005;
const FORWARD_SPEED_MAX = 0.15;
const FORWARD_SPEED_DEFAULT = 0.02;

// --- Programmatic textures (no external assets) ---------------------

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

/** Apply a hex color as an RGB tint to a white-base texture by
 *  re-rendering the star texture with the tint baked in. Used by mid
 *  stars where ~10% should be slightly cool / warm / yellow. */
function makeTintedStarTexture(size: number, hex: number): THREE.Texture {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const inner = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},1)`;
  const mid = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.85)`;
  grad.addColorStop(0, inner);
  grad.addColorStop(0.3, mid);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// --- HSL nudge for nebula secondary color ---------------------------
function hueShift(hexColor: string, deltaDeg: number): string {
  const c = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.h = (hsl.h + deltaDeg / 360 + 1) % 1;
  c.setHSL(hsl.h, hsl.s, hsl.l);
  return "#" + c.getHexString();
}

interface AsteroidState {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
}

interface NearStarState {
  posA: THREE.Vector3;
  posB: THREE.Vector3;
  velocity: THREE.Vector3;
}

// --- Vignette + chromatic aberration shader (warp effect) -----------
//
// Custom ShaderPass — vignette darkens the screen edges; chromatic
// aberration shifts R/B channels radially. The strength uniform is
// driven by warp progress; at 0 the pass is a no-op.
const VignetteCAShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0.0 }, // 0..1, driven by warp progress
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
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 toCenter = uv - 0.5;
      float dist = length(toCenter);

      // Chromatic aberration: shift R/B sample positions radially.
      float caAmount = strength * 0.012;
      vec2 caDir = normalize(toCenter + vec2(0.0001));
      vec3 col;
      col.r = texture2D(tDiffuse, uv - caDir * caAmount).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + caDir * caAmount).b;

      // Vignette: smooth darken at edges, ramps with strength.
      float vignette = smoothstep(0.85, 0.4, dist);
      float v = mix(1.0, vignette, strength * 0.85);
      col *= v;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// --- Component ------------------------------------------------------

export interface SpaceSceneProps {
  brokerName?: string | null;
  /** Web Audio output. When false, the scene's audio context stays
   *  suspended. Default true. The parent overlay surfaces a mute
   *  button so the user can flip this. */
  audioEnabled?: boolean;
}

export function SpaceScene({ brokerName, audioEnabled = true }: SpaceSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Hold the latest audio-enabled flag in a ref so the rAF / oscillator
  // gain updates without rebuilding the whole scene.
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  // Keep the chosen theme stable across re-renders so material refs
  // captured in the effect closure remain correct.
  const themeRef = useRef<BrokerTheme>(themeForBroker(brokerName));
  themeRef.current = themeForBroker(brokerName);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const theme = themeRef.current;

    const W = () => container.clientWidth;
    const H = () => container.clientHeight;

    // --- Renderer + composer -------------------------------------
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

    const camera = new THREE.PerspectiveCamera(70, W() / H(), 0.1, 2000);
    camera.position.set(0, 0, 0);

    const sceneGroup = new THREE.Group();
    scene.add(sceneGroup);

    const composer = new EffectComposer(renderer);
    composer.setSize(W(), H());
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Bloom — bumped per spec. Keep asteroid emissive low so they
    // don't blow out into the bloom.
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(W(), H()),
      1.2, // strength
      0.8, // radius
      0.1, // threshold
    );
    composer.addPass(bloomPass);

    // Vignette + chromatic aberration. Strength sits at 0 normally;
    // warp ramps it briefly.
    const vignettePass = new ShaderPass(VignetteCAShader);
    composer.addPass(vignettePass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // --- Star textures (one shared white, plus 4 tints for variety) ---
    const starTextureWhite = makeStarTexture(64);
    const starTextureWarmWhite = makeTintedStarTexture(64, 0xfff5e0);
    const starTextureCoolBlue = makeTintedStarTexture(64, 0xc0e0ff);
    const starTextureFaintYellow = makeTintedStarTexture(64, 0xfff0a0);

    // --- Far layer: 8,000 distant tiny stars (nearly stationary) ---
    const farStarPositions = new Float32Array(STAR_COUNT_FAR * 3);
    for (let i = 0; i < STAR_COUNT_FAR; i++) {
      const r = 400 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      farStarPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      farStarPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      farStarPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const farStarsGeo = new THREE.BufferGeometry();
    farStarsGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(farStarPositions, 3),
    );
    const farStarsMat = new THREE.PointsMaterial({
      size: 0.7,
      sizeAttenuation: true,
      color: theme.starTint,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: starTextureWhite,
    });
    const farStars = new THREE.Points(farStarsGeo, farStarsMat);
    sceneGroup.add(farStars);

    // --- Mid layer: 2,000 stars in 4 sub-groups for color variety ---
    // Three.js Points materials are uniform across the whole geometry,
    // so we split mid stars into 4 BufferGeometries (one per tint).
    const MID_RANGE_Z = 200;
    const midGroups: Array<{
      geo: THREE.BufferGeometry;
      mat: THREE.PointsMaterial;
      points: THREE.Points;
      positions: Float32Array;
      count: number;
    }> = [];
    function buildMidGroup(count: number, tex: THREE.Texture, color: number) {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 2] = -Math.random() * MID_RANGE_Z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: 1.6,
        sizeAttenuation: true,
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        map: tex,
      });
      const points = new THREE.Points(geo, mat);
      sceneGroup.add(points);
      midGroups.push({ geo, mat, points, positions, count });
    }
    // ~70% white, 15% cool blue, 10% warm white, 5% faint yellow.
    buildMidGroup(Math.floor(STAR_COUNT_MID * 0.7), starTextureWhite, theme.starTint);
    buildMidGroup(Math.floor(STAR_COUNT_MID * 0.15), starTextureCoolBlue, 0xffffff);
    buildMidGroup(Math.floor(STAR_COUNT_MID * 0.1), starTextureWarmWhite, 0xffffff);
    buildMidGroup(Math.floor(STAR_COUNT_MID * 0.05), starTextureFaintYellow, 0xffffff);

    // --- Near layer: 800 motion-blur streak segments -----------------
    const NEAR_RANGE_Z = 80;
    const STREAK_LEN_FACTOR = 6;
    const nearStarSegments: NearStarState[] = [];
    const nearStarPositions = new Float32Array(STAR_COUNT_NEAR * 6);
    const nearStarColors = new Float32Array(STAR_COUNT_NEAR * 6);
    for (let i = 0; i < STAR_COUNT_NEAR; i++) {
      const x = (Math.random() - 0.5) * 80;
      const y = (Math.random() - 0.5) * 80;
      const z = -Math.random() * NEAR_RANGE_Z;
      const speed = 0.6 + Math.random() * 1.4;
      const velocity = new THREE.Vector3(0, 0, speed);
      const posA = new THREE.Vector3(x, y, z);
      const posB = posA.clone().addScaledVector(velocity, -STREAK_LEN_FACTOR);
      nearStarSegments.push({ posA, posB, velocity });

      const off = i * 6;
      nearStarPositions[off] = posA.x;
      nearStarPositions[off + 1] = posA.y;
      nearStarPositions[off + 2] = posA.z;
      nearStarPositions[off + 3] = posB.x;
      nearStarPositions[off + 4] = posB.y;
      nearStarPositions[off + 5] = posB.z;

      nearStarColors[off] = 1;
      nearStarColors[off + 1] = 1;
      nearStarColors[off + 2] = 1;
      nearStarColors[off + 3] = 0.2;
      nearStarColors[off + 4] = 0.2;
      nearStarColors[off + 5] = 0.2;
    }
    const nearStarsGeo = new THREE.BufferGeometry();
    nearStarsGeo.setAttribute("position", new THREE.BufferAttribute(nearStarPositions, 3));
    nearStarsGeo.setAttribute("color", new THREE.BufferAttribute(nearStarColors, 3));
    const nearStarsMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const nearStars = new THREE.LineSegments(nearStarsGeo, nearStarsMat);
    sceneGroup.add(nearStars);

    // --- Layered nebulas: 15 sprites at varying depth, 3-color story
    // (primary / hue-shifted secondary / near-black tertiary) per
    // theme. Additive blending means overlapping clouds bloom into
    // each other naturally.
    const nebulaTextures: THREE.Texture[] = [];
    const nebulaMaterials: THREE.SpriteMaterial[] = [];
    const nebulas: Array<{
      sprite: THREE.Sprite;
      driftAxis: THREE.Vector3;
      spinSpeed: number;
    }> = [];
    const themeColors = theme.nebulaColors;
    // Build a palette: 0 primary, 1 secondary (hue-shifted +30°),
    // 2 tertiary (near-black for depth contrast).
    const palette = [
      themeColors[0],
      hueShift(themeColors[0], 30),
      themeColors[2],
    ];
    for (let i = 0; i < NEBULA_COUNT; i++) {
      const colorPick = palette[i % palette.length]!;
      const fadeColor = colorPick + "00";
      const tex = makeRadialGradientTexture(256, colorPick + "ff", fadeColor);
      nebulaTextures.push(tex);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        // Tertiary clouds are near-black anchors, much lower opacity.
        opacity: i % palette.length === 2 ? 0.08 + Math.random() * 0.06 : 0.15 + Math.random() * 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      nebulaMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      // Spread across z: -50 to -200 per spec.
      const z = -50 - Math.random() * 150;
      const lateralSpread = 80 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      sprite.position.set(
        Math.cos(theta) * lateralSpread,
        (Math.random() - 0.5) * 80,
        z,
      );
      const scale = 80 + Math.random() * 140;
      sprite.scale.set(scale, scale, 1);
      sceneGroup.add(sprite);
      nebulas.push({
        sprite,
        driftAxis: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          0,
        ),
        spinSpeed: (Math.random() - 0.5) * 0.05,
      });
    }

    // --- Galaxy core: 4 concentric additive glow spheres + lights ----
    const coreCenter = new THREE.Vector3(0, 0, -500);
    const coreLight = new THREE.PointLight(theme.coreColor, 2.5, 600, 1.5);
    coreLight.position.copy(coreCenter);
    scene.add(coreLight);
    const coreSpot = new THREE.SpotLight(
      theme.coreColor,
      1.2,
      800,
      Math.PI / 6,
      0.4,
      1.5,
    );
    coreSpot.position.copy(coreCenter);
    coreSpot.target.position.set(0, 0, 0); // toward camera
    scene.add(coreSpot);
    scene.add(coreSpot.target);

    const coreGlowTex = makeStarTexture(256);
    const coreGlowSprites: THREE.Sprite[] = [];
    const coreGlowMats: THREE.SpriteMaterial[] = [];
    // Four shells: tightest brightest, growing larger and dimmer.
    const coreShells: Array<{ scale: number; opacity: number; color: number }> = [
      { scale: 50, opacity: 0.6, color: theme.coreColor },
      { scale: 100, opacity: 0.3, color: theme.coreColor },
      { scale: 180, opacity: 0.15, color: theme.coreHaloColor },
      { scale: 280, opacity: 0.06, color: theme.coreHaloColor },
    ];
    for (const shell of coreShells) {
      const mat = new THREE.SpriteMaterial({
        map: coreGlowTex,
        color: shell.color,
        transparent: true,
        opacity: shell.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      coreGlowMats.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(coreCenter);
      sprite.scale.set(shell.scale, shell.scale, 1);
      sceneGroup.add(sprite);
      coreGlowSprites.push(sprite);
    }

    // --- Asteroids: 40 with dramatic size variance + per-asteroid var
    const asteroidGeometries: THREE.IcosahedronGeometry[] = [];
    const asteroidMaterials: THREE.Material[] = [];
    const asteroids: AsteroidState[] = [];
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const closeRoll = Math.random();
      const isClose = closeRoll < 0.35;
      // Dramatic size variance: 0.2 → 3.0 with bias toward small.
      const sizeRoll = Math.random();
      const radius = 0.2 + Math.pow(sizeRoll, 2) * 2.8;

      const z = isClose ? -10 - Math.random() * 25 : -40 - Math.random() * 80;
      const lateralRange = isClose ? 12 : 40;

      // Higher-detail icosahedron + ±30% jitter — much chunkier rocks.
      const geo = new THREE.IcosahedronGeometry(radius, 2);
      const pos = geo.attributes.position;
      if (pos) {
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v);
          const y = pos.getY(v);
          const zz = pos.getZ(v);
          const jitter = 1 + (Math.random() - 0.5) * 0.6; // ±30%
          pos.setXYZ(v, x * jitter, y * jitter, zz * jitter);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
      }
      asteroidGeometries.push(geo);

      // Per-asteroid material variance — base from theme, ±15%
      // brightness, occasional brighter mineral-vein emissive flicker.
      const baseColor = new THREE.Color(theme.asteroidColor);
      const lightness = 0.85 + Math.random() * 0.3;
      baseColor.multiplyScalar(lightness);
      const emissive = new THREE.Color(theme.asteroidEmissive);
      // Some asteroids have stronger emissive (glowing veins).
      const emissiveBoost = Math.random() < 0.3 ? 2.0 : 0.5;
      emissive.multiplyScalar(emissiveBoost);

      const mat = new THREE.MeshPhongMaterial({
        color: baseColor,
        shininess: 8 + Math.random() * 16,
        specular: theme.asteroidSpecular,
        emissive,
        emissiveIntensity: 0.6,
      });
      asteroidMaterials.push(mat);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * lateralRange * 2,
        (Math.random() - 0.5) * lateralRange * 2,
        z,
      );
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      sceneGroup.add(mesh);

      const baseSpeed = isClose ? 6 + Math.random() * 8 : 1.5 + Math.random() * 3;
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        baseSpeed,
      );

      asteroids.push({
        mesh,
        velocity,
        spinAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
        spinSpeed: 0.2 + Math.random() * 0.8,
      });
    }

    // --- Lighting (asteroid surfaces) -------------------------------
    const keyLight = new THREE.DirectionalLight(theme.keyLightColor, 1.0);
    keyLight.position.set(0, 0, -1);
    scene.add(keyLight);
    const ambient = new THREE.AmbientLight(theme.ambientColor, 0.5);
    scene.add(ambient);

    // --- Random events: shooting stars / supernovas / clusters /
    // pulsar beams / space station silhouettes ----------------------
    const shootingStars: Array<{
      line: THREE.Line;
      geo: THREE.BufferGeometry;
      mat: THREE.LineBasicMaterial;
      ttl: number;
      velocity: THREE.Vector3;
      head: THREE.Vector3;
      tail: THREE.Vector3;
    }> = [];
    const supernovas: Array<{
      sprite: THREE.Sprite;
      mat: THREE.SpriteMaterial;
      tex: THREE.Texture;
      age: number;
      duration: number;
      maxScale: number;
    }> = [];
    const pulsars: Array<{
      group: THREE.Group;
      beamMesh: THREE.Mesh;
      geo: THREE.PlaneGeometry;
      mat: THREE.MeshBasicMaterial;
      age: number;
      duration: number;
    }> = [];
    const stations: Array<{
      mesh: THREE.Mesh;
      geo: THREE.BoxGeometry;
      mat: THREE.MeshBasicMaterial;
      velocity: THREE.Vector3;
      ttl: number;
    }> = [];

    function spawnShootingStar() {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(6);
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      const startX = Math.random() < 0.5 ? -60 : 60;
      const startY = -30 + Math.random() * 60;
      const startZ = -60 - Math.random() * 60;
      const head = new THREE.Vector3(startX, startY, startZ);
      const dir = new THREE.Vector3(
        startX > 0 ? -1 : 1,
        (Math.random() - 0.5) * 0.7,
        0.3,
      ).normalize();
      const speed = 80 + Math.random() * 60;
      const velocity = dir.multiplyScalar(speed);
      const tail = head.clone().addScaledVector(velocity, -0.05);
      sceneGroup.add(line);
      shootingStars.push({ line, geo, mat, ttl: 1.4, velocity, head, tail });
    }

    function spawnSupernova() {
      const tex = makeStarTexture(128);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: theme.coreColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const r = 80 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      sprite.position.set(
        r * Math.cos(theta),
        (Math.random() - 0.5) * 60,
        -Math.abs(r * Math.sin(theta)) - 60,
      );
      sprite.scale.set(1, 1, 1);
      sceneGroup.add(sprite);
      supernovas.push({
        sprite,
        mat,
        tex,
        age: 0,
        duration: 2.5,
        maxScale: 60 + Math.random() * 40,
      });
    }

    function spawnAsteroidCluster() {
      // Spawn 8-12 small rocks in a tight formation ahead of camera.
      const center = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        camera.position.z - 50,
      );
      const count = 8 + Math.floor(Math.random() * 5);
      for (let j = 0; j < count && j < asteroids.length; j++) {
        const a = asteroids[j]!;
        a.mesh.position.set(
          center.x + (Math.random() - 0.5) * 5,
          center.y + (Math.random() - 0.5) * 5,
          center.z + (Math.random() - 0.5) * 8,
        );
        a.velocity.z = 8 + Math.random() * 4;
      }
    }

    function spawnPulsarBeam() {
      // A thin glowing plane that rotates once across the scene.
      const group = new THREE.Group();
      const beamLen = 600;
      const geo = new THREE.PlaneGeometry(beamLen, 0.3);
      const mat = new THREE.MeshBasicMaterial({
        color: theme.coreColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(geo, mat);
      group.add(beam);
      // Position the pulsar somewhere off in the distance.
      const r = 150 + Math.random() * 150;
      const theta = Math.random() * Math.PI * 2;
      group.position.set(
        Math.cos(theta) * r,
        (Math.random() - 0.5) * 80,
        -Math.abs(Math.sin(theta)) * r - 80,
      );
      // Random initial rotation.
      group.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2,
      );
      sceneGroup.add(group);
      pulsars.push({
        group,
        beamMesh: beam,
        geo,
        mat,
        age: 0,
        duration: 3,
      });
    }

    function spawnSpaceStation() {
      // An angular dark silhouette drifting past — built from a
      // single elongated box with low opacity. Just a shape, no
      // detail. Works because it occludes the bloom behind it.
      const geo = new THREE.BoxGeometry(8, 1.5, 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.85,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const startSide = Math.random() < 0.5 ? -1 : 1;
      mesh.position.set(
        startSide * 60,
        (Math.random() - 0.5) * 25,
        -40 - Math.random() * 30,
      );
      mesh.rotation.set(
        Math.random() * 0.4,
        Math.random() * Math.PI * 2,
        Math.random() * 0.2,
      );
      const velocity = new THREE.Vector3(
        startSide * -3 - Math.random() * 2,
        (Math.random() - 0.5) * 0.5,
        2 + Math.random(),
      );
      sceneGroup.add(mesh);
      stations.push({ mesh, geo, mat, velocity, ttl: 25 });
    }

    // --- Web Audio: ambient drone + warp rumble ---------------------
    let audioCtx: AudioContext | null = null;
    let masterGain: GainNode | null = null;
    let warpGain: GainNode | null = null;
    let oscDrone: OscillatorNode | null = null;
    let oscMid: OscillatorNode | null = null;
    let oscShimmer: OscillatorNode | null = null;
    let lfo: OscillatorNode | null = null;
    let oscRumble: OscillatorNode | null = null;

    try {
      const Ctx = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (Ctx) {
        audioCtx = new Ctx();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0; // fade in below
        masterGain.connect(audioCtx.destination);

        // 40Hz drone.
        oscDrone = audioCtx.createOscillator();
        oscDrone.type = "sine";
        oscDrone.frequency.value = 40;
        const droneGain = audioCtx.createGain();
        droneGain.gain.value = 0.6;
        oscDrone.connect(droneGain);
        droneGain.connect(masterGain);

        // 120Hz mid hum.
        oscMid = audioCtx.createOscillator();
        oscMid.type = "sine";
        oscMid.frequency.value = 120;
        const midGain = audioCtx.createGain();
        midGain.gain.value = 0.25;
        oscMid.connect(midGain);
        midGain.connect(masterGain);

        // 800Hz shimmer with LFO.
        oscShimmer = audioCtx.createOscillator();
        oscShimmer.type = "sine";
        oscShimmer.frequency.value = 800;
        lfo = audioCtx.createOscillator();
        lfo.frequency.value = 0.3;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 8;
        lfo.connect(lfoGain);
        lfoGain.connect(oscShimmer.frequency);
        const shimmerGain = audioCtx.createGain();
        shimmerGain.gain.value = 0.15;
        oscShimmer.connect(shimmerGain);
        shimmerGain.connect(masterGain);

        // Warp rumble — silent until warp triggers.
        warpGain = audioCtx.createGain();
        warpGain.gain.value = 0;
        warpGain.connect(audioCtx.destination);
        oscRumble = audioCtx.createOscillator();
        oscRumble.type = "sine";
        oscRumble.frequency.value = 80;
        oscRumble.connect(warpGain);

        oscDrone.start();
        oscMid.start();
        oscShimmer.start();
        lfo.start();
        oscRumble.start();

        // Many browsers suspend AudioContext until a user gesture.
        // Resume opportunistically — if it stays suspended, the
        // mute button click will resume it.
        audioCtx.resume().catch(() => {
          /* will be resumed on first user interaction */
        });

        // Fade master gain to 0.05 over 2 seconds.
        const targetGain = 0.05;
        const startTime = audioCtx.currentTime;
        masterGain.gain.setValueAtTime(0, startTime);
        masterGain.gain.linearRampToValueAtTime(targetGain, startTime + 2);
      }
    } catch {
      /* Audio init failed — continue silently. The scene still works. */
    }

    // --- Interaction state -----------------------------------------
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    const lookVelocity = new THREE.Vector2(0, 0);
    const lookRotation = new THREE.Vector2(0, 0);

    let forwardSpeed = FORWARD_SPEED_DEFAULT;
    let forwardSpeedTarget = FORWARD_SPEED_DEFAULT;

    /** Warp seconds remaining (0 = inactive). */
    let warpRemaining = 0;
    const WARP_DURATION = 1.5;

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(e.pointerId);
      // Browsers gate audio start on user gesture — resume here.
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
      lookRotation.x += dx * 0.003;
      lookRotation.y += dy * 0.003;
      lookVelocity.set(dx * 0.003 * 60, dy * 0.003 * 60);
    }
    function onPointerUp(e: PointerEvent) {
      dragging = false;
      renderer.domElement.style.cursor = "grab";
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* ok */
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      forwardSpeedTarget = Math.max(
        FORWARD_SPEED_MIN,
        Math.min(FORWARD_SPEED_MAX, forwardSpeedTarget - e.deltaY * 0.0001),
      );
    }
    function onDoubleClick() {
      warpRemaining = WARP_DURATION;
      // Warp rumble: ramp 0 → 0.3 → 0 across the warp duration.
      if (audioCtx && warpGain) {
        const t0 = audioCtx.currentTime;
        warpGain.gain.cancelScheduledValues(t0);
        warpGain.gain.setValueAtTime(0, t0);
        warpGain.gain.linearRampToValueAtTime(0.3, t0 + 0.3);
        warpGain.gain.linearRampToValueAtTime(0.3, t0 + WARP_DURATION - 0.3);
        warpGain.gain.linearRampToValueAtTime(0, t0 + WARP_DURATION);
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

    // --- Animation loop --------------------------------------------
    const clock = new THREE.Clock();
    let elapsed = 0;
    let nextEventAt = 10 + Math.random() * 10;
    let rafHandle = 0;
    let cancelled = false;

    let slowFrames = 0;
    let degradedNear = false;

    function shake(t: number, axis: number): number {
      return (
        Math.sin(t * 1.31 + axis * 7.2) * 0.5 +
        Math.sin(t * 0.51 + axis * 3.1) * 0.5
      );
    }

    function tick() {
      if (cancelled) return;
      if (document.hidden) {
        rafHandle = requestAnimationFrame(tick);
        return;
      }
      const frameStart = performance.now();
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      // Audio gain follows audioEnabledRef without restarting oscs.
      if (audioCtx && masterGain) {
        const target = audioEnabledRef.current ? 0.05 : 0;
        // Smooth ramp avoids click. Skip if already there.
        if (Math.abs(masterGain.gain.value - target) > 0.001) {
          masterGain.gain.linearRampToValueAtTime(target, audioCtx.currentTime + 0.2);
        }
      }

      forwardSpeed += (forwardSpeedTarget - forwardSpeed) * 0.06;

      // Warp envelope: speed ramps to 15×, streaks to 8×, vignette
      // and chromatic aberration pulse, camera shake amplifies.
      let speedMult = 1;
      let streakMult = 1;
      let warpStrength = 0;
      let warpShake = 0;
      if (warpRemaining > 0) {
        const phase = WARP_DURATION - warpRemaining;
        // 0 → 0.2: ramp in
        // 0.2 → 1.3: hold
        // 1.3 → 1.5: ramp out
        if (phase < 0.2) {
          const t = phase / 0.2;
          speedMult = 1 + t * 14; // 1 → 15
          streakMult = 1 + t * 7; // 1 → 8
          warpStrength = t;
          warpShake = t * 0.6;
        } else if (phase < 1.3) {
          speedMult = 15;
          streakMult = 8;
          warpStrength = 1;
          warpShake = 0.6;
        } else {
          const t = (WARP_DURATION - phase) / 0.2;
          speedMult = 1 + t * 14;
          streakMult = 1 + t * 7;
          warpStrength = t;
          warpShake = t * 0.6;
        }
        warpRemaining -= dt;
      }
      vignettePass.uniforms.strength.value = warpStrength;

      // Forward drift.
      camera.position.z -= forwardSpeed * speedMult * 60 * dt;

      // Camera oscillation — small floating offset + warp shake noise.
      camera.position.x = shake(elapsed, 0) * 0.04 + (Math.random() - 0.5) * warpShake;
      camera.position.y = shake(elapsed, 1) * 0.04 + (Math.random() - 0.5) * warpShake;

      // Look-around with inertia.
      sceneGroup.rotation.y = lookRotation.x;
      sceneGroup.rotation.x = lookRotation.y;
      if (!dragging) {
        lookRotation.x += lookVelocity.x * dt * 0.3;
        lookRotation.y += lookVelocity.y * dt * 0.3;
        lookVelocity.multiplyScalar(0.93);
      }

      // Recycle mid stars (per group).
      const cz = camera.position.z;
      for (const g of midGroups) {
        const positions = g.geo.attributes.position;
        if (!positions) continue;
        for (let i = 0; i < g.count; i++) {
          const z = positions.getZ(i);
          if (z > cz + 5) {
            positions.setX(i, (Math.random() - 0.5) * 200);
            positions.setY(i, (Math.random() - 0.5) * 200);
            positions.setZ(i, cz - MID_RANGE_Z);
          }
        }
        positions.needsUpdate = true;
      }

      // Recycle near streaks.
      {
        const positions = nearStarsGeo.attributes.position;
        if (positions) {
          const streakLen = STREAK_LEN_FACTOR * streakMult;
          for (let i = 0; i < STAR_COUNT_NEAR; i++) {
            const s = nearStarSegments[i]!;
            s.posA.z += s.velocity.z * dt * speedMult;
            if (s.posA.z > cz + 4) {
              s.posA.x = (Math.random() - 0.5) * 80;
              s.posA.y = (Math.random() - 0.5) * 80;
              s.posA.z = cz - NEAR_RANGE_Z;
            }
            s.posB.copy(s.posA).addScaledVector(s.velocity, -streakLen);
            const off = i * 6;
            positions.array[off] = s.posA.x;
            positions.array[off + 1] = s.posA.y;
            positions.array[off + 2] = s.posA.z;
            positions.array[off + 3] = s.posB.x;
            positions.array[off + 4] = s.posB.y;
            positions.array[off + 5] = s.posB.z;
          }
          positions.needsUpdate = true;
        }
      }

      // Asteroids.
      for (const a of asteroids) {
        a.mesh.position.addScaledVector(a.velocity, dt * speedMult);
        a.mesh.rotateOnAxis(a.spinAxis, a.spinSpeed * dt);
        if (a.mesh.position.z > camera.position.z + 4) {
          const isClose = Math.random() < 0.35;
          a.mesh.position.set(
            (Math.random() - 0.5) * (isClose ? 20 : 70),
            (Math.random() - 0.5) * (isClose ? 20 : 70),
            camera.position.z - (isClose ? 30 : 100),
          );
        }
      }

      // Nebulas.
      for (const n of nebulas) {
        n.sprite.position.addScaledVector(n.driftAxis, dt);
        n.sprite.material.rotation += n.spinSpeed * dt;
        if (n.sprite.position.z > camera.position.z + 60) {
          const r = 80 + Math.random() * 200;
          const theta = Math.random() * Math.PI * 2;
          n.sprite.position.set(
            r * Math.cos(theta),
            (Math.random() - 0.5) * 80,
            camera.position.z - 100 - Math.random() * 200,
          );
        }
      }

      // Galaxy core position relative to camera.
      coreCenter.set(0, 0, camera.position.z - 500);
      coreLight.position.copy(coreCenter);
      coreSpot.position.copy(coreCenter);
      coreSpot.target.position.set(0, 0, camera.position.z);
      for (const sprite of coreGlowSprites) sprite.position.copy(coreCenter);

      // Random events.
      if (elapsed >= nextEventAt) {
        const roll = Math.random();
        if (roll < 0.3) spawnShootingStar();
        else if (roll < 0.55) spawnSupernova();
        else if (roll < 0.75) spawnAsteroidCluster();
        else if (roll < 0.9) spawnPulsarBeam();
        else spawnSpaceStation();
        nextEventAt = elapsed + 10 + Math.random() * 10;
      }

      // Update shooting stars.
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i]!;
        s.ttl -= dt;
        s.head.addScaledVector(s.velocity, dt);
        s.tail.copy(s.head).addScaledVector(s.velocity, -0.06);
        const positions = s.geo.attributes.position;
        if (positions) {
          positions.array[0] = s.head.x;
          positions.array[1] = s.head.y;
          positions.array[2] = s.head.z;
          positions.array[3] = s.tail.x;
          positions.array[4] = s.tail.y;
          positions.array[5] = s.tail.z;
          positions.needsUpdate = true;
        }
        s.mat.opacity = Math.max(0, s.ttl / 1.4);
        if (s.ttl <= 0) {
          sceneGroup.remove(s.line);
          s.geo.dispose();
          s.mat.dispose();
          shootingStars.splice(i, 1);
        }
      }

      // Supernovas.
      for (let i = supernovas.length - 1; i >= 0; i--) {
        const s = supernovas[i]!;
        s.age += dt;
        const t = s.age / s.duration;
        if (t >= 1) {
          sceneGroup.remove(s.sprite);
          s.mat.dispose();
          s.tex.dispose();
          supernovas.splice(i, 1);
          continue;
        }
        const scale = t * s.maxScale;
        s.sprite.scale.set(scale, scale, 1);
        s.mat.opacity = Math.sin(t * Math.PI) * 0.9;
      }

      // Pulsar beams: rotate once over duration, opacity bell-curve.
      for (let i = pulsars.length - 1; i >= 0; i--) {
        const p = pulsars[i]!;
        p.age += dt;
        const t = p.age / p.duration;
        if (t >= 1) {
          sceneGroup.remove(p.group);
          p.geo.dispose();
          p.mat.dispose();
          pulsars.splice(i, 1);
          continue;
        }
        // Sweep: rotate the group around its local Z.
        p.group.rotation.z += dt * 1.2;
        // Opacity: bell curve, peaks mid-sweep.
        p.mat.opacity = Math.sin(t * Math.PI) * 0.7;
      }

      // Stations: drift across, dispose when far past.
      for (let i = stations.length - 1; i >= 0; i--) {
        const s = stations[i]!;
        s.ttl -= dt;
        s.mesh.position.addScaledVector(s.velocity, dt);
        s.mesh.rotation.y += dt * 0.05;
        if (s.ttl <= 0 || s.mesh.position.z > camera.position.z + 10) {
          sceneGroup.remove(s.mesh);
          s.geo.dispose();
          s.mat.dispose();
          stations.splice(i, 1);
        }
      }

      composer.render();

      // Auto-degrade.
      const frameMs = performance.now() - frameStart;
      if (frameMs > 20) {
        slowFrames++;
        if (slowFrames > 3 && !degradedNear) {
          degradedNear = true;
          farStarsMat.opacity *= 0.5;
        }
      } else {
        slowFrames = 0;
      }

      rafHandle = requestAnimationFrame(tick);
    }
    rafHandle = requestAnimationFrame(tick);

    // --- Cleanup ----------------------------------------------------
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

      // Audio: fade out and dispose.
      try {
        if (audioCtx && masterGain) {
          masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
        }
        oscDrone?.stop();
        oscMid?.stop();
        oscShimmer?.stop();
        lfo?.stop();
        oscRumble?.stop();
        if (audioCtx) {
          // Close after fade-out window.
          window.setTimeout(() => {
            audioCtx?.close().catch(() => {});
          }, 600);
        }
      } catch {
        /* best-effort */
      }

      farStarsGeo.dispose();
      farStarsMat.dispose();
      for (const g of midGroups) {
        g.geo.dispose();
        g.mat.dispose();
      }
      nearStarsGeo.dispose();
      nearStarsMat.dispose();
      starTextureWhite.dispose();
      starTextureWarmWhite.dispose();
      starTextureCoolBlue.dispose();
      starTextureFaintYellow.dispose();
      coreGlowTex.dispose();
      for (const m of coreGlowMats) m.dispose();
      for (const t of nebulaTextures) t.dispose();
      for (const m of nebulaMaterials) m.dispose();
      for (const g of asteroidGeometries) g.dispose();
      for (const m of asteroidMaterials) m.dispose();
      for (const s of shootingStars) {
        s.geo.dispose();
        s.mat.dispose();
      }
      for (const s of supernovas) {
        s.mat.dispose();
        s.tex.dispose();
      }
      for (const p of pulsars) {
        p.geo.dispose();
        p.mat.dispose();
      }
      for (const s of stations) {
        s.geo.dispose();
        s.mat.dispose();
      }
      composer.dispose();
      renderer.dispose();
      try {
        container.removeChild(renderer.domElement);
      } catch {
        /* already removed */
      }
    };
    // We intentionally don't include brokerName / audioEnabled in the
    // deps array — both are read via refs so changing them post-mount
    // doesn't tear down and rebuild the entire scene. The theme
    // re-applies on the next mount (i.e. next sync flow).
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
