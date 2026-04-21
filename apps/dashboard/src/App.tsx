import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { Shell } from "./components/Shell";
import { LandingPage } from "./pages/LandingPage";
import { PreviewLandingPage } from "./pages/PreviewLandingPage";
import { PreviewSignInPage } from "./pages/PreviewSignInPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { OverviewPage } from "./pages/OverviewPage";
import { HoldingsPage } from "./pages/HoldingsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { DividendsPage } from "./pages/DividendsPage";
import { AllocationPage } from "./pages/AllocationPage";
import { AccountsPage } from "./pages/AccountsPage";
import { SettingsPage } from "./pages/SettingsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  if (!accessToken) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

function RootRoute() {
  const { accessToken } = useAuth();
  // If logged in, send to the app. Otherwise show the marketing landing page.
  if (accessToken) return <Navigate to="/app" replace />;
  return <LandingPage />;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* Public marketing routes */}
          <Route path="/" element={<RootRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* PREVIEW — marketplace components under evaluation, not live UX */}
          <Route path="/preview-landing" element={<PreviewLandingPage />} />
          <Route path="/preview-signin" element={<PreviewSignInPage />} />

          {/* Authenticated app routes — all under /app */}
          <Route path="/app" element={<RequireAuth><OverviewPage /></RequireAuth>} />
          <Route path="/app/holdings" element={<RequireAuth><HoldingsPage /></RequireAuth>} />
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
