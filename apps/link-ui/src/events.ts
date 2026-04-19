/**
 * postMessage events sent from modal iframe → SDK parent.
 */
export type EventName =
  | "OPEN"
  | "SELECT_INSTITUTION"
  | "SUBMIT_CREDENTIALS"
  | "SUBMIT_MFA"
  | "HANDOFF"
  | "SUCCESS"
  | "EXIT"
  | "ERROR";

export function emit(name: EventName, payload: Record<string, unknown> = {}) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      { source: "finlink", name, payload },
      "*", // origin check done in SDK
    );
  }
}
