import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  developer: { id: string; email: string; name: string } | null;
}

interface AuthContextValue extends AuthState {
  login: (
    email: string,
    password: string,
  ) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (current_password: string, new_password: string) => Promise<void>;
  signOutAll: () => Promise<void>;
  deleteAccount: (confirm_email: string) => Promise<void>;
}

const STORAGE_KEY = "finlink_auth";

const AuthContext = createContext<AuthContextValue | null>(null);

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as AuthState;
    } catch {
      return { accessToken: null, refreshToken: null, developer: null };
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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
    setState({ accessToken: r.access_token, refreshToken: r.refresh_token, developer: r.developer });
  }
  async function register(name: string, email: string, password: string) {
    const r = await post("/api/auth/register", { name, email, password });
    setState({ accessToken: r.access_token, refreshToken: r.refresh_token, developer: r.developer });
  }
  async function logout() {
    if (state.refreshToken) {
      await post("/api/auth/logout", { refresh_token: state.refreshToken }).catch(() => {});
    }
    setState({ accessToken: null, refreshToken: null, developer: null });
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
    setState({ accessToken: null, refreshToken: null, developer: null });
  }

  async function deleteAccount(confirm_email: string) {
    await request("/api/auth/me", "DELETE", { confirm_email });
    setState({ accessToken: null, refreshToken: null, developer: null });
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
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
