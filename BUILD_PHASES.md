# Build Phases – ReplyDeck

> **Updated 2026-05-17** to reflect Guy's May 2026 partnership memorandum.
> The original phase order was Outlook-first, then AI, then widget-last.
> Guy positions the lock-screen widget + rich notification as day-one core
> experience, and adds Gmail + Android + Category routing + auto-send +
> daily wrap. This file is the rebased sequence.

## Rules

- Each phase is shippable on its own. No half-finished phases in `main`.
- A phase is "done" only when `npm run typecheck` and `npm run test:e2e`
  pass and an e2e smoke walkthrough has been performed.
- Security posture from `SECURITY_PRIVACY.md` applies to every phase.

---

# Phase 1 — Fake mobile demo  ✅ DONE

React Native (Expo) app, mock cards, all five card actions, settings,
security trust screens. Lives in `apps/mobile`.

---

# Phase 2 — Backend + database  ✅ DONE

NestJS + Prisma + Postgres on Docker. EmailCard / AuditLog /
FeedbackEvent / User / ConnectedEmailAccount models. Mobile app reads
from API instead of fake data.

---

# Phase 3 — Microsoft Outlook (Graph API)  ✅ DONE

OAuth2 + PKCE, encrypted-at-rest tokens, `/outlook/sync` pulls real inbox,
`POST /email-cards/:id/approve` actually sends via Microsoft Graph. Real
sends require an explicit approve call.

---

# Phase 4 — Real AI drafting + tone + category routing  🚧 IN PROGRESS

## Goal

Replace canned drafts with real AI output. Add the tone profile, sender
profile, and Category A/B/C router from Guy's memo. The AI module is
provider-agnostic; the real Anthropic provider lands in 4.5 once the API
key is provisioned.

## Build

- `apps/api/src/ai/` NestJS module (✅ scaffolded, mock provider working)
- Prisma additions: `ToneProfile`, `SenderProfile`, `MemoryItem`,
  `Category` enum, `toneApplied` + `aiPromptVersion` on EmailCard
  (✅ schema + migration applied)
- Deterministic risk classifier (✅ `ai/classifier/risk-heuristics.ts`)
- Category classifier with sender pinning support (✅ `ai/classifier/category-classifier.ts`)
- System prompt + per-call user prompt builder (✅)
- Anthropic provider wiring with prompt caching + JSON output (🚧 4.5 — needs key)
- Replace `regenerated-drafts.ts` canned text with live AI calls
- Wire `/outlook/sync` to call AI for every new card
- Tone profile + sender profile API endpoints
- Golden-set regression tests over fixture emails

## Done when

Every new card from Outlook sync has an AI-generated summary, draft,
risk score, and category. Tone toggle in settings changes the voice of
new drafts. Pinned senders force Category A.

---

# Phase 4.5 — Expo prebuild + EAS Build pipeline

## Goal

Move the mobile app off Expo Go onto a real native build pipeline so we
can add widget + notification extensions in Phase 5.

## Build

- `expo prebuild` to materialise iOS + Android native projects.
- EAS Build config (`eas.json`) — development, preview, production profiles.
- iOS: Apple Developer Program account, bundle identifier, app group ID,
  notification + widget extension targets registered.
- Android: Play Console account, package name, signing config, FCM project.
- CI: GitHub Actions runs typecheck + tests + EAS preview build on every PR.
- TestFlight + Play Internal Testing tracks set up for the pilot 5.

## Done when

A pilot user can install a real internal build from TestFlight or Play
Internal Testing, complete the full Outlook flow, and approve a card —
all from a build that lives outside Expo Go.

---

# Phase 5 — Lock-screen widget + rich notification (Guy's day-one)

## Goal

Make Outlook triage possible without opening the app — this is Guy's
"more than an app" requirement.

## Build

- iOS WidgetExtension target (`accessoryRectangular` + `.accessoryCircular`
  lock-screen + home-screen widgets, SwiftUI + WidgetKit).
- iOS NotificationContentExtension for rich draft preview + send/reject
  buttons inside the notification.
- Notification Service Extension for decrypting push payloads.
- Android Glance widget (Compose-based) + `NotificationCompat.MessagingStyle`
  with `RemoteInput` so users can edit-and-send from the notification.
- App Group / Keychain access group for sharing card state between the app,
  the widget, and the notification extension.
- APNs (iOS) + FCM (Android) tokens registered with the API.
- Backend: Microsoft Graph change-notification webhook → push job →
  device. (Replaces polling for new mail.)
- Backend: gating logic — only Category C + risk:low + confidence >= 90
  cards become "tap to send" notifications. Everything else becomes "open
  app to review".

## Done when

A new low-risk email triggers a rich push within ~10s; the user can send
the AI reply from the lock screen without unlocking the device.

---

# Phase 6 — Gmail provider + multi-account unified inbox

## Goal

Catch the Avec wedge — multi-provider, multi-account from one card stack.

## Build

- Google OAuth + Gmail API alongside Microsoft Graph.
- Per-account `ConnectedEmailAccount` row (already supported by the schema's
  `EmailProvider` enum, just needs Gmail provider implementation).
- Unified inbox: queue endpoints aggregate across all connected accounts
  of the current user.
- Send-as alias handling for both providers.
- Settings UI: add Gmail account, remove account, set "default account
  for outgoing replies".

## Done when

A pilot user with both an Outlook and a Gmail account sees a single
unified queue, can reply from either, and sends go out from the correct
account.

---

# Phase 7 — Learning loop + voice composition (match Avec's moat)

## Goal

Style learning from approve/edit/reject signals + voice dictation that
uses full thread context. This is the Avec parity sprint.

## Build

- `MemoryItem` writer: when a user edits an AI draft, diff and store the
  delta as a positive style example. When a user rejects, store as
  negative signal scoped to sender + intent.
- Tone profile auto-updates from approved drafts (learns preferred
  greetings, sign-offs, average length).
- Sender profile auto-updates from accepted replies to that sender.
- Voice composition: hold-to-record on the centre button → Whisper or
  Anthropic-native audio → Claude draft with thread context injected.
- Conversational search endpoint: NL query → RAG over embedded inbox.

## Done when

After 30+ approvals from a single user, new drafts visibly match that
user's style. Voice dictation produces a context-aware reply, not a
transcription.

---

# Phase 8 — Real auth + Stripe billing

## Goal

Get rid of the `x-user-id` header. Charge users.

## Build

- Apple Sign-In, Google Sign-In, Microsoft Sign-In on mobile.
- Backend session: JWT (15-min access, 30-day refresh, rotated) +
  httpOnly secure cookies on web.
- Stripe checkout, subscription status, plan limits, usage counter.
- Tiered pricing (defer specific dollar amounts until cost base is known
  per Guy's memo).
- Free trial: card limit before payment required.

## Done when

A new user can sign up via Apple/Google/Microsoft, hit the free trial
limit, subscribe via Stripe, and continue using the product.

---

# Phase 9 — Attachments, file storage, meeting coordination (Guy's Phase 2)

Defer until after Phase 5 is in users' hands. Covers Guy's memo Phase 2:
attachment read + summarise, file storage send from OneDrive / SharePoint /
Drive / Dropbox / iCloud, folder cleanup, Outlook meeting coordination,
Apple Watch, CarPlay, Android Auto, macOS, web, additional providers,
extended AI, project memory, third-party integrations, encrypted threads,
compliance certifications, data residency, SSO.

---

# Phase 10 — Public launch prep

- Patent / IP attorney engagement (memo step 5).
- Independent pentest.
- Privacy nutrition labels (iOS) + Data Safety form (Play).
- App Store + Play production submission.
- Marketing site (Next.js — separate repo).
- Seahorse + Claude social strategy execution.
