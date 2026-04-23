import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  developer: { id: string; email: string; name: string } | null;
  isDemo: boolean;
}

interface AuthContextValue extends AuthState {
  login: (
    email: string,
    password: string,
  ) => Promise<void>;
  loginDemo: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (current_password: string, new_password: string) => Promise<void>;
  signOutAll: () => Promise<void>;
  deleteAccount: (confirm_email: string) => Promise<void>;
}

/**
 * Real sessions live in localStorage so they survive tab close.
 * Demo sessions live in sessionStorage — a per-tab bucket — so opening
 * the demo in one tab can't clobber a real session in another tab.
 * On hydration a tab prefers its own sessionStorage (demo) over the
 * shared localStorage (real), which is why demo-in-tab-2 doesn't
 * flip real-in-tab-1 on reload.
 */
const LS_KEY = "finlink_auth";
const SS_KEY = "finlink_auth_demo";

const EMPTY: AuthState = { accessToken: null, refreshToken: null, developer: null, isDemo: false };

const AuthContext = createContext<AuthContextValue | null>(null);

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

function readStored(): AuthState {
  try {
    const demoRaw = sessionStorage.getItem(SS_KEY);
    if (demoRaw) {
      const parsed = JSON.parse(demoRaw) as AuthState;
      if (parsed?.accessToken) return { ...parsed, isDemo: true };
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthState;
      if (parsed?.accessToken) return { ...parsed, isDemo: false };
    }
  } catch { /* ignore */ }
  return EMPTY;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<AuthState>(readStored);

  useEffect(() => {
    if (state.isDemo) {
      try {
        sessionStorage.setItem(SS_KEY, JSON.stringify(state));
      } catch { /* ignore */ }
      return;
    }
    // Real session (or signed-out): write to localStorage and make sure
    // no demo leftovers live in this tab's sessionStorage.
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
    try {
      sessionStorage.removeItem(SS_KEY);
    } catch { /* ignore */ }
  }, [state]);

  /**
   * Wipe every cached query so switching accounts never shows stale data
   * from the previous user. Called on every auth transition (login, logout,
   * register, sign-out-all, delete-account).
   */
  function resetQueryCache() {
    qc.clear();
  }

  async function request(path: string, method: string, body?: unknown) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw Object.assign(new Error(b?.error_message ?? "Request failed"), {
        fields: b?.fields ?? {},
        status: res.status,
      });
    }
    return res.json();
  }
  function post(path: string, body: unknown) {
    return request(path, "POST", body);
  }

  async function login(email: string, password: string) {
    const r = await post("/api/auth/login", { email, password });
    resetQueryCache();
    setState({ accessToken: r.access_token, refreshToken: r.refresh_token, developer: r.developer, isDemo: false });
  }
  async function loginDemo() {
    const r = await post("/api/demo/session", {});
    resetQueryCache();
    setState({ accessToken: r.access_token, refreshToken: r.refresh_token, developer: r.developer, isDemo: true });
  }
  async function register(name: string, email: string, password: string) {
    const r = await post("/api/auth/register", { name, email, password });
    resetQueryCache();
    setState({ accessToken: r.access_token, refreshToken: r.refresh_token, developer: r.developer, isDemo: false });
  }
  async function logout() {
    if (state.refreshToken) {
      await post("/api/auth/logout", { refresh_token: state.refreshToken }).catch(() => {});
    }
    resetQueryCache();
    // A demo logout only clears this tab (sessionStorage); a real logout
    // clears the persistent session without touching any demo tab.
    if (state.isDemo) {
      try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
      setState(EMPTY);
      return;
    }
    setState(EMPTY);
  }

  async function updateProfile(name: string) {
    const r = await request("/api/auth/me", "PATCH", { name });
    setState((s) => ({ ...s, developer: r.developer }));
  }

  async function changePassword(current_password: string, new_password: string) {
    await request("/api/auth/change-password", "POST", { current_password, new_password });
    // Current refresh is now invalid, but the access token is still good until it expires.
    // Rather than force a logout, just drop the stored refresh so next refresh attempt lands them at /login.
    setState((s) => ({ ...s, refreshToken: null }));
  }

  async function signOutAll() {
    await request("/api/auth/sign-out-all", "POST", {});
    resetQueryCache();
    setState(EMPTY);
  }

  async function deleteAccount(confirm_email: string) {
    await request("/api/auth/me", "DELETE", { confirm_email });
    resetQueryCache();
    setState(EMPTY);
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        loginDemo,
        register,
        logout,
        updateProfile,
        changePassword,
        signOutAll,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
