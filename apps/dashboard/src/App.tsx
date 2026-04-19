import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Shell } from "./components/Shell";
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

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<RequireAuth><OverviewPage /></RequireAuth>} />
        <Route path="/holdings" element={<RequireAuth><HoldingsPage /></RequireAuth>} />
        <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
        <Route path="/dividends" element={<RequireAuth><DividendsPage /></RequireAuth>} />
        <Route path="/allocation" element={<RequireAuth><AllocationPage /></RequireAuth>} />
        <Route path="/accounts" element={<RequireAuth><AccountsPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
