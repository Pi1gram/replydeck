import { useEffect } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";

import { registerPushToken, type PushPlatform } from "../api/push";

/**
 * Registers the device's Expo push token with the ReplyDeck API on mount.
 *
 * Important details:
 *  - We use getExpoPushTokenAsync so Expo's push service routes notifications
 *    for us — tokens are "ExponentPushToken[...]" strings sent to our backend.
 *  - In Expo Go (the managed-runtime sandbox), Expo push tokens require a
 *    dev build.  We detect that and no-op so the dev loop keeps working.
 *  - All failures are swallowed/logged so a permission denial or unsupported
 *    runtime never crashes app startup.
 */
export function usePushRegistration(): void {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Skip registration inside Expo Go — Expo push tokens are not
        // available in the managed sandbox runtime.
        if (
          Constants.executionEnvironment === ExecutionEnvironment.StoreClient
        ) {
          // eslint-disable-next-line no-console
          console.log(
            "[push] Skipping push registration in Expo Go (use a dev build)."
          );
          return;
        }

        // Web has no native push surface for our use case.
        if (Platform.OS !== "ios" && Platform.OS !== "android") {
          return;
        }

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== "granted") {
          // eslint-disable-next-line no-console
          console.log("[push] Notification permission not granted; skipping.");
          return;
        }

        // Read projectId from app.json → extra.eas.projectId so that
        // getExpoPushTokenAsync can contact the correct Expo project.
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

        if (!projectId) {
          // eslint-disable-next-line no-console
          console.warn(
            "[push] extra.eas.projectId not found in expoConfig; skipping Expo push token registration."
          );
          return;
        }

        const tokenResp = await Notifications.getExpoPushTokenAsync({
          projectId
        });
        if (cancelled) return;

        const platform: PushPlatform =
          Platform.OS === "ios" ? "IOS" : "ANDROID";

        // tokenResp.data is the "ExponentPushToken[...]" string we register
        // with the ReplyDeck backend so it can send pushes via Expo's service.
        const expoToken = tokenResp.data;

        if (!expoToken) {
          // eslint-disable-next-line no-console
          console.log("[push] Empty Expo push token; skipping.");
          return;
        }

        await registerPushToken(platform, expoToken);
      } catch (err) {
        // Never let push registration crash startup.
        // eslint-disable-next-line no-console
        console.warn("[push] Registration failed (non-fatal):", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
