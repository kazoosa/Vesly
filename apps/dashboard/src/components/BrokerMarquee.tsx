import { useEffect, useRef } from "react";
import { brokerLogos, BrokerWordmark } from "./BrokerLogos";

/**
 * Auto-scrolling broker row that's ALSO a real scroll container.
 *
 * The earlier CSS-animation version couldn't be dragged or swiped — the
 * row was a fixed-transform track. This one is a plain `overflow-x: auto`
 * container so native drag, wheel, touch-swipe, and flick all work. A
 * small rAF loop nudges `scrollLeft` forward when no one's touching it;
 * any user interaction pauses the loop and it resumes after a short
 * idle, so it never fights the user.
 *
 * When the scroll reaches the end of the first copy of the list, we
 * seamlessly jump back by the same width so the loop feels infinite.
 */
export function BrokerMarquee() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLDivElement>(null);
  const pausedUntilRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; scrollLeft: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    const first = firstRef.current;
    if (!el || !first) return;

    let raf = 0;
    let last = performance.now();
    const SPEED_PX_PER_SEC = 28;   // gentle drift
    const PAUSE_MS = 1500;         // how long to wait after a user interaction

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const paused = isDraggingRef.current || now < pausedUntilRef.current;
      if (!paused && !reduce) {
        el.scrollLeft += SPEED_PX_PER_SEC * dt;
      }
      // Seamless loop: when we've scrolled past one full copy, wrap back.
      const loopWidth = first.scrollWidth;
      if (loopWidth > 0) {
        if (el.scrollLeft >= loopWidth) el.scrollLeft -= loopWidth;
        else if (el.scrollLeft < 0)     el.scrollLeft += loopWidth;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const pause = () => { pausedUntilRef.current = performance.now() + PAUSE_MS; };

    // Any organic interaction pauses the auto-scroll
    const onWheel = () => pause();
    const onPointerEnter = () => pause();
    const onTouchMove = () => pause();
    el.addEventListener("wheel",        onWheel, { passive: true });
    el.addEventListener("mouseenter",   onPointerEnter);
    el.addEventListener("touchmove",    onTouchMove, { passive: true });

    // Drag to scroll (mouse) — pointer events give us a unified handler
    const onPointerDown = (e: PointerEvent) => {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, scrollLeft: el.scrollLeft };
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      el.scrollLeft = dragStartRef.current.scrollLeft - dx;
    };
    const stopDrag = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      dragStartRef.current = null;
      el.releasePointerCapture?.(e.pointerId);
      el.style.cursor = "";
      el.style.userSelect = "";
      pausedUntilRef.current = performance.now() + PAUSE_MS;
    };

    el.addEventListener("pointerdown",   onPointerDown);
    el.addEventListener("pointermove",   onPointerMove);
    el.addEventListener("pointerup",     stopDrag);
    el.addEventListener("pointercancel", stopDrag);
    el.addEventListener("pointerleave",  stopDrag);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mouseenter", onPointerEnter);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", stopDrag);
      el.removeEventListener("pointercancel", stopDrag);
      el.removeEventListener("pointerleave", stopDrag);
    };
  }, []);

  return (
    <div
      ref={scrollRef}
      role="list"
      aria-label="Supported brokerages — drag to scroll"
      className="stripe-marquee-mask overflow-x-auto overscroll-x-contain scrollbar-none cursor-grab"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {/* Hide the scrollbar in WebKit too */}
      <style>{`
        [aria-label="Supported brokerages — drag to scroll"]::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <div className="flex w-max">
        {/* Two identical copies so we can loop seamlessly without a gap. */}
        <div ref={firstRef} className="flex items-center gap-14 pr-14">
          {brokerLogos.map((logo) => (
            <div key={`a-${logo.name}`} role="listitem">
              <BrokerWordmark logo={logo} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-14 pr-14" aria-hidden>
          {brokerLogos.map((logo) => (
            <div key={`b-${logo.name}`}>
              <BrokerWordmark logo={logo} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
