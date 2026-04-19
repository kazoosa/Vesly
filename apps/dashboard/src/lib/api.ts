const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

export function apiFetch(getToken: () => string | null) {
  return async function <T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(body?.error_message ?? "Request failed"), {
        status: res.status,
        body,
      });
    }
    return (await res.json()) as T;
  };
}

export function unauthedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(`${API}${path}`, init).then(async (res) => {
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw Object.assign(new Error(b?.error_message ?? "Request failed"), { status: res.status, body: b });
    }
    return (await res.json()) as T;
  });
}

export function itemFetch(accessToken: string) {
  return async function <T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw Object.assign(new Error(b?.error_message ?? "Request failed"), { status: res.status, body: b });
    }
    return (await res.json()) as T;
  };
}
