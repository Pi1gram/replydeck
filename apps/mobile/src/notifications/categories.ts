import * as Notifications from "expo-notifications";

/**
 * Registers the notification categories (action button sets) that iOS uses to
 * render interactive buttons on each push.
 *
 * Category identifiers must match the `categoryId` field sent by the backend
 * in the APNs payload.  The backend uses two categories:
 *
 *  "REPLY_CARD"      — standard-risk email card: Send / Regenerate / Open
 *  "REPLY_CARD_HIGH" — high-risk email card: Open only (trust spine — no
 *                      one-tap Send on risky replies)
 *
 * Call this once at app startup (before any push can arrive).
 */
export async function registerNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync("REPLY_CARD", [
    {
      identifier: "SEND",
      buttonTitle: "Send",
      options: { opensAppToForeground: false }
    },
    {
      identifier: "REGENERATE",
      buttonTitle: "Regenerate",
      options: { opensAppToForeground: false }
    },
    {
      identifier: "OPEN",
      buttonTitle: "Open",
      options: { opensAppToForeground: true }
    }
  ]);

  await Notifications.setNotificationCategoryAsync("REPLY_CARD_HIGH", [
    {
      identifier: "OPEN",
      buttonTitle: "Review in app",
      options: { opensAppToForeground: true }
    }
  ]);
}
