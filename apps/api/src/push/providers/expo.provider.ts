import { Logger } from "@nestjs/common";
import type {
  PushDeliveryProvider,
  PushPayload
} from "../push-delivery.types";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Expo push tokens always start with one of these prefixes.
// Native APNs / FCM tokens that slipped into the DB are skipped cleanly.
const EXPO_TOKEN_PREFIXES = ["ExponentPushToken[", "ExpoPushToken["];

interface ExpoPushResponse {
  data:
    | { status: "ok" | "error"; message?: string; details?: unknown }
    | Array<{ status: "ok" | "error"; message?: string; details?: unknown }>;
}

/**
 * Expo Push Notification service provider.
 *
 * Uses the Expo push gateway (https://exp.host/--/api/v2/push/send) which
 * handles both APNs (iOS) and FCM (Android) routing internally. No APNs key
 * or FCM service-account JSON is required — just valid Expo push tokens
 * registered by the Expo app at runtime.
 *
 * Behaviour:
 *  - Returns { success: false } for non-Expo tokens instead of throwing so
 *    stale native tokens stored before Expo are skipped without aborting the
 *    fan-out across the rest of a user's devices.
 *  - Never throws on a per-token network or API failure — always returns a
 *    result object so the dispatcher can continue to the next device.
 */
export class ExpoPushProvider implements PushDeliveryProvider {
  readonly name = "expo";
  private readonly logger = new Logger(ExpoPushProvider.name);

  async send(
    token: string,
    payload: PushPayload
  ): Promise<{ success: boolean; error?: string }> {
    // Guard: skip obviously non-Expo tokens rather than wasting a network
    // round-trip that will always return an error.
    if (!EXPO_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix))) {
      return { success: false, error: "not an expo token" };
    }

    const categoryId =
      payload.riskLevel?.toLowerCase() === "high"
        ? "REPLY_CARD_HIGH"
        : "REPLY_CARD";

    const body = {
      to: token,
      title: payload.title,
      subtitle: payload.subtitle,
      body: payload.body,
      sound: "default",
      priority: "high",
      categoryId,
      data: {
        cardId: payload.cardId,
        riskLevel: payload.riskLevel ?? null,
        category: payload.category ?? "NEW_CARD"
      }
    };

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(body)
      });

      let json: ExpoPushResponse | undefined;
      const text = await res.text();
      try {
        json = JSON.parse(text) as ExpoPushResponse;
      } catch {
        // Non-JSON response — treat as a network-level failure.
        const error = `Expo push returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`;
        this.logger.warn(error);
        return { success: false, error };
      }

      // Expo wraps a single send in { data: { status, ... } } and a batch
      // in { data: [{ status, ... }, ...] }. We always send one at a time
      // but normalise both shapes for safety.
      const first = Array.isArray(json.data) ? json.data[0] : json.data;

      if (!first) {
        const error = "Expo push returned empty data";
        this.logger.warn(error);
        return { success: false, error };
      }

      if (first.status === "ok") {
        return { success: true };
      }

      const errorMsg = first.message ?? "Expo push returned error status";
      this.logger.warn(
        `Expo push failed for token ${redactToken(token)}: ${errorMsg}`
      );
      return { success: false, error: errorMsg };
    } catch (err) {
      // Network-level failure (DNS, timeout, etc.) — never rethrow.
      const error = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Expo push network error for token ${redactToken(token)}: ${error}`
      );
      return { success: false, error };
    }
  }
}

function redactToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
