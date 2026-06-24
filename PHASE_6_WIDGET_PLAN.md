# Phase 6 — Lock-screen Widget + Rich Notification Plan

Planning doc for the day-one feature from Guy's May 2026 partnership memo:
the lock-screen widget + actionable rich notification that lets the user
triage email without unlocking the phone.

**Status: planning only — no native widget code in the repo yet. Blocked
on Phase 5 manual setup (Apple Developer + Play Console enrolment) and
`expo prebuild` running.**

## Goal

When a new email arrives:

1. Backend receives a Microsoft Graph change notification.
2. Backend runs the AI draft, classifies risk + category.
3. If category C + risk low + confidence ≥ 90 + sender on auto-send
   allowlist → silent auto-send + log in daily wrap.
4. Otherwise → push notification to the device with the AI draft preview
   inside the notification body. The notification carries action buttons
   (Send, Reject, Open in app). Lock-screen widget shows the next pending
   card.

## iOS pieces (WidgetKit + Notification Service Extension)

| Component | Tech | What it does |
|---|---|---|
| **WidgetExtension target** | SwiftUI + WidgetKit, `accessoryRectangular` + `.accessoryCircular` widget families | Lock-screen widget showing the next pending card (sender, subject, "Tap to triage"). Long-press = enter the app at the queue screen. |
| **NotificationContentExtension** | UNNotificationContentExtension (storyboard or SwiftUI) | Custom layout for the push payload — shows AI draft preview inline. Buttons fire to the main app via `UNNotificationAction`. |
| **NotificationServiceExtension** | UNNotificationServiceExtensionRequest | Decrypts the encrypted push payload (we don't ship the draft over APNs in clear). |
| **App Group** | `group.com.replydeck.shared` (already entitled in `app.json`) | Shared container so widget reads draft data the app wrote (SQLite or `NSUserDefaults(suiteName:)`). |
| **APNs token registration** | `expo-notifications` | App registers, posts token to API. |

Config-plugin path (preferred over hand-editing the Xcode project):
- **`@bacons/apple-targets`** — community-maintained, supports adding
  Widget + Service extensions through `app.json` entries. Survives
  re-running `expo prebuild --clean`.
- Fallback: a custom Expo config plugin that injects the targets into
  the Xcode project file at prebuild time.

## Android pieces (Glance + FCM)

| Component | Tech | What it does |
|---|---|---|
| **App Widget** | Jetpack Glance (Compose-based, modern alternative to RemoteViews) | Home/lock-screen widget showing next card. Tap = open app at queue. |
| **Custom notification** | `NotificationCompat.MessagingStyle` + `RemoteInput` | Rich notification with AI draft preview, inline reply field, Send / Reject actions. |
| **ContentProvider** | `com.replydeck.app.shared` authority | Cross-process data the widget reads. |
| **FCM token** | `expo-notifications` + `google-services.json` from Firebase | Device registers FCM token with API. |

Config-plugin path:
- **`expo-notifications`** handles FCM token + permission + simple
  notifications out of the box.
- For the Glance widget target, no community plugin exists — write a
  small custom plugin that adds the widget receiver to
  `AndroidManifest.xml` and copies the Glance composable into
  `android/app/src/main/java/...`.

## Backend changes needed

1. **Microsoft Graph change notifications** — subscribe to
   `/me/messages` events per connected account. Subscriptions max out at
   ~3 days for `messages`, so add a renewal cron (BullMQ).
2. **`/webhooks/microsoft-graph`** — public HTTPS endpoint that receives
   change notifications. Validate `clientState`, run a sync for the
   notified user, and (after AI drafting completes) emit a push.
3. **Push delivery service** — wraps APNs + FCM. Driver chosen per device
   (we already know which because the device registers itself with the
   API).
4. **`PushToken` Prisma model** — `userId`, `provider` (apns | fcm),
   `token`, `lastSeenAt`, indexed by `(userId, provider)`.
5. **Auto-send pipeline** — runs after AI drafting on the sync path:
   evaluate gates → either tap a record onto the "auto-sent today" queue
   (for the daily wrap) or fall through to push delivery.

## Sequence to ship Phase 6

1. **Land Phase 5 prebuild first.** All widget work assumes
   `apps/mobile/ios/` and `apps/mobile/android/` exist.
2. **Backend: PushToken model + register endpoint.** Mobile registers
   APNs/FCM token via existing `x-user-id` header.
3. **Backend: Graph subscription + webhook.** Per-account subscription
   created on Outlook connect; renewal cron; webhook → sync → push.
4. **Mobile: integrate `expo-notifications`.** Request permission on
   first launch; receive push; open queue screen with the right card.
5. **iOS widget + notification content extension** via
   `@bacons/apple-targets`. Read shared data via App Group.
6. **Android Glance widget + MessagingStyle notification.**
7. **Auto-send pipeline** — last because it has the highest blast
   radius. Wait until the rest is verified.
8. **Daily wrap email job** — 6pm local cron via BullMQ + Resend or
   Postmark.

## Open decisions

- **Push payload encryption.** APNs is TLS-encrypted in transit, but the
  payload still passes through Apple's infrastructure. For Guy's
  "verifiable enterprise" privacy commitment, we should encrypt the
  draft body with a per-device key Apple cannot see, decrypt inside the
  Notification Service Extension. Adds complexity; defer until Phase 6.5
  unless an enterprise pilot asks.
- **Widget refresh frequency.** WidgetKit limits refresh frequency
  (~once per hour for budget reasons, more on user interaction). Decide
  whether the widget pulls from the API or reads from local App Group
  cache. App Group cache is simpler + faster + cheaper.
- **Lock-screen interaction depth.** Guy's memo says long-press opens
  the full triage experience. On iOS 16+, `accessoryRectangular`
  supports tap-to-open; long-press doesn't have a direct hook. Confirm
  the desired UX before implementing.

## What this plan does NOT cover

- Voice composition (Phase 7).
- Gmail provider parity (Phase 7).
- Real auth (Phase 8).
- Stripe billing (Phase 8).
- Attachments / file storage (Phase 9, Guy's memo Phase 2 territory).
