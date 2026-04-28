import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * First-person galaxy fly-through. Rendered behind the sync overlay
 * during phases 2 (broker wait) and 3 (DB writes). The user is
 * floating in deep space, drifting toward a distant galaxy core,
 * with three layers of stars, nebula clouds, asteroid debris,
 * occasional shooting stars and supernova pulses.
 *
 * Lazy-loaded by PostConnectSyncOverlay so the three.js + post-
 * processing bundle only ships when the overlay actually mounts.
 *
 * Reduced-motion: parent skips mounting this entirely.
 */

// --- Tunables (per-frame budgets are the source of truth — counts
// here are starting values that may be reduced dynamically if frame
// time blows past 20ms; see auto-degrade in the rAF loop) -------------
const STAR_COUNT_FAR = 5000;
const STAR_COUNT_MID = 1500;
const STAR_COUNT_NEAR = 500;
const NEBULA_COUNT = 10;
const ASTEROID_COUNT = 25;

const FORWARD_SPEED_MIN = 0.005;
const FORWARD_SPEED_MAX = 0.15;
const FORWARD_SPEED_DEFAULT = 0.02;

// --- Programmatic textures ------------------------------------------
// We don't ship any image assets — every texture is generated at
// runtime via 2D canvas so the lazy chunk has zero asset deps.

function makeRadialGradientTexture(
  size: number,
  innerColor: string,
  outerColor: string,
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.4, innerColor);
  grad.addColorStop(1, outerColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft round disc — base sprite for stars and the galaxy-core glow. */
function makeStarTexture(size = 64): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Nebula colors per spec.
const NEBULA_COLORS: [string, string][] = [
  ["#9020e0", "#4a0080"], // deep purple
  ["#3060ff", "#0040ff"], // electric blue
  ["#10a0a0", "#004a4a"], // teal
];

interface AsteroidState {
  mesh: THREE.Mesh;
  /** World-space velocity in units/sec. Some far+slow, some close+fast. */
  velocity: THREE.Vector3;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
}

interface NearStarState {
  /** Endpoint A in world space — the streak's leading point. */
  posA: THREE.Vector3;
  /** Endpoint B in world space — the streak's trailing point.
   *  velocity vector × streakLen behind posA. */
  posB: THREE.Vector3;
  velocity: THREE.Vector3;
}

export function SpaceScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = () => container.clientWidth;
    const H = () => container.clientHeight;

    // --- Renderer + composer setup ---------------------------------
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

    // sceneGroup holds everything user-rotatable (look-around). The
    // camera and bloom passes stay in world space.
    const sceneGroup = new THREE.Group();
    scene.add(sceneGroup);

    // Bloom pipeline. Bloom is what makes this look cinematic vs
    // "cool starfield demo". Tuned conservatively — too aggressive
    // and white stars smear into a milky haze.
    const composer = new EffectComposer(renderer);
    composer.setSize(W(), H());
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(W(), H()),
      0.9, // strength
      0.6, // radius
      0.15, // threshold (only pixels brighter than this bloom)
    );
    composer.addPass(bloomPass);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // --- Star textures (shared across all star layers) -------------
    const starTexture = makeStarTexture(64);

    // --- Layer 1: 5,000 distant tiny stars (nearly stationary) ------
    const farStarPositions = new Float32Array(STAR_COUNT_FAR * 3);
    for (let i = 0; i < STAR_COUNT_FAR; i++) {
      // Distribute on a sphere shell well behind the working volume.
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
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: starTexture,
    });
    const farStars = new THREE.Points(farStarsGeo, farStarsMat);
    sceneGroup.add(farStars);

    // --- Layer 2: 1,500 mid-distance stars ----------------------
    // Recycled in a forward-Z range so they appear to drift past as
    // the camera moves. Each cycle wraps Z back to "ahead of camera".
    const MID_RANGE_Z = 200;
    const midStarPositions = new Float32Array(STAR_COUNT_MID * 3);
    for (let i = 0; i < STAR_COUNT_MID; i++) {
      midStarPositions[i * 3] = (Math.random() - 0.5) * 200;
      midStarPositions[i * 3 + 1] = (Math.random() - 0.5) * 200;
      midStarPositions[i * 3 + 2] = -Math.random() * MID_RANGE_Z;
    }
    const midStarsGeo = new THREE.BufferGeometry();
    midStarsGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(midStarPositions, 3),
    );
    const midStarsMat = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: true,
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: starTexture,
    });
    const midStars = new THREE.Points(midStarsGeo, midStarsMat);
    sceneGroup.add(midStars);

    // --- Layer 3: 500 close stars rendered as motion-blur streaks ---
    // We use THREE.LineSegments (one segment per star). The segment
    // is `velocity * STREAK_LEN` long, trailing behind the head
    // position. Recycled in Z just like the mid-distance layer.
    const NEAR_RANGE_Z = 80;
    const STREAK_LEN_FACTOR = 6; // streak length per unit speed
    const nearStarSegments: NearStarState[] = [];
    const nearStarPositions = new Float32Array(STAR_COUNT_NEAR * 6); // 2 verts per segment
    const nearStarColors = new Float32Array(STAR_COUNT_NEAR * 6);
    for (let i = 0; i < STAR_COUNT_NEAR; i++) {
      const x = (Math.random() - 0.5) * 80;
      const y = (Math.random() - 0.5) * 80;
      const z = -Math.random() * NEAR_RANGE_Z;
      // Velocity points toward +Z (i.e. AT the camera). The faster
      // the streak, the longer; baseline is set so close stars
      // visibly streak when forward drift is at default.
      const speed = 0.6 + Math.random() * 1.4;
      const velocity = new THREE.Vector3(0, 0, speed);
      const posA = new THREE.Vector3(x, y, z);
      const posB = posA
        .clone()
        .addScaledVector(velocity, -STREAK_LEN_FACTOR);
      nearStarSegments.push({ posA, posB, velocity });

      const off = i * 6;
      nearStarPositions[off] = posA.x;
      nearStarPositions[off + 1] = posA.y;
      nearStarPositions[off + 2] = posA.z;
      nearStarPositions[off + 3] = posB.x;
      nearStarPositions[off + 4] = posB.y;
      nearStarPositions[off + 5] = posB.z;

      // Streak fades from white (at head) to transparent (at tail)
      // — vertex colors. Tail color is set lower-alpha by halving.
      // We can only encode RGB in vertex colors; opacity comes from
      // the material. Approximate the fade by darkening the tail
      // vertex color to ~0.2 instead.
      nearStarColors[off] = 1;
      nearStarColors[off + 1] = 1;
      nearStarColors[off + 2] = 1;
      nearStarColors[off + 3] = 0.2;
      nearStarColors[off + 4] = 0.2;
      nearStarColors[off + 5] = 0.2;
    }
    const nearStarsGeo = new THREE.BufferGeometry();
    nearStarsGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(nearStarPositions, 3),
    );
    nearStarsGeo.setAttribute(
      "color",
      new THREE.BufferAttribute(nearStarColors, 3),
    );
    const nearStarsMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const nearStars = new THREE.LineSegments(nearStarsGeo, nearStarsMat);
    sceneGroup.add(nearStars);

    // --- Nebula clouds (8-12 large additive billboards) -------------
    const nebulaTextures: THREE.Texture[] = [];
    const nebulaMaterials: THREE.SpriteMaterial[] = [];
    const nebulas: Array<{
      sprite: THREE.Sprite;
      driftAxis: THREE.Vector3;
      spinSpeed: number;
    }> = [];
    for (let i = 0; i < NEBULA_COUNT; i++) {
      const colorPair = NEBULA_COLORS[i % NEBULA_COLORS.length]!;
      const tex = makeRadialGradientTexture(
        256,
        colorPair[0] + "ff",
        colorPair[1] + "00",
      );
      nebulaTextures.push(tex);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.15 + Math.random() * 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      nebulaMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      const r = 80 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      sprite.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        // Bias nebulas in front of the camera so they're in the
        // line of travel — gives the feeling of flying through them.
        -Math.abs(r * Math.cos(phi)) - 50,
      );
      const scale = 80 + Math.random() * 120;
      sprite.scale.set(scale, scale, 1);
      sceneGroup.add(sprite);
      nebulas.push({
        sprite,
        driftAxis: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          0,
        ),
        spinSpeed: (Math.random() - 0.5) * 0.05,
      });
    }

    // --- Galaxy core (bright distant glow) --------------------------
    const coreLight = new THREE.PointLight(0xfff8d0, 2.5, 600, 1.5);
    coreLight.position.set(0, 0, -500);
    scene.add(coreLight);
    const coreGlowTex = makeStarTexture(256);
    const coreGlowMat = new THREE.SpriteMaterial({
      map: coreGlowTex,
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreGlow = new THREE.Sprite(coreGlowMat);
    coreGlow.position.copy(coreLight.position);
    coreGlow.scale.set(70, 70, 1);
    sceneGroup.add(coreGlow);
    // Larger, dimmer outer halo for additional bloom contribution.
    const coreHaloMat = new THREE.SpriteMaterial({
      map: coreGlowTex,
      color: 0x9090ff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreHalo = new THREE.Sprite(coreHaloMat);
    coreHalo.position.copy(coreLight.position);
    coreHalo.scale.set(180, 180, 1);
    sceneGroup.add(coreHalo);

    // --- Asteroids/debris -------------------------------------------
    const asteroidGeometries: THREE.IcosahedronGeometry[] = [];
    const asteroidMaterials: THREE.Material[] = [];
    const asteroids: AsteroidState[] = [];
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const closeRoll = Math.random();
      // Some close+fast, some far+slow.
      const isClose = closeRoll < 0.35;
      const z = isClose
        ? -10 - Math.random() * 25
        : -40 - Math.random() * 80;
      const lateralRange = isClose ? 10 : 35;
      const radius = isClose ? 0.3 + Math.random() * 0.6 : 0.8 + Math.random() * 1.5;

      const geo = new THREE.IcosahedronGeometry(radius, 1);
      // Roughen — same trick as before so debris looks natural.
      const pos = geo.attributes.position;
      if (pos) {
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v);
          const y = pos.getY(v);
          const zz = pos.getZ(v);
          const jitter = 1 + (Math.random() - 0.5) * 0.3;
          pos.setXYZ(v, x * jitter, y * jitter, zz * jitter);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
      }
      asteroidGeometries.push(geo);

      // Slight color variance — orange-red surfaces per spec.
      const tint = new THREE.Color().setHSL(
        0.04 + Math.random() * 0.06,
        0.5 + Math.random() * 0.3,
        0.25 + Math.random() * 0.15,
      );
      const mat = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.95,
        metalness: 0.05,
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

      // Velocity: mostly toward camera (+Z), with small lateral
      // drift. Close ones move faster than far ones.
      const baseSpeed = isClose ? 6 + Math.random() * 8 : 1.5 + Math.random() * 3;
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        baseSpeed,
      );

      asteroids.push({
        mesh,
        velocity,
        spinAxis: new THREE.Vector3(
          Math.random(),
          Math.random(),
          Math.random(),
        ).normalize(),
        spinSpeed: 0.2 + Math.random() * 0.8,
      });
    }

    // --- Lighting (for asteroid surfaces) ---------------------------
    // Key light coming from the galaxy core direction so asteroids
    // are lit consistently with where the bright source is.
    const keyLight = new THREE.DirectionalLight(0xfff0c0, 1.0);
    keyLight.position.set(0, 0, -1);
    scene.add(keyLight);
    const ambient = new THREE.AmbientLight(0x404060, 0.4);
    scene.add(ambient);

    // --- Shooting stars (one-shot meteor lines) ---------------------
    const shootingStars: Array<{
      line: THREE.Line;
      geo: THREE.BufferGeometry;
      mat: THREE.LineBasicMaterial;
      ttl: number; // seconds remaining
      velocity: THREE.Vector3;
      head: THREE.Vector3;
      tail: THREE.Vector3;
    }> = [];

    function spawnShootingStar() {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(6); // 2 verts
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      // Start near the edge of the field of view, off to one side.
      const startX = Math.random() < 0.5 ? -60 : 60;
      const startY = -30 + Math.random() * 60;
      const startZ = -60 - Math.random() * 60;
      const head = new THREE.Vector3(startX, startY, startZ);
      // Move diagonally across — toward the opposite side, slight
      // forward bias.
      const dir = new THREE.Vector3(
        startX > 0 ? -1 : 1,
        (Math.random() - 0.5) * 0.7,
        0.3,
      ).normalize();
      const speed = 80 + Math.random() * 60;
      const velocity = dir.multiplyScalar(speed);
      const tail = head.clone().addScaledVector(velocity, -0.05);
      sceneGroup.add(line);
      shootingStars.push({
        line,
        geo,
        mat,
        ttl: 1.4,
        velocity,
        head,
        tail,
      });
    }

    // --- Supernova pulses (radial flash) ----------------------------
    const supernovas: Array<{
      sprite: THREE.Sprite;
      mat: THREE.SpriteMaterial;
      tex: THREE.Texture;
      age: number; // seconds since spawn
      duration: number;
      maxScale: number;
    }> = [];

    function spawnSupernova() {
      const tex = makeStarTexture(128);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0xffe0b0,
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
        duration: 2,
        maxScale: 60 + Math.random() * 40,
      });
    }

    // --- Interaction state -----------------------------------------
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    /** Angular velocity for the look-around rotation (radians/sec). */
    const lookVelocity = new THREE.Vector2(0, 0);
    /** Current look-rotation (Euler-style, applied to sceneGroup). */
    const lookRotation = new THREE.Vector2(0, 0);

    let forwardSpeed = FORWARD_SPEED_DEFAULT;
    let forwardSpeedTarget = FORWARD_SPEED_DEFAULT;

    /** Warp effect: when active, multiply near-star streak length and
     *  forward speed for ~1.5s. */
    let warpRemaining = 0;

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      // dx → rotate around Y. dy → rotate around X. Scale by a
      // gentle factor so a screen-width drag is ~half a rotation.
      lookRotation.x += dx * 0.003;
      lookRotation.y += dy * 0.003;
      lookVelocity.set(dx * 0.003 * 60, dy * 0.003 * 60); // in per-sec equivalents
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
      // Wheel up (negative deltaY) → speed up; wheel down → slow.
      forwardSpeedTarget = Math.max(
        FORWARD_SPEED_MIN,
        Math.min(
          FORWARD_SPEED_MAX,
          forwardSpeedTarget - e.deltaY * 0.0001,
        ),
      );
    }
    function onDoubleClick() {
      warpRemaining = 1.5;
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
    let nextEventAt = 15 + Math.random() * 15;
    let rafHandle = 0;
    let cancelled = false;

    // Auto-degrade: if frame time exceeds 20ms three times in a row,
    // halve the near-star count by hiding half of them. Avoids the
    // bigger surgery of disposing/rebuilding.
    let slowFrames = 0;
    let degradedNear = false;

    // Subtle camera shake — small position noise per frame so the
    // floating-in-space feel doesn't go static when the user isn't
    // dragging.
    function shake(t: number, axis: number): number {
      // Cheap pseudo-noise: sum of sins at irrational frequencies.
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
      const dt = Math.min(clock.getDelta(), 0.05); // clamp at 50ms to keep math sane
      elapsed += dt;

      // Forward speed eases toward target (smoother than instant).
      forwardSpeed += (forwardSpeedTarget - forwardSpeed) * 0.06;

      // Warp decay.
      let speedMult = 1;
      let streakMult = 1;
      if (warpRemaining > 0) {
        // Ramp in fast, hold, then snap back.
        const phase = 1.5 - warpRemaining;
        if (phase < 0.2) speedMult = 1 + (phase / 0.2) * 7; // 1 → 8
        else if (phase < 1.3) speedMult = 8;
        else speedMult = 8 - ((phase - 1.3) / 0.2) * 7; // back to 1
        streakMult = speedMult;
        warpRemaining -= dt;
      }

      // Forward drift: move camera toward -Z. We move the CAMERA
      // (not the sceneGroup) so look-around rotation stays sane.
      camera.position.z -= forwardSpeed * speedMult * 60 * dt;

      // Camera shake — tiny floating offset.
      camera.position.x = shake(elapsed, 0) * 0.04;
      camera.position.y = shake(elapsed, 1) * 0.04;

      // Look-around: apply rotation deltas to sceneGroup and decay
      // velocity if the user isn't actively dragging (inertia).
      sceneGroup.rotation.y = lookRotation.x;
      sceneGroup.rotation.x = lookRotation.y;
      if (!dragging) {
        // Inertia: continue rotating after release; decelerate.
        lookRotation.x += lookVelocity.x * dt * 0.3;
        lookRotation.y += lookVelocity.y * dt * 0.3;
        lookVelocity.multiplyScalar(0.93);
      }

      // Recycle mid-distance stars: any star that's slipped behind
      // the camera (z > camera.z + small slack) gets re-spawned
      // ahead of the camera at -Z.
      {
        const positions = midStarsGeo.attributes.position;
        if (positions) {
          const cz = camera.position.z;
          for (let i = 0; i < STAR_COUNT_MID; i++) {
            const z = positions.getZ(i);
            if (z > cz + 5) {
              positions.setX(i, (Math.random() - 0.5) * 200);
              positions.setY(i, (Math.random() - 0.5) * 200);
              positions.setZ(i, cz - MID_RANGE_Z);
            }
          }
          positions.needsUpdate = true;
        }
      }

      // Recycle + advance near-star streaks. Each streak's posA
      // advances by velocity*dt; posB trails by velocity*streakLen.
      // When posA passes the camera, recycle ahead.
      {
        const positions = nearStarsGeo.attributes.position;
        if (positions) {
          const cz = camera.position.z;
          const streakLen = STREAK_LEN_FACTOR * streakMult;
          for (let i = 0; i < STAR_COUNT_NEAR; i++) {
            const s = nearStarSegments[i]!;
            // Per-frame position update — velocity in z is "speed" the
            // star approaches at, so a positive z-velocity means
            // approaching the camera (camera moves -Z, world stays).
            // We add velocity * dt to posA.z (so star's z goes from
            // -N toward 0). When it crosses the camera, recycle.
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

      // Asteroids: drift toward camera, recycle when they pass.
      for (const a of asteroids) {
        a.mesh.position.addScaledVector(a.velocity, dt * speedMult);
        a.mesh.rotateOnAxis(a.spinAxis, a.spinSpeed * dt);
        if (a.mesh.position.z > camera.position.z + 4) {
          // Recycle ahead.
          const isClose = Math.random() < 0.35;
          a.mesh.position.set(
            (Math.random() - 0.5) * (isClose ? 20 : 70),
            (Math.random() - 0.5) * (isClose ? 20 : 70),
            camera.position.z - (isClose ? 30 : 100),
          );
        }
      }

      // Nebula clouds: gentle drift + spin.
      for (const n of nebulas) {
        n.sprite.position.addScaledVector(n.driftAxis, dt);
        n.sprite.material.rotation += n.spinSpeed * dt;
        // Recycle if it falls behind.
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

      // Galaxy core sits at fixed Z relative to camera so we keep
      // approaching but never reach it. The sense of destination
      // matters, the actual arrival doesn't.
      coreLight.position.z = camera.position.z - 500;
      coreGlow.position.copy(coreLight.position);
      coreHalo.position.copy(coreLight.position);

      // Random events.
      if (elapsed >= nextEventAt) {
        const roll = Math.random();
        if (roll < 0.5) spawnShootingStar();
        else if (roll < 0.8) spawnSupernova();
        else {
          // Cluster of 5 asteroids — find slow asteroids and respawn
          // them as a tight group.
          for (let i = 0; i < 5 && i < asteroids.length; i++) {
            const a = asteroids[i]!;
            a.mesh.position.set(
              (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 6,
              camera.position.z - 50,
            );
            a.velocity.z = 8 + Math.random() * 4;
          }
        }
        nextEventAt = elapsed + 15 + Math.random() * 15;
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

      // Update supernova pulses.
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
        // Scale ramps from 0 → max across the duration.
        const scale = t * s.maxScale;
        s.sprite.scale.set(scale, scale, 1);
        // Opacity peaks early and fades — bell shape.
        s.mat.opacity = Math.sin(t * Math.PI) * 0.9;
      }

      composer.render();

      // Auto-degrade.
      const frameMs = performance.now() - frameStart;
      if (frameMs > 20) {
        slowFrames++;
        if (slowFrames > 3 && !degradedNear) {
          degradedNear = true;
          // Hide far stars (least visually critical) — keep the
          // streaks and mid layer. Three.js has no per-vertex
          // visibility on Points without rebuilding, so just lower
          // the material opacity by half rather than deleting verts.
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

      // Dispose every geometry, material, texture. Three.js doesn't
      // GC GPU-side resources; missing this leaks memory until reload.
      farStarsGeo.dispose();
      farStarsMat.dispose();
      midStarsGeo.dispose();
      midStarsMat.dispose();
      nearStarsGeo.dispose();
      nearStarsMat.dispose();
      starTexture.dispose();
      coreGlowTex.dispose();
      coreGlowMat.dispose();
      coreHaloMat.dispose();
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
      composer.dispose();
      renderer.dispose();
      try {
        container.removeChild(renderer.domElement);
      } catch {
        /* already removed */
      }
    };
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
