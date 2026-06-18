import { api } from "./client";

export type PushPlatform = "IOS" | "ANDROID";

export type PushTokenFull = {
  id: string;
  platform: PushPlatform;
  token: string;
  createdAt: string;
  lastSeenAt: string;
};

export type PushTokenPublic = {
  id: string;
  platform: PushPlatform;
  createdAt: string;
  lastSeenAt: string;
};

export const registerPushToken = (
  platform: PushPlatform,
  token: string
): Promise<PushTokenFull> =>
  api.post<PushTokenFull>("/me/push-tokens", { platform, token });

export const listPushTokens = (): Promise<PushTokenPublic[]> =>
  api.get<PushTokenPublic[]>("/me/push-tokens");

export const deletePushToken = (id: string): Promise<void> =>
  api.del(`/me/push-tokens/${encodeURIComponent(id)}`);
