import { useEffect, useState } from "react";
import { ApertureOverlay, type Phase } from "./ApertureOverlay";

/**
 * Localhost preview shell for the Aperture overlay. Mounted only when
 * `?preview=overlay` is in the URL AND we're in a dev build (gated
 * by import.meta.env.DEV — never ships to prod).
 *
 * Keyboard shortcuts:
 *   1 / 2 / 3   — jump to and HOLD that phase. Does not auto-advance.
 *   0           — jump to the "done" phase (post-flash steady state).
 *   space       — trigger the photographic white flash.
 *   r           — reset to phase 1.
 *
 * Mock state lives in the constants below — edit one place to change
 * what you see in the preview without re-running anything.
 */

// ---- Mock state — edit these to tune the preview ------------------
const MOCK_BROKER_NAME = "Robinhood"; // try "Fidelity", "Schwab", "TD Ameritrade", null
const MOCK_ACCOUNTS = 2;
const MOCK_HOLDINGS = 28;
const MOCK_TRANSACTIONS = 919;
const MOCK_WAIT_SECONDS_AT_PHASE_2 = 47; // what the timer reads when you land on phase 2
const MOCK_MESSAGE = "Connecting to your broker";

export function ApertureOverlayPreview() {
  const [phase, setPhase] = useState<Phase>(1);
  const [flashing, setFlashing] = useState(false);
  // Live timer that ticks once a second while on phase 2 so the
  // bottom-right counter actually moves while you stare at it.
  const [waitTick, setWaitTick] = useState(0);

  useEffect(() => {
    if (phase !== 2) {
      setWaitTick(0);
      return;
    }
    const id = window.setInterval(() => setWaitTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't intercept when the user is typing somewhere — though
      // this preview replaces the whole page so there's nothing to
      // type in. Belt + braces.
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case "1":
          setPhase(1);
          break;
        case "2":
          setPhase(2);
          break;
        case "3":
          setPhase(3);
          break;
        case "0":
          setPhase("done");
          break;
        case " ":
        case "Spacebar":
          e.preventDefault();
          setFlashing(true);
          // Hold the flashing flag for the full peak+fade window so
          // the overlay's internal timeline runs, then clear it so
          // it's re-triggerable on the next press.
          window.setTimeout(() => setFlashing(false), 600);
          break;
        case "r":
        case "R":
          setPhase(1);
          setFlashing(false);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pick an effective wait-seconds value:
  //  - phase 2: starting offset + live tick
  //  - else: undefined (overlay shows "—")
  const waitSeconds =
    phase === 2 ? MOCK_WAIT_SECONDS_AT_PHASE_2 + waitTick : undefined;

  return (
    <>
      <ApertureOverlay
        phase={phase}
        brokerName={MOCK_BROKER_NAME}
        waitSeconds={waitSeconds}
        flashing={flashing}
        accountsCount={MOCK_ACCOUNTS}
        holdingsCount={MOCK_HOLDINGS}
        transactionsCount={
          phase === 3 || phase === "done" ? MOCK_TRANSACTIONS : 0
        }
        message={MOCK_MESSAGE}
      />
      {/* Tiny dev-mode legend so I don't have to remember the keys
          every time I open the preview. Stays at the very bottom-
          right of the viewport, above the letterbox. Faint. */}
      <div
        style={{
          position: "fixed",
          right: 12,
          bottom: 48,
          zIndex: 9999,
          color: "#888",
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          background: "rgba(0,0,0,0.4)",
          padding: "6px 10px",
          borderRadius: 4,
          pointerEvents: "none",
        }}
      >
        1·2·3 phase · 0 done · space flash · r reset
      </div>
    </>
  );
}

export default ApertureOverlayPreview;
