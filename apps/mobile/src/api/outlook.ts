import { api, API_BASE_URL } from "./client";

const USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? "";

export type AuthMe = {
  userId: string;
  outlook:
    | { connected: true; email: string; connectedAt: string; scopes: string[] }
    | { connected: false };
};

export type SyncResult = {
  created: string[];
  skipped: number;
};

export const getAuthMe = () => api.get<AuthMe>("/auth/me");

export const syncOutlook = (top = 10) =>
  api.post<SyncResult>(`/outlook/sync?top=${top}`);

export const disconnectOutlook = () =>
  api.post<{ ok: boolean }>("/settings/disconnect-outlook");

/**
 * URL the device browser should open to start OAuth. The dev-user guard on
 * the API resolves who is connecting from the seeded DEV_USER_ID env var,
 * so no `x-user-id` header is needed here. We append it as a query param
 * for traceability and for future multi-user readiness.
 */
export const microsoftStartUrl = (): string =>
  `${API_BASE_URL}/auth/microsoft/start-redirect?u=${encodeURIComponent(USER_ID)}`;
