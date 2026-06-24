import * as Notifications from "expo-notifications";

import { approveCard, regenerateCard } from "../api/emailCards";

/**
 * Configure how expo-notifications renders notifications that arrive while
 * the app is already in the foreground.
 *
 * SDK 54 (expo-notifications ~0.32.x) uses `shouldShowBanner` and
 * `shouldShowList` instead of the deprecated `shouldShowAlert`.  We include
 * the deprecated field as well so the build works if a library peer still
 * imports the old shape.
 *
 * Call this once before subscribing to any notification events.
 */
export function configureForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // SDK 54 fields
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      // Deprecated but kept for compatibility with any SDK 51–53 build layer
      shouldShowAlert: true
    })
  });
}

/**
 * Execute a notification action received while the app is in the background
 * or has been cold-launched from a notification button press.
 *
 * @param actionIdentifier  The identifier string from the tapped action button
 *                          (e.g. "SEND", "REGENERATE").
 * @param cardId            The email card ID from the notification payload.
 */
export async function handleNotificationAction(
  actionIdentifier: string,
  cardId: string
): Promise<void> {
  if (actionIdentifier === "SEND") {
    await approveCard(cardId);
    return;
  }

  if (actionIdentifier === "REGENERATE") {
    await regenerateCard(cardId);

    // Post a local notification so the user can immediately send the new
    // draft without having to open the app — they can long-press the banner.
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Reply regenerated",
        body: "Tap and hold to Send the new draft",
        categoryIdentifier: "REPLY_CARD",
        data: { cardId }
      },
      // null trigger = deliver immediately
      trigger: null
    });
  }
}
