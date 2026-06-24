const API_URL = resolveApiUrl();

// The active user id, sent as x-user-id on every request. Seeded from the
// build-time env (dev convenience) and overwritten at runtime once the user
// logs in by email (see api/session.ts). This is what lets a single build
// serve many users instead of baking one id per build.
let currentUserId = process.env.EXPO_PUBLIC_DEV_USER_ID ?? "";

export function setUserId(id: string): void {
  currentUserId = id;
}

export function getUserId(): string {
  return currentUserId;
}

function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  // __DEV__ is true in the Expo Go / dev-client packager runtime, false in
  // production binaries. Falling back to localhost is only ever right in
  // development on the same machine as the API.
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return "http://localhost:4000";
  }
  throw new Error(
    "EXPO_PUBLIC_API_URL is not set. Production builds must set this " +
      "via eas.json or the EAS dashboard."
  );
}

export const API_BASE_URL = API_URL;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-user-id": currentUserId,
      ...(init.headers ?? {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function requestVoid(path: string, init: RequestInit = {}): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-user-id": currentUserId,
      ...(init.headers ?? {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestAllowing404<T>(
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-user-id": currentUserId,
      ...(init.headers ?? {})
    }
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, `API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  getOrNull: <T>(p: string) => requestAllowing404<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined
    }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body) }),
  del: (p: string) => requestVoid(p, { method: "DELETE" })
};
