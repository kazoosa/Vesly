import { lazy, Suspense, useEffect, useRef } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { useKeepAlive } from "./lib/useKeepAlive";
import { ThemeProvider } from "./lib/theme";

// Localhost-only preview shell for the Aperture overlay. The lazy
// import is constructed only in dev — Vite tree-shakes the entire
// branch from prod builds because import.meta.env.DEV is replaced
// with the literal `false`, which collapses the conditional.
const ApertureOverlayPreview = import.meta.env.DEV
  ? lazy(() =>
      import("./components/ApertureOverlayPreview").then((m) => ({
        default: m.ApertureOverlayPreview,
      })),
    )
  : null;
import { Shell } from "./components/Shell";
import { PreviewLandingPage } from "./pages/PreviewLandingPage";
import { PreviewSignInPage } from "./pages/PreviewSignInPage";
import { DemoPage } from "./pages/DemoPage";
import { TermsPage, PrivacyPage } from "./pages/LegalPage";
import { ContactPage } from "./pages/ContactPage";
import { OverviewPage } from "./pages/OverviewPage";
import { HoldingsPage } from "./pages/HoldingsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { AddTransactionPage } from "./pages/AddTransactionPage";
import { ToastProvider } from "./components/Toast";
import { DividendsPage } from "./pages/DividendsPage";
import { AllocationPage } from "./pages/AllocationPage";
import { AccountsPage } from "./pages/AccountsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StocksPage } from "./pages/stocks/StocksPage";
import { OptionsPage } from "./pages/OptionsPage";

/**
 * Real-account guard. Anything under `/app/*` requires a real
 * (non-demo) session. A demo user who navigates to `/app/*` is sent
 * back to the equivalent `/demo/*` so URLs always reflect which
 * account is being browsed.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken, isDemo } = useAuth();
  const { pathname } = useLocation();
  // Keep Render warm while the user is on an authenticated page so
  // Refresh-now and other backend calls don't hit a 30s cold start.
  // Hook is no-op when accessToken is null. See useKeepAlive.ts.
  useKeepAlive(Boolean(accessToken) && !isDemo);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (isDemo) {
    const sub = pathname.replace(/^\/app/, "");
    return <Navigate to={`/demo${sub}`} replace />;
  }
  return <Shell>{children}</Shell>;
}

/**
 * Demo guard. `/demo/*` always shows the shared demo account in this
 * tab. If the visitor has no session, or has a real session in this
 * tab, we mint a fresh demo session in sessionStorage (real sessions
 * in OTHER tabs are unaffected — see lib/auth.tsx).
 */
function RequireDemo({ children }: { children: React.ReactNode }) {
  const { accessToken, isDemo, loginDemo } = useAuth();
  const startedRef = useRef(false);
  const needsDemo = !accessToken || !isDemo;

  useEffect(() => {
    if (!needsDemo) return;
    if (startedRef.current) return;
    startedRef.current = true;
    loginDemo().catch((err) => {
      console.error("demo login failed", err);
      startedRef.current = false;
    });
  }, [needsDemo, loginDemo]);

  if (needsDemo) {
    // Render the same loading screen the /demo entrypoint uses so the
    // experience is consistent whether the user clicked "Try the demo"
    // or pasted /demo/stocks directly.
    return <DemoPage />;
  }
  return <Shell>{children}</Shell>;
}

function RootRoute() {
  const { accessToken, isDemo } = useAuth();
  if (accessToken) return <Navigate to={isDemo ? "/demo" : "/app"} replace />;
  // First-time visitors hit / but the landing page lives at /landing —
  // redirect so the URL bar reflects "you're on the marketing site",
  // matching the rest of the site's URL hygiene.
  return <Navigate to="/landing" replace />;
}

const APP_ROUTES: Array<{ path: string; element: React.ReactNode }> = [
  { path: "", element: <OverviewPage /> },
  { path: "holdings", element: <HoldingsPage /> },
  { path: "stocks", element: <StocksPage /> },
  { path: "transactions", element: <TransactionsPage /> },
  { path: "transactions/new", element: <AddTransactionPage /> },
  { path: "dividends", element: <DividendsPage /> },
  { path: "options", element: <OptionsPage /> },
  { path: "allocation", element: <AllocationPage /> },
  { path: "accounts", element: <AccountsPage /> },
  { path: "settings", element: <SettingsPage /> },
];

export function App() {
  // ?preview=overlay — localhost-only preview shell for the Aperture
  // overlay. Short-circuits the entire app so I can iterate on the
  // overlay visuals without going through the connect-disconnect
  // cycle. Gated by import.meta.env.DEV so this code path is dead
  // in production builds — Vite tree-shakes the lazy import out.
  if (
    import.meta.env.DEV &&
    ApertureOverlayPreview &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "overlay"
  ) {
    return (
      <Suspense fallback={null}>
        <ApertureOverlayPreview />
      </Suspense>
    );
  }

  // Wake Render the moment the app mounts, regardless of auth state.
  // The first authenticated query after a cold-start hits a 3-5s
  // delay otherwise — by the time the user types their password the
  // backend is already warm. Hook is enabled unconditionally here;
  // duplicate pings from RequireAuth's keep-alive are harmless (both
  // hit the same /health endpoint) and there's no auth header
  // required.
  useKeepAlive(true);
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
        <Routes>
          {/* Public marketing routes */}
          <Route path="/" element={<RootRoute />} />
          {/* /landing always shows the marketing page, even when logged in —
              handy for previewing the site without logging out. */}
          <Route path="/landing" element={<PreviewLandingPage />} />
          <Route path="/login" element={<PreviewSignInPage />} />
          <Route path="/register" element={<PreviewSignInPage />} />

          {/* Legacy preview aliases — keep links in the wild working */}
          <Route path="/preview-landing" element={<Navigate to="/landing" replace />} />
          <Route path="/preview-signin" element={<Navigate to="/login" replace />} />

          {/* Legal */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* Authenticated app routes — real accounts under /app */}
          {APP_ROUTES.map((r) => (
            <Route
              key={`app-${r.path}`}
              path={r.path ? `/app/${r.path}` : "/app"}
              element={<RequireAuth>{r.element}</RequireAuth>}
            />
          ))}

          {/* Demo routes — same components, mounted under /demo so the
              URL always tells the user "this is the shared demo". */}
          {APP_ROUTES.map((r) => (
            <Route
              key={`demo-${r.path}`}
              path={r.path ? `/demo/${r.path}` : "/demo"}
              element={<RequireDemo>{r.element}</RequireDemo>}
            />
          ))}

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
