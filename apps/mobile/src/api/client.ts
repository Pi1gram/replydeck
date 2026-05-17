const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-user-id": USER_ID,
      ...(init.headers ?? {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined
    }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body) })
};
