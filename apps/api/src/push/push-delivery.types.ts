/**
 * Provider-agnostic push delivery contract.
 *
 * Drivers (`apns`, `fcm`, `expo`, `mock`) each implement
 * `PushDeliveryProvider`. The dispatch service (`PushDeliveryService`)
 * picks one per device based on `PushToken.platform`.
 *
 * Payload fields:
 *   - cardId     — `EmailCard.id`. Deep-links the user to the queue card.
 *   - title      — Notification title (e.g. "New from Alice").
 *   - body       — Notification body (typically the email subject).
 *   - threadId   — Optional thread id for grouping/coalescing on device.
 *   - category   — Optional content category. Lets clients render different
 *                  actions (NEW_CARD vs AUTO_SENT_SUMMARY).
 *   - riskLevel  — Optional AI risk level ("low" | "medium" | "high").
 *                  Passed through to the Expo provider so the device can
 *                  render a high-priority banner for high-risk emails and
 *                  choose the right iOS/Android notification category id
 *                  (REPLY_CARD_HIGH vs REPLY_CARD).
 */
export type PushPayload = {
  cardId: string;
  title: string;
  /** Optional iOS subtitle line, shown under the title (we use the subject). */
  subtitle?: string;
  body: string;
  threadId?: string;
  category?: "NEW_CARD" | "AUTO_SENT_SUMMARY";
  /** AI-assigned risk level — forwarded to device for priority rendering. */
  riskLevel?: string;
};

/**
 * A single device send result. Providers should never throw on a per-token
 * failure (invalid token, network blip, throttled) — return `{ success:
 * false, error }` and let the service decide how to log / retire the token.
 * Throwing is reserved for "not implemented" / configuration errors.
 */
export interface PushDeliveryProvider {
  readonly name: string;
  send(
    token: string,
    payload: PushPayload
  ): Promise<{ success: boolean; error?: string }>;
}

export type PushDriver = "mock" | "apns" | "fcm" | "expo";
