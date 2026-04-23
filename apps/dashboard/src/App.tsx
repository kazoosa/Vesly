import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { Shell } from "./components/Shell";
import { PreviewLandingPage } from "./pages/PreviewLandingPage";
import { PreviewSignInPage } from "./pages/PreviewSignInPage";
import { DemoPage } from "./pages/DemoPage";
import { TermsPage, PrivacyPage } from "./pages/LegalPage";
import { OverviewPage } from "./pages/OverviewPage";
import { HoldingsPage } from "./pages/HoldingsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { DividendsPage } from "./pages/DividendsPage";
import { AllocationPage } from "./pages/AllocationPage";
import { AccountsPage } from "./pages/AccountsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StocksPage } from "./pages/stocks/StocksPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  if (!accessToken) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

function RootRoute() {
  const { accessToken } = useAuth();
  // If logged in, send to the app. Otherwise show the marketing landing page.
  if (accessToken) return <Navigate to="/app" replace />;
  return <PreviewLandingPage />;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* Public marketing routes */}
          <Route path="/" element={<RootRoute />} />
          {/* /landing always shows the marketing page, even when logged in —
              handy for previewing the site without logging out. */}
          <Route path="/landing" element={<PreviewLandingPage />} />
          <Route path="/login" element={<PreviewSignInPage />} />
          <Route path="/register" element={<PreviewSignInPage />} />
          {/* /demo auto-signs the user in as the seeded demo account */}
          <Route path="/demo" element={<DemoPage />} />

          {/* Legacy preview aliases — keep links in the wild working */}
          <Route path="/preview-landing" element={<Navigate to="/landing" replace />} />
          <Route path="/preview-signin" element={<Navigate to="/login" replace />} />

          {/* Legal */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />

          {/* Authenticated app routes — all under /app */}
          <Route path="/app" element={<RequireAuth><OverviewPage /></RequireAuth>} />
          <Route path="/app/holdings" element={<RequireAuth><HoldingsPage /></RequireAuth>} />
          <Route path="/app/stocks" element={<RequireAuth><StocksPage /></RequireAuth>} />
          <Route path="/app/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
          <Route path="/app/dividends" element={<RequireAuth><DividendsPage /></RequireAuth>} />
          <Route path="/app/allocation" element={<RequireAuth><AllocationPage /></RequireAuth>} />
          <Route path="/app/accounts" element={<RequireAuth><AccountsPage /></RequireAuth>} />
          <Route path="/app/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
