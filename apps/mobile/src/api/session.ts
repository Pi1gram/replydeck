import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, getUserId, setUserId } from "./client";

const STORAGE_KEY = "replydeck.userId";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Restore a previously logged-in user id from device storage and make it the
 * active x-user-id. Call once on app start. Returns the id, or null if the
 * user has never logged in on this device.
 */
export async function loadSession(): Promise<string | null> {
  try {
    const id = await AsyncStorage.getItem(STORAGE_KEY);
    if (id && id.length > 0) {
      setUserId(id);
      return id;
    }
  } catch {
    // Storage unavailable — fall through to the env fallback.
  }
  // Dev/demo builds bake EXPO_PUBLIC_DEV_USER_ID; honour it so they skip the
  // login screen. Builds without it (e.g. the shared preview build) show login.
  const envId = getUserId();
  return envId && envId.length > 0 ? envId : null;
}

/**
 * Log in (or create the account) by email. Persists the returned id and makes
 * it the active user for all subsequent API calls.
 */
export async function login(
  email: string,
  name?: string
): Promise<SessionUser> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: email.trim(), name: name?.trim() || undefined })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Login failed (${res.status}): ${text || res.statusText}`);
  }
  const user = (await res.json()) as SessionUser;
  await AsyncStorage.setItem(STORAGE_KEY, user.id);
  setUserId(user.id);
  return user;
}

/** Clear the stored session (e.g. to switch test accounts). */
export async function logout(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  setUserId("");
}
