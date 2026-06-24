# ReplyDeck — Phase 5 Manual Setup

## Overview

Phase 5 takes ReplyDeck from an Expo Go demo running on the maintainer's laptop to a signed, installable build that 5 pilot users can install via Apple TestFlight (iOS) and Google Play Internal Testing (Android). At the end of Phase 5 each pilot user receives an invite email, taps a link on their device, and installs ReplyDeck through the standard store flow — no sideloading, no developer mode, no cables. The mechanical pieces (compiling native binaries, signing, store upload) are automated by EAS Build and `eas submit`. What is NOT automated and must be done by hand is everything in this document: paid developer-program enrollments, bundle ID / App Group registration, store listing metadata, pilot tester invitations, and a handful of env vars that need to be set in the EAS dashboard. Plan on ~3 calendar days of elapsed time, mostly waiting on Apple's identity review.

## Cost summary

| Item | Cost | Notes |
| --- | --- | --- |
| Apple Developer Program | **$99 USD / year** | Recurring. Required for any iOS distribution including TestFlight. |
| Google Play Console | **$25 USD one-time** | Lifetime account fee. |
| Expo EAS Build | **Free tier**: 30 builds/month, queued. **Production**: $19/mo (priority queue, unlimited builds at fair-use). **On-demand**: $99/mo. **Enterprise**: custom. | Free tier is enough for a 5-user pilot. |
| Anthropic API | Existing, usage-based | Smoke test against Claude Sonnet 4.6 came in at roughly **$0.02–0.03 per email card draft**. Lives on the API server, not the mobile app. |
| Apple Configurator / cables / extra hardware | **Not required** | TestFlight installs over-the-air. |

## Accounts to create

Create each of these under an identity you will still control in 2 years. Use a shared `replydeck@` mailbox if possible; do not use a personal address that might churn.

- [ ] **Apple Developer Program** — https://developer.apple.com/programs/enroll/
  - Choose **Individual** if Jas is the sole legal entity, **Organization** if there is a registered company (Organization requires a D-U-N-S number and takes longer). For a 5-user pilot, Individual is fine and can be upgraded later.
  - Review takes **24–48 hours** on first enrollment. Start this first.
  - Resulting credential: Apple ID + Team ID. EAS will request these on first build.
- [ ] **Google Play Console** — https://play.google.com/console/signup
  - Approval is effectively immediate (identity verification can take up to 48h but does not block app creation).
  - Resulting credential: a Play Console developer account. EAS submit uses a service-account JSON you generate later.
- [ ] **Expo account** — https://expo.dev
  - Free. Required to run `eas` commands.
  - Set the organization name to `replydeck` (or your handle) — this becomes the slug in build URLs.
- [ ] **Firebase project for FCM** — https://console.firebase.google.com
  - Free. Create now even though push lands in Phase 6 — the `google-services.json` file needs to be in the repo before the first Android production build to avoid a rebuild later.
  - Project name: `ReplyDeck`. Add an Android app with package `com.replydeck.app`. Download `google-services.json`.

## Bundle identifiers & IDs to reserve

Paste these exactly during the signup flows above:

- **iOS bundle id**: `com.replydeck.app`
- **Android package**: `com.replydeck.app`
- **iOS App Group**: `group.com.replydeck.shared` (reserved now for the Phase 6 widget extension — register it under **Identifiers → App Groups** in the Apple Developer console even though no code uses it yet)
- **URL scheme**: `replydeck` (used for OAuth callback: `replydeck://auth/callback`)
- **Display name**: `ReplyDeck`

## Apple-specific one-off steps

1. Sign in at https://developer.apple.com/account → **Certificates, Identifiers & Profiles**.
2. **Identifiers → App IDs → +** → Create a Bundle ID of type App, description `ReplyDeck`, bundle id `com.replydeck.app`. Leave capabilities default for now; Push, App Groups, and Associated Domains will be toggled on in Phase 6.
3. **Identifiers → App Groups → +** → Create `group.com.replydeck.shared`, description `ReplyDeck Shared`.
4. Go to https://appstoreconnect.apple.com → **My Apps → +** → New App. Platform iOS, name `ReplyDeck`, primary language English (Australia), bundle id `com.replydeck.app`, SKU `replydeck-ios-001`.
5. **App-Specific Password / credentials**: EAS recommends letting it manage credentials automatically. On first `eas build --platform ios` it will prompt for your Apple ID and 2FA, then create and store distribution certs and provisioning profiles in your Expo account. If you prefer manual control, generate an App-Specific Password at https://account.apple.com/account/manage and use `eas submit` with `--apple-app-specific-password`.
6. **TestFlight → Internal Testing → +** → Add the 5 pilot user emails. Internal testers do **not** require App Review and receive the invite email within minutes of the first build being processed (processing itself takes 10–30 min).

Gotcha: the *first* TestFlight build per app triggers a one-time export-compliance + encryption-usage prompt in App Store Connect. Answer it before the invite emails go out or testers see "Not available".

## Google-specific one-off steps

1. Play Console → **Create app**. App name `ReplyDeck`, default language English (Australia), app or game `App`, free or paid `Free`. Accept the declarations.
2. **App content** — work through every required section. Minimum to ship to Internal Testing: privacy policy URL, app access (note that login is required and provide a test Outlook account), ads (none), content rating questionnaire, target audience, news app (no), COVID-19 (no), data safety, government app (no).
3. **Countries / regions**: start with **Australia, United States, United Kingdom**. Expand after pilot.
4. **Internal testing track → Testers → Create email list** → paste the 5 pilot Gmail addresses. They must be Google accounts; non-Google Workspace addresses will not work.
5. **Release → Internal testing → Create new release** → upload the **AAB** produced by `eas build --platform android --profile production`. The first upload is what activates the testing link.
6. **Data safety form** — this **will** be flagged on review. Declare honestly: app collects **Email messages** and **Personal identifiers (email address, name)** for **App functionality** and **Account management**; data is processed both on-device and on our backend (transit encrypted, at-rest encrypted); **not sold**, **not shared with third parties for ads**, **not used for advertising or analytics**. Users can request deletion through in-app support.

## Expo / EAS setup

Run from `apps/mobile`:

1. `npm install -g eas-cli` — or use `npx eas-cli` if you prefer not to install globally.
2. `eas login` — uses the Expo account from earlier.
3. `eas init --id <auto>` — creates an Expo project and writes its id into `app.json` under `extra.eas.projectId`. Commit that change.
4. `eas credentials` — interactive. Choose **EAS managed** for both iOS (distribution cert + provisioning profile) and Android (upload keystore). EAS managed is strongly recommended; manual keystores get lost.
5. First build: `eas build --platform all --profile preview`. The `preview` profile produces an internal-distribution `.ipa` and an `.aab` you can sideload via QR / direct link before submitting to the stores. Confirm both install on a real device.
6. Submit to stores: `eas submit --platform ios --latest` then `eas submit --platform android --latest`. For Android, `eas submit` will prompt you the first time for a Google Play service-account JSON — follow https://docs.expo.dev/submit/android/ to generate it.

## Secrets / env vars to set in the EAS dashboard

Set these at https://expo.dev → project → **Configuration → Secrets** so they bake into production builds:

- `EXPO_PUBLIC_API_URL` — deployed API host. **Must be HTTPS** in production; iOS will refuse plain HTTP without ATS exceptions.
- `EXPO_PUBLIC_DEV_USER_ID` — temporary; goes away when real auth lands in Phase 8. Set to the pilot's seeded user id.
- **Microsoft Azure App Registration**: in https://portal.azure.com → App registrations → ReplyDeck → Authentication, add `replydeck://auth/callback` as a Mobile/Desktop redirect URI. Without this, OAuth in the production build will fail with `AADSTS50011`.
- **Do NOT** set `ANTHROPIC_API_KEY` in the mobile app. It lives on the API server only. The mobile app never sees it and never should.

## Add the 5 pilot users

- **Apple TestFlight**: App Store Connect → **Users and Access → Testers (TestFlight)** → add each pilot's Apple ID email as an Internal Tester. They get an invite email, install the TestFlight app, tap the link, install ReplyDeck.
- **Google Play**: Play Console → **Internal testing → Testers** → paste each pilot's Gmail address. Share the opt-in URL shown on the same page; once they accept, ReplyDeck appears for them in the Play Store.

## What happens if you skip any of this

| Skip | Consequence |
| --- | --- |
| Apple Developer Program | No iOS build at all — not even TestFlight. |
| Google Play Console | No Android build distribution — sideloading APKs is the only fallback. |
| Expo account | Can still `expo prebuild` and build locally with Xcode / Android Studio, but no EAS Build, no cloud signing, no `eas submit`. |
| Firebase project | Push notifications will not work on Android. Hard blocker for Phase 6. |
| App Group registration | The Phase 6 widget extension cannot share storage with the main app — widget will show stale or empty data. |

## Order of operations

Recommended sequence to avoid blocking on Apple's review:

- **Day 1 (morning)**: Start Apple Developer Program enrollment — it takes 24–48h, so start this first.
- **Day 1 (afternoon)**: Sign up for Google Play Console ($25, immediate). Create the Expo account. Create the Firebase project and download `google-services.json`.
- **Day 2 (after Apple approval lands)**: Register the `com.replydeck.app` Bundle ID and `group.com.replydeck.shared` App Group in the Apple Dev console. Create the App Store Connect app entry. Create the Play Console app entry and fill in App Content + Data Safety.
- **Day 2 (evening)**: From `apps/mobile`, run `eas init`, `eas credentials`, `eas build --platform all --profile preview`. Verify the preview build installs on a real iOS and Android device.
- **Day 3**: Run `eas build --profile production --platform all`, then `eas submit` for both platforms. Add the 5 pilot users as Internal Testers on both TestFlight and Play Internal Testing. Send them the install links.
