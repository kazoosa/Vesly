import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Interactive 3D space scene rendered behind the sync overlay during
 * the broker-wait + DB-write phases. Gives the user something to play
 * with during the unavoidable Robinhood broker-side wait — drag
 * asteroids, rotate the scene, scroll to zoom.
 *
 * Lazy-loaded via React.lazy from PostConnectSyncOverlay so the ~150KB
 * three.js bundle doesn't ship with the rest of the dashboard. The
 * scene mounts only during phases 2 and 3 of the sync flow; phase 1
 * (initial sync) is too short to bother and phase 4 dismisses the
 * overlay entirely.
 *
 * Reduced-motion: the parent component checks the media query and
 * skips mounting this entirely. We don't render anything to honor it
 * here — that's the caller's job.
 */

const STAR_COUNT = 2000;
const ASTEROID_COUNT = 15;

/** Hex literals as integers — Three.js wants 0xRRGGBB. */
const COLOR_BG = 0x020818;
const COLOR_ASTEROID = 0x4a4a6a;
const COLOR_PLANET_PURPLE = 0x2d1b69;
const COLOR_PLANET_TEAL = 0x0d3d4a;

interface AsteroidState {
  mesh: THREE.Mesh;
  driftAxis: THREE.Vector3;
  driftSpeed: number;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
  /** When the user releases a drag, we keep the asteroid moving with
   *  this velocity (in world units per second) and decay it 0.95×/frame
   *  until it settles. */
  releaseVelocity: THREE.Vector3;
  /** Hover-pulse target scale. Lerped toward each frame. */
  hoverScaleTarget: number;
  /** Current visual scale. */
  currentScale: number;
}

export function SpaceScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Scene + renderer setup ---------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR_BG);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      200,
    );
    camera.position.set(0, 0, 20);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(COLOR_BG, 1);
    container.appendChild(renderer.domElement);

    // sceneGroup holds everything user-rotatable (asteroids, planets,
    // stars). Dragging empty space rotates this group; the camera and
    // lights stay fixed in world space.
    const sceneGroup = new THREE.Group();
    scene.add(sceneGroup);

    // --- Star field ---------------------------------------------
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);
    const starSizes = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Distribute stars on a large sphere shell around the camera.
      const r = 60 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      // Color: white to pale blue, biased toward white.
      const blueShift = Math.random();
      starColors[i * 3] = 0.85 + Math.random() * 0.15;
      starColors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
      starColors[i * 3 + 2] = 0.95 + blueShift * 0.05;
      starSizes[i] = 0.5 + Math.random() * 1.5;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    starGeo.setAttribute("size", new THREE.BufferAttribute(starSizes, 1));
    const starMat = new THREE.PointsMaterial({
      size: 1.2,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    sceneGroup.add(stars);

    // --- Asteroids ----------------------------------------------
    const asteroidGeometries: THREE.IcosahedronGeometry[] = [];
    const asteroidMaterials: THREE.Material[] = [];
    const asteroids: AsteroidState[] = [];
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const geo = new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.9, 1);
      // Roughen the geometry ±15% per vertex so the icosahedron
      // looks like a natural rock instead of a perfect die.
      const pos = geo.attributes.position;
      if (pos) {
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v);
          const y = pos.getY(v);
          const z = pos.getZ(v);
          const jitter = 1 + (Math.random() - 0.5) * 0.3;
          pos.setXYZ(v, x * jitter, y * jitter, z * jitter);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
      }
      asteroidGeometries.push(geo);

      const mat = new THREE.MeshStandardMaterial({
        color: COLOR_ASTEROID,
        roughness: 0.9,
        metalness: 0.1,
      });
      asteroidMaterials.push(mat);

      const mesh = new THREE.Mesh(geo, mat);
      // Random position 8-25 units from origin.
      const r = 8 + Math.random() * 17;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      mesh.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      sceneGroup.add(mesh);

      asteroids.push({
        mesh,
        driftAxis: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
        ).normalize(),
        driftSpeed: 0.05 + Math.random() * 0.1,
        spinAxis: new THREE.Vector3(
          Math.random(),
          Math.random(),
          Math.random(),
        ).normalize(),
        spinSpeed: 0.1 + Math.random() * 0.4,
        releaseVelocity: new THREE.Vector3(),
        hoverScaleTarget: 1,
        currentScale: 1,
      });
    }

    // --- Planets (3 of them, far away) --------------------------
    const planetGeometries: THREE.SphereGeometry[] = [];
    const planetMaterials: THREE.Material[] = [];
    const glowMaterials: THREE.Material[] = [];
    const planets: Array<{ mesh: THREE.Mesh; spinSpeed: number }> = [];
    const planetSpecs = [
      { color: COLOR_PLANET_PURPLE, radius: 4.5, distance: 50 },
      { color: COLOR_PLANET_TEAL, radius: 3.2, distance: 55 },
      { color: COLOR_PLANET_PURPLE, radius: 2.6, distance: 45 },
    ];
    for (const spec of planetSpecs) {
      const geo = new THREE.SphereGeometry(spec.radius, 32, 32);
      planetGeometries.push(geo);
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: 0.8,
        metalness: 0,
      });
      planetMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      mesh.position.set(
        spec.distance * Math.sin(phi) * Math.cos(theta),
        spec.distance * Math.sin(phi) * Math.sin(theta) * 0.4, // squash so they tend toward the equatorial band
        spec.distance * Math.cos(phi),
      );
      sceneGroup.add(mesh);
      planets.push({ mesh, spinSpeed: 0.05 + Math.random() * 0.05 });

      // Cheap fake atmosphere — slightly larger sphere, low opacity.
      const glowGeo = new THREE.SphereGeometry(spec.radius * 1.08, 16, 16);
      planetGeometries.push(glowGeo);
      const glowMat = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      });
      glowMaterials.push(glowMat);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      mesh.add(glow);
    }

    // --- Lighting -----------------------------------------------
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 10, 5);
    scene.add(sun);
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambient);

    // --- Interaction state --------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    const lastPointerNDC = new THREE.Vector2();
    /** Which asteroid is currently being dragged (or null). */
    let grabbedAsteroid: AsteroidState | null = null;
    /** True while the user is dragging on empty space (rotating the scene). */
    let draggingScene = false;
    /** Velocity-based scene rotation — updated by drag, decays each frame. */
    const sceneRotationVelocity = new THREE.Vector2(0, 0);
    /** Last-known asteroid drag position to compute release velocity. */
    let lastGrabPos = new THREE.Vector3();
    /** Currently hovered asteroid (for cursor + pulse). */
    let hovered: AsteroidState | null = null;
    /** Camera Z target — scrolling animates toward this. */
    let cameraZTarget = 20;
    const CAMERA_Z_MIN = 10;
    const CAMERA_Z_MAX = 35;

    function updatePointerNDC(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickAsteroid(): AsteroidState | null {
      raycaster.setFromCamera(pointerNDC, camera);
      const meshes = asteroids.map((a) => a.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return null;
      const hitMesh = hits[0]!.object;
      return asteroids.find((a) => a.mesh === hitMesh) ?? null;
    }

    /** Project pointer NDC onto the plane at the grabbed asteroid's
     *  world Z, returning the world-space point the asteroid should
     *  follow. */
    function pointerOnDragPlane(zDepth: number): THREE.Vector3 {
      raycaster.setFromCamera(pointerNDC, camera);
      // Plane perpendicular to camera direction passing through z=zDepth.
      // Approximation: parameterize ray to land at world Z = zDepth.
      const origin = raycaster.ray.origin;
      const dir = raycaster.ray.direction;
      // origin.z + t * dir.z = zDepth  ->  t = (zDepth - origin.z) / dir.z
      if (Math.abs(dir.z) < 1e-6) return origin.clone();
      const t = (zDepth - origin.z) / dir.z;
      return origin.clone().addScaledVector(dir, t);
    }

    function onPointerDown(e: PointerEvent) {
      updatePointerNDC(e.clientX, e.clientY);
      lastPointerNDC.copy(pointerNDC);
      const asteroid = pickAsteroid();
      if (asteroid) {
        grabbedAsteroid = asteroid;
        lastGrabPos.copy(asteroid.mesh.position);
        renderer.domElement.style.cursor = "grabbing";
      } else {
        draggingScene = true;
        renderer.domElement.style.cursor = "grabbing";
      }
      renderer.domElement.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      const prev = pointerNDC.clone();
      updatePointerNDC(e.clientX, e.clientY);

      if (grabbedAsteroid) {
        const z = grabbedAsteroid.mesh.position.z;
        const target = pointerOnDragPlane(z);
        // Velocity = current - last per second of frame time. We
        // approximate using the position delta and let the frame
        // loop's clock-delta handle the actual time math when the
        // user releases.
        grabbedAsteroid.releaseVelocity
          .copy(target)
          .sub(grabbedAsteroid.mesh.position)
          .multiplyScalar(60); // assume 60fps for an instantaneous estimate
        grabbedAsteroid.mesh.position.copy(target);
        lastGrabPos.copy(target);
        return;
      }

      if (draggingScene) {
        // Rotate the scene group based on pointer NDC delta.
        // X delta -> rotate around Y axis. Y delta -> rotate around X.
        const dx = pointerNDC.x - prev.x;
        const dy = pointerNDC.y - prev.y;
        sceneGroup.rotation.y += dx * 1.2;
        sceneGroup.rotation.x += -dy * 1.2;
        sceneRotationVelocity.set(dx * 60, -dy * 60);
        return;
      }

      // Hover state — only relevant when not dragging.
      const hoverTarget = pickAsteroid();
      if (hoverTarget !== hovered) {
        if (hovered) hovered.hoverScaleTarget = 1;
        if (hoverTarget) hoverTarget.hoverScaleTarget = 1.05;
        hovered = hoverTarget;
        renderer.domElement.style.cursor = hoverTarget ? "grab" : "default";
      }
    }

    function onPointerUp(e: PointerEvent) {
      grabbedAsteroid = null;
      draggingScene = false;
      renderer.domElement.style.cursor = hovered ? "grab" : "default";
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer wasn't captured — fine */
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      // Zoom range CAMERA_Z_MIN..CAMERA_Z_MAX, smaller = closer.
      cameraZTarget = Math.max(
        CAMERA_Z_MIN,
        Math.min(CAMERA_Z_MAX, cameraZTarget + e.deltaY * 0.02),
      );
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    function onResize() {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener("resize", onResize);

    // --- Animation loop -----------------------------------------
    const clock = new THREE.Clock();
    let elapsed = 0;
    let rafHandle = 0;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      // Cap to 60fps using clock delta. If the tab is hidden, skip
      // doing any work (browsers throttle rAF anyway, but extra
      // belt-and-braces for older versions).
      const dt = clock.getDelta();
      if (document.hidden) {
        rafHandle = requestAnimationFrame(tick);
        return;
      }
      elapsed += dt;

      // Camera oscillation — gentle floating.
      camera.position.x = Math.sin(elapsed * 0.1) * 2;
      camera.position.y = Math.cos(elapsed * 0.07) * 1;
      // Smooth zoom toward target.
      camera.position.z += (cameraZTarget - camera.position.z) * 0.08;
      camera.lookAt(0, 0, 0);

      // Sun orbit — full rotation every 120s.
      const sunAngle = (elapsed / 120) * Math.PI * 2;
      sun.position.set(
        Math.cos(sunAngle) * 12,
        10,
        Math.sin(sunAngle) * 12,
      );

      // Star field gentle Y rotation.
      stars.rotation.y += 0.02 * dt;

      // Scene rotation velocity decay (post-release flywheel).
      if (!draggingScene) {
        sceneGroup.rotation.y += sceneRotationVelocity.x * dt * 0.5;
        sceneGroup.rotation.x += sceneRotationVelocity.y * dt * 0.5;
        sceneRotationVelocity.multiplyScalar(0.92);
      }

      // Asteroid drift + spin + release velocity decay + hover pulse.
      for (const a of asteroids) {
        // Skip drift while grabbed — the user is positioning it.
        if (a !== grabbedAsteroid) {
          // Apply release velocity (decays each frame).
          if (a.releaseVelocity.lengthSq() > 1e-4) {
            a.mesh.position.addScaledVector(a.releaseVelocity, dt);
            a.releaseVelocity.multiplyScalar(0.95);
          } else {
            a.mesh.position.addScaledVector(a.driftAxis, a.driftSpeed * dt);
            // Soft tether: if it drifts too far, bend it back toward origin.
            const distSq = a.mesh.position.lengthSq();
            if (distSq > 30 * 30) {
              a.mesh.position.multiplyScalar(0.99);
            }
          }
        }
        a.mesh.rotateOnAxis(a.spinAxis, a.spinSpeed * dt);

        // Hover pulse.
        a.currentScale += (a.hoverScaleTarget - a.currentScale) * 0.15;
        a.mesh.scale.setScalar(a.currentScale);
      }

      // Planet self-rotation.
      for (const p of planets) {
        p.mesh.rotation.y += p.spinSpeed * dt;
      }

      renderer.render(scene, camera);
      rafHandle = requestAnimationFrame(tick);
    }
    rafHandle = requestAnimationFrame(tick);

    // --- Cleanup ------------------------------------------------
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      // Geometry + material disposal — Three.js doesn't track these
      // by GC, so leaking them costs GPU memory until reload.
      starGeo.dispose();
      starMat.dispose();
      for (const g of asteroidGeometries) g.dispose();
      for (const m of asteroidMaterials) m.dispose();
      for (const g of planetGeometries) g.dispose();
      for (const m of planetMaterials) m.dispose();
      for (const m of glowMaterials) m.dispose();
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
