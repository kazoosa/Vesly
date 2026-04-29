import { useEffect, useState } from "react";
import { ApertureOverlay } from "./ApertureOverlay";

/**
 * Localhost preview shell for the Aperture overlay v2 (the 26-shot
 * timeline). Mounted only when ?preview=overlay is in the URL AND
 * we're in a dev build (gated by import.meta.env.DEV in App.tsx).
 *
 * Keyboard shortcuts:
 *   1..9   — jump to and play shot #N (1=first shot, 9=ninth, etc.)
 *   0      — jump to the radar hold shot (Shot 23) and let it
 *            settle into hold mode
 *   r      — reset to t=0
 *   .      — jump forward 5 seconds
 *   ,      — jump backward 5 seconds
 *   c      — fire the white-flash completion (sets syncComplete)
 *
 * Note: shots play through to the next one. To "stop on phase 2 and
 * stare," press the number for the shot you want and don't press
 * anything else; the overlay will play that shot and continue. If
 * you want true pause-on-shot, the preview would need a paused-time
 * flag passed into the overlay — happy to add later.
 *
 * Mock state lives in the constants below — edit one place to
 * change broker theme / counts / starting position.
 */

// ---- Mock state — edit these to tune the preview ------------------
const MOCK_BROKER_NAME = "Robinhood"; // try "Fidelity", "Schwab", "TD Ameritrade", null
const MOCK_ACCOUNTS = 2;
const MOCK_HOLDINGS = 28;
const MOCK_TRANSACTIONS = 919;

// Cumulative-millisecond start times for each shot, computed to match
// the TIMELINE array in ApertureOverlay.tsx. If you change durations
// there, update this list too.
const SHOT_START_MS = [
  0,        // 1 — black void
  3000,     // 2 — astronomical chart
  13000,    // 3 — blueprint workshop
  21000,    // 4 — girl with lantern
  24000,    // 5 — planetarium
  32000,    // 6 — telescope dolly
  36000,    // 7 — first flash
  36400,    // 8 — starfield window
  48400,    // 9 — dual viewports
  54400,    // 10 — collage
  60400,    // 11 — monochrome interior
  68400,    // 12 — hanging moons
  72400,    // 13 — cracked porthole
  74400,    // 14 — girl looking up
  78400,    // 15 — fast transitions
  82400,    // 16 — flight a
  86400,    // 17 — flight b
  90400,    // 18 — flight c
  94400,    // 19 — minimal
  97400,    // 20 — twin orbs
  101400,   // 21 — red beam
  105400,   // 22 — radial burst
  109400,   // 23 — radar (hold state)
];

export function ApertureOverlayPreview() {
  // Remount key — the overlay tracks its own elapsed time internally
  // via performance.now() and a startRef set on mount, so the only
  // way to "scrub" or "reset" cleanly is to remount with a different
  // key. We store an offset in localStorage-style state and append
  // it to the key.
  const [remountSeed, setRemountSeed] = useState(0);
  const [syncComplete, setSyncComplete] = useState(false);
  // Time-offset: every press of `1..9` etc. sets a new offset and
  // bumps the remount seed. The overlay reads the offset on mount
  // via __previewOffsetMs, so a remount jumps the timeline.
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Number keys 1..9 jump to shot N.
      if (/^[1-9]$/.test(e.key)) {
        const n = parseInt(e.key, 10) - 1;
        if (n < SHOT_START_MS.length) {
          e.preventDefault();
          setOffsetMs(SHOT_START_MS[n]!);
          setSyncComplete(false);
          setRemountSeed((s) => s + 1);
        }
        return;
      }

      switch (e.key) {
        case "r":
        case "R":
          e.preventDefault();
          setOffsetMs(0);
          setSyncComplete(false);
          setRemountSeed((s) => s + 1);
          break;
        case ".":
        case ">":
          e.preventDefault();
          setOffsetMs((o) => o + 5000);
          setRemountSeed((s) => s + 1);
          break;
        case ",":
        case "<":
          e.preventDefault();
          setOffsetMs((o) => Math.max(0, o - 5000));
          setRemountSeed((s) => s + 1);
          break;
        case "c":
        case "C":
          e.preventDefault();
          setSyncComplete(true);
          break;
        case "0":
          // Jump to radar hold (last entry in SHOT_START_MS).
          e.preventDefault();
          setOffsetMs(SHOT_START_MS[SHOT_START_MS.length - 1]!);
          setSyncComplete(false);
          setRemountSeed((s) => s + 1);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <ApertureOverlay
        // Remount on seed change so startRef re-initializes with
        // the new offset. Without remount, startRef sticks at its
        // first value and seeking does nothing.
        key={remountSeed}
        __previewOffsetMs={offsetMs}
        brokerName={MOCK_BROKER_NAME}
        accountsCount={MOCK_ACCOUNTS}
        holdingsCount={MOCK_HOLDINGS}
        transactionsCount={MOCK_TRANSACTIONS}
        syncComplete={syncComplete}
        onClose={() => {
          // After the flash, reset the preview so we can play again.
          window.setTimeout(() => {
            setSyncComplete(false);
            setOffsetMs(0);
            setRemountSeed((s) => s + 1);
          }, 600);
        }}
      />
      {/* Legend at very bottom-right */}
      <div
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 9999,
          color: "#888",
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          background: "rgba(0,0,0,0.6)",
          padding: "6px 12px",
          borderRadius: 4,
          pointerEvents: "none",
          maxWidth: 460,
          textAlign: "right",
          lineHeight: 1.6,
        }}
      >
        1–9 jump to shot · 0 radar hold · , . scrub ±5s · c flash · r reset
      </div>
    </>
  );
}

export default ApertureOverlayPreview;
