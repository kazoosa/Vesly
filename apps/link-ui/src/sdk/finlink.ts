/**
 * FinLink embed SDK. Usage:
 *
 *   const handler = FinLink.create({
 *     token: linkToken,
 *     onSuccess(public_token, metadata) { ... },
 *     onExit(err, metadata) { ... },
 *     onEvent(name, payload) { ... },
 *   });
 *   handler.open();
 */

export interface FinLinkCreateArgs {
  token: string;
  modalUrl?: string; // override for local dev
  onSuccess?: (publicToken: string, metadata: Record<string, unknown>) => void;
  onExit?: (err: Error | null, metadata: Record<string, unknown>) => void;
  onEvent?: (name: string, payload: Record<string, unknown>) => void;
}

export interface FinLinkHandler {
  open: () => void;
  exit: () => void;
  destroy: () => void;
}

interface IncomingMessage {
  source: "finlink";
  name: string;
  payload: Record<string, unknown>;
}

const DEFAULT_MODAL_URL = "http://localhost:5175";

function buildModalUrl(args: FinLinkCreateArgs) {
  const base = args.modalUrl ?? DEFAULT_MODAL_URL;
  const u = new URL(base);
  u.searchParams.set("token", args.token);
  return u.toString();
}

export function create(args: FinLinkCreateArgs): FinLinkHandler {
  let overlay: HTMLDivElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  const expectedOrigin = new URL(args.modalUrl ?? DEFAULT_MODAL_URL).origin;

  const messageHandler = (ev: MessageEvent<IncomingMessage>) => {
    if (ev.origin !== expectedOrigin) return;
    if (!ev.data || ev.data.source !== "finlink") return;
    const { name, payload } = ev.data;
    args.onEvent?.(name, payload);

    if (name === "SUCCESS") {
      const publicToken = String(payload.public_token ?? "");
      const metadata = (payload.metadata as Record<string, unknown>) ?? {};
      args.onSuccess?.(publicToken, metadata);
    }
    if (name === "EXIT") {
      args.onExit?.(null, payload);
      destroy();
    }
    if (name === "ERROR") {
      args.onExit?.(new Error(String(payload.code ?? "ERROR")), payload);
    }
  };

  function open() {
    if (overlay) return;
    overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: "rgba(2, 6, 23, 0.75)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backdropFilter: "blur(4px)",
    } satisfies Partial<CSSStyleDeclaration>);

    iframe = document.createElement("iframe");
    iframe.src = buildModalUrl(args);
    iframe.title = "Connect brokerage";
    iframe.allow = "clipboard-write; clipboard-read";
    Object.assign(iframe.style, {
      width: "100%",
      height: "100%",
      maxWidth: "440px",
      maxHeight: "640px",
      border: "0",
      outline: "0",
      borderRadius: "16px",
      boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      background: "#0a0e1a",
      backgroundColor: "#0a0e1a",
      colorScheme: "dark",
    } satisfies Partial<CSSStyleDeclaration>);

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
    window.addEventListener("message", messageHandler);
  }

  function exit() {
    args.onExit?.(null, { reason: "manual" });
    destroy();
  }

  function destroy() {
    window.removeEventListener("message", messageHandler);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    iframe = null;
  }

  return { open, exit, destroy };
}

// UMD-friendly default export shape: FinLink.create(...)
const FinLink = { create };
export default FinLink;

// When bundled as UMD with name="FinLink", Vite assigns the module's named exports
// to window.FinLink. Call pattern `FinLink.create(...)` works in both UMD and ESM.
if (typeof window !== "undefined") {
  (window as unknown as { FinLink: typeof FinLink }).FinLink = FinLink;
}
