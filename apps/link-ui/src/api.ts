const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    throw Object.assign(new Error("API error"), { status: res.status, body });
  }
  return (await res.json()) as T;
}

export interface SessionInfo {
  session_id: string;
  client_name: string;
  products: string[];
  status: string;
  institution_id: string | null;
  mfa_required: boolean;
  credential_attempts: number;
  expires_at: string;
}

export interface Institution {
  id: string;
  name: string;
  primaryColor: string;
  supportedProducts: string[];
}

export interface PreviewAccount {
  id: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
}

export const api = {
  session: (token: string) => req<SessionInfo>(`/api/link/session?token=${encodeURIComponent(token)}`),
  institutions: (query?: string) =>
    req<{ institutions: Institution[] }>(
      `/api/institutions${query ? `?query=${encodeURIComponent(query)}` : "?count=12"}`,
    ),
  selectInstitution: (session_id: string, institution_id: string) =>
    req("/api/link/session/select_institution", {
      method: "POST",
      body: JSON.stringify({ session_id, institution_id }),
    }),
  submitCredentials: (session_id: string, username: string, password: string) =>
    req<{ mfa_required: boolean }>("/api/link/session/submit_credentials", {
      method: "POST",
      body: JSON.stringify({ session_id, username, password }),
    }),
  submitMfa: (session_id: string, code: string) =>
    req("/api/link/session/submit_mfa", {
      method: "POST",
      body: JSON.stringify({ session_id, code }),
    }),
  previewAccounts: (session_id: string) =>
    req<{ accounts: PreviewAccount[] }>(`/api/link/session/${session_id}/preview_accounts`),
  finalize: (session_id: string, account_ids: string[]) =>
    req<{ public_token: string }>("/api/link/session/finalize", {
      method: "POST",
      body: JSON.stringify({ session_id, account_ids }),
    }),
};
