import { useState, useEffect, useRef, useCallback } from "react";

export interface TimelineItem {
  id: number;
  title: string;
  date: string;
  content: string;
  category: string;
  icon: React.ElementType;
  // kept for backwards compatibility with existing data — no longer used
  relatedIds?: number[];
  status?: "completed" | "in-progress" | "pending";
  energy?: number;
}

interface RadialOrbitalTimelineProps {
  timelineData: TimelineItem[];
}

/**
 * Orbital timeline — simpler, sturdier version.
 *
 * Changes vs previous:
 *   - No click-to-expand card stuck on a node (that pattern was the source
 *     of the "spinning freeze": once expanded, rotation paused, and if the
 *     user never clicked back on the bare container the orbit stayed stuck).
 *   - Description is shown in a central, persistent info panel that updates
 *     on hover / tap / focus.
 *   - Auto-cycles the active step every 4s so the thing feels alive even
 *     without interaction.
 *   - Rotation pauses ONLY while the user is actively hovering/touching a
 *     node. An idle-timer safety net (800ms) always resumes rotation —
 *     it's impossible to leave it frozen.
 *   - Removed Progress bar + Next/Previous buttons (per design direction).
 *   - Honors prefers-reduced-motion: static layout, no rotation.
 */
export default function RadialOrbitalTimeline({ timelineData }: RadialOrbitalTimelineProps) {
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [activeId, setActiveId] = useState<number>(timelineData[0]?.id ?? 1);
  const [inView, setInView] = useState<boolean>(true);
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);
  const [radius, setRadius] = useState<number>(200);

  // Interaction state lives in refs so it never triggers re-renders.
  // isPaused = user is currently hovering/touching a node.
  // A timer resumes rotation 800ms after the user stops interacting, so
  // even if a mouseleave event gets swallowed the orbit always recovers.
  const isPausedRef = useRef<boolean>(false);
  const resumeTimerRef = useRef<number | null>(null);
  const maxPauseTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Respect reduced-motion preference.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  // Stop rAF when scrolled out of view.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Adapt orbit radius to container width — keeps nodes inside the frame on
  // phones without forcing a layout shift on desktop.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      // Clamp so labels still breathe: min 130px (tight phone), max 220px.
      const r = Math.max(130, Math.min(220, w * 0.32));
      setRadius(r);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rotation loop — paused while user interacts or off-screen.
  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!isPausedRef.current && inView) {
        // ~0.1°/16ms ≈ 60s per full rotation. Slow, ambient.
        setRotationAngle((prev) => (prev + (dt / 16) * 0.1) % 360);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduceMotion]);

  // Auto-cycle the active step every 4s while no-one's interacting, so the
  // center detail panel keeps updating without any user action.
  useEffect(() => {
    const int = window.setInterval(() => {
      if (isPausedRef.current) return;
      setActiveId((prev) => {
        const idx = timelineData.findIndex((i) => i.id === prev);
        const next = timelineData[(idx + 1) % timelineData.length];
        return next?.id ?? prev;
      });
    }, 4000);
    return () => window.clearInterval(int);
  }, [timelineData]);

  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      isPausedRef.current = false;
    }, 800);
  }, []);

  const handleNodeEnter = useCallback(
    (id: number) => {
      isPausedRef.current = true;
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      // Hard safety net: even if mouseleave never fires, force resume after
      // 6 seconds of continuous hover. Prevents the "stuck spinning" bug
      // entirely.
      if (maxPauseTimerRef.current) window.clearTimeout(maxPauseTimerRef.current);
      maxPauseTimerRef.current = window.setTimeout(() => {
        isPausedRef.current = false;
      }, 6000);
      setActiveId(id);
    },
    [],
  );

  const handleNodeLeave = useCallback(() => {
    scheduleResume();
  }, [scheduleResume]);

  // Safety: on any container-wide mouseleave, always schedule resume.
  const handleContainerLeave = useCallback(() => {
    scheduleResume();
  }, [scheduleResume]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
      if (maxPauseTimerRef.current) window.clearTimeout(maxPauseTimerRef.current);
    };
  }, []);

  const calculateNodePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radian = (angle * Math.PI) / 180;
    const x = radius * Math.cos(radian);
    const y = radius * Math.sin(radian);
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Math.max(0.55, Math.min(1, 0.55 + 0.45 * ((1 + Math.sin(radian)) / 2)));
    return { x, y, angle, zIndex, opacity };
  };

  const activeItem =
    timelineData.find((i) => i.id === activeId) ?? timelineData[0];

  return (
    <div
      ref={containerRef}
      onMouseLeave={handleContainerLeave}
      className="relative w-full h-[560px] sm:h-[600px] rounded-2xl overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06),transparent_60%),linear-gradient(180deg,#0a0a0c,#050507)] border border-white/10"
    >
      {/* Top-left hint */}
      <div className="absolute top-5 left-5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 select-none">
        Beacon flow · hover a node
      </div>

      {/* Step chip, top-right */}
      <div className="absolute top-5 right-5 text-[10px] sm:text-[11px] font-mono tracking-widest text-white/55 select-none">
        {String(activeItem?.id ?? 1).padStart(2, "0")} / {String(timelineData.length).padStart(2, "0")}
      </div>

      <div className="relative w-full h-full flex items-center justify-center">
        {/* Soft glow rings — sized off the dynamic radius */}
        <div
          className="pointer-events-none absolute rounded-full border border-white/10"
          style={{ width: radius * 2.1, height: radius * 2.1 }}
        />
        <div
          className="pointer-events-none absolute rounded-full border border-white/5"
          style={{ width: radius * 1.5, height: radius * 1.5 }}
        />

        {/* Center info panel — replaces the per-node expand card */}
        <div className="relative z-[120] w-[56vw] max-w-[280px] min-w-[180px] min-h-[180px] px-4 py-5 sm:px-5 sm:py-6 rounded-2xl text-center bg-white/5 border border-white/15 backdrop-blur-md shadow-[0_8px_40px_-8px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/55 mb-3">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Step {activeItem?.id} · {activeItem?.date}
          </div>
          <h3
            key={`title-${activeItem?.id}`}
            className="text-white text-lg sm:text-xl font-semibold tracking-tight mb-2 animate-[orbitalFade_400ms_ease-out]"
          >
            {activeItem?.title}
          </h3>
          <p
            key={`body-${activeItem?.id}`}
            className="text-white/75 text-sm leading-relaxed animate-[orbitalFade_500ms_ease-out]"
          >
            {activeItem?.content}
          </p>
        </div>

        {/* Orbiting nodes */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ perspective: "1000px" }}
        >
          {timelineData.map((item, index) => {
            const position = calculateNodePosition(index, timelineData.length);
            const isActive = item.id === activeId;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.title}: ${item.content}`}
                aria-pressed={isActive}
                onMouseEnter={() => handleNodeEnter(item.id)}
                onMouseLeave={handleNodeLeave}
                onFocus={() => handleNodeEnter(item.id)}
                onBlur={handleNodeLeave}
                onClick={() => handleNodeEnter(item.id)}
                onTouchStart={() => handleNodeEnter(item.id)}
                onTouchEnd={handleNodeLeave}
                className="absolute group outline-none"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px)`,
                  zIndex: isActive ? 200 : position.zIndex,
                  opacity: position.opacity,
                  willChange: "transform",
                  transition: "opacity 400ms ease",
                }}
              >
                {/* Node circle */}
                <div
                  className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    isActive
                      ? "bg-white text-black border-white shadow-[0_0_24px_rgba(255,255,255,0.45)] scale-110"
                      : "bg-black/70 text-white border-white/40 group-hover:border-white group-focus-visible:ring-2 group-focus-visible:ring-white/70"
                  }`}
                >
                  <Icon size={16} />
                  {/* Step number badge */}
                  <span
                    className={`absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center border ${
                      isActive
                        ? "bg-black text-white border-white"
                        : "bg-white text-black border-black/60"
                    }`}
                  >
                    {item.id}
                  </span>
                </div>
                {/* Label */}
                <div
                  className={`absolute top-[58px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] sm:text-xs font-semibold tracking-wider transition-colors duration-300 ${
                    isActive ? "text-white" : "text-white/60 group-hover:text-white/90"
                  }`}
                >
                  {item.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Local keyframes for fade-in of the center panel */}
      <style>{`
        @keyframes orbitalFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
