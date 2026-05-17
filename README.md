# ReplyDeck AI Agent Build Pack

This folder contains the context files for building **ReplyDeck**, an Outlook-first, phone-native AI email approval queue.

Use these files with **Claude Code**, **Codex**, Cursor, Windsurf, or any coding agent.

## What this product is

ReplyDeck is **not** a full email client.

It is a **phone remote control for Outlook**.

The product watches new Outlook emails, generates AI reply cards, and lets the user approve, edit, reject, regenerate, or save replies from their phone.

The core behaviour is:

```txt
Email comes in
AI reads it
AI writes a reply
Phone shows a card
User approves
Email sends
AI learns from the action
```

## Build order

1. Build fake mobile approval queue first.
2. Add backend and database.
3. Add Microsoft Outlook connection.
4. Add AI draft generation.
5. Add approve/send flow.
6. Add learning/memory.
7. Add home-screen / widget layer.
8. Add billing.

## Recommended stack

```txt
Mobile app: React Native + Expo + TypeScript
Backend: Node.js + NestJS or Express + TypeScript
Database: PostgreSQL + Prisma
Queue: Redis + BullMQ
Email provider: Microsoft Graph / Outlook first
AI provider: OpenAI or Anthropic abstraction
Billing: Stripe
```

## How to use this pack

Start by giving your AI coding agent:

1. `CLAUDE_CODE_MASTER_PROMPT.md`
2. `PROJECT_CONTEXT.md`
3. `MVP_SPEC.md`
4. `ARCHITECTURE.md`
5. `SECURITY_PRIVACY.md`
6. `AI_LEARNING_ENGINE.md`
7. `BUILD_PHASES.md`

Then ask it to implement Phase 1 only.

Do not ask it to build everything at once.

The first goal is a working demo with mock data.

## Phase 1 demo app

This repo now includes the first fake-data mobile demo.

```txt
apps/mobile
  Expo + React Native + TypeScript app

packages/shared
  Shared TypeScript types and fake email card data
```

### Install

```bash
npm install
```

### Run

```bash
npm run mobile
```

For a normal browser preview:

```bash
npm run web
```

Or run the mobile workspace directly:

```bash
cd apps/mobile
npm run start
```

Expo will print a QR code and local URL. Open it with Expo Go, an iOS
simulator, an Android emulator, or press `w` in the Expo terminal for web.

### Verify

```bash
npm run typecheck
```

### What Phase 1 includes

- Onboarding screen
- Mock Outlook connection screen
- Approval queue with one card at a time
- Fake home-screen widget preview inside the app
- Send, Reject, Later, Regenerate, and Edit actions
- Later/saved queue
- Settings screen
- Security/trust screen
- Shared `EmailCard` TypeScript type
- Five fake cards covering low, medium, and high risk cases

### What Phase 1 intentionally excludes

- Microsoft Graph
- Real OAuth
- Backend API
- Database
- Real AI provider
- Stripe
- Gmail
- Autonomous sending

## Phase 2 — Backend + database

Phase 2 adds a NestJS API backed by Postgres + Prisma. The mobile app
fetches cards from the API instead of from `fakeEmailCards.ts`. Every
approve / reject / later / edit / regenerate writes an `AuditLog` row
plus a `FeedbackEvent` row.

```txt
apps/api
  NestJS + Prisma backend
  modules: users, email-cards, feedback-events, audit-logs
```

### One-time setup

Postgres runs in Docker. Make sure Docker Desktop is running, then:

```bash
docker compose up -d postgres
```

Postgres listens on `localhost:5433` (user `replydeck`, password
`replydeck`, db `replydeck`) — chosen to avoid colliding with any
local Postgres on 5432.

Copy the API env file:

```bash
cp apps/api/.env.example apps/api/.env
```

Install workspace deps (this also installs the API's deps):

```bash
npm install
```

> Quirk: Prisma 5 + npm workspace hoisting. If `prisma generate` ever
> errors with "Cannot find @prisma/client", recreate the symlink and
> regenerate:
>
> ```bash
> ln -sf ../../../../node_modules/@prisma/client apps/api/node_modules/@prisma/client
> npm run prisma:generate -w @replydeck/api
> ```

Run the migration and seed the demo data:

```bash
npm run prisma:migrate -w @replydeck/api
npm run prisma:seed -w @replydeck/api
```

The seed prints `DEV_USER_ID=…`. Copy this into:

- `apps/api/.env` → `DEV_USER_ID=…`
- `apps/mobile/.env` → `EXPO_PUBLIC_DEV_USER_ID=…`

(Both files are pre-populated with the standard demo id
`cmozb3wxt0000epl11g97atj3` if you don't change anything.)

### Run the API

```bash
npm run start:dev -w @replydeck/api
```

The API listens on `http://localhost:4000`. Smoke test:

```bash
curl -H "x-user-id: cmozb3wxt0000epl11g97atj3" http://localhost:4000/email-cards
```

### Run the mobile app against the API

In `apps/mobile/.env`:

```txt
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:4000
EXPO_PUBLIC_DEV_USER_ID=cmozb3wxt0000epl11g97atj3
```

Use your LAN IP (e.g. `192.168.1.20`), not `localhost`, so Expo Go on
your phone can reach the API. Then:

```bash
npm run mobile
```

### Run the test suite

```bash
npm run test:e2e -w @replydeck/api
```

Tests run against an isolated `replydeck_test` database created on the
same Postgres container, so the dev seed data is never touched.

### Endpoints

```txt
GET    /email-cards            list cards (optional ?status=)
GET    /email-cards/:id        single card
POST   /email-cards            create card
POST   /email-cards/:id/approve   → status sent  + audit + feedback APPROVED
POST   /email-cards/:id/reject    → status rejected + audit + feedback REJECTED
POST   /email-cards/:id/later     → status later + audit + feedback SAVED_LATER
POST   /email-cards/:id/regenerate  → swaps draftReply + audit + feedback REGENERATED
PATCH  /email-cards/:id/reply     → updates draft + audit + feedback EDITED
GET    /audit-logs                most recent first (?limit=, max 200)
GET    /feedback-events           most recent first (?limit=, max 200)
```

All requests must include the `x-user-id` header.

### What Phase 2 intentionally excludes

- Microsoft Graph / Outlook
- Real auth (single dev user via header)
- Real AI (regenerate uses canned placeholder text)
- Stripe

## Phase 3 — Microsoft Outlook (Graph API)

Phase 3 adds OAuth (with PKCE), encrypted-at-rest tokens, an inbox sync
that creates cards from real Outlook messages, and wires `approve` so it
actually sends a reply through Microsoft Graph. Real sends only happen in
response to an explicit `POST /email-cards/:id/approve` call — there is no
background or autonomous send path.

See **[MICROSOFT_SETUP.md](MICROSOFT_SETUP.md)** for the end-to-end setup
and smoke-test walkthrough (Azure App Registration, scopes, env vars,
connect → sync → approve → confirm sent).

### New env vars (`apps/api/.env`)

```
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=http://localhost:4000/auth/microsoft/callback
APP_REDIRECT_AFTER_AUTH=http://localhost:4000/auth/connected
TOKEN_ENCRYPTION_KEY=          # openssl rand -hex 32
OAUTH_COOKIE_SECURE=false      # true in production
```

### New endpoints

```txt
GET    /auth/me                      — connection status for current user
POST   /auth/microsoft/start         — returns Microsoft authorize URL (PKCE+state cookie)
GET    /auth/microsoft/callback      — exchanges code, persists encrypted tokens
GET    /auth/connected               — small landing page
POST   /settings/disconnect-outlook  — deletes connected account + audit log
POST   /outlook/sync?top=10          — pulls recent inbox, creates new cards
GET    /outlook/messages/recent      — dev passthrough (does not persist)
```

### Schema additions

- `EmailProvider` enum (`OUTLOOK`, `GMAIL`)
- `ConnectedEmailAccount` model (per-user, per-provider; encrypted access +
  refresh tokens)
- `EmailCard.provider` / `providerMessageId` / `internetMessageId` /
  `hasAttachments` (nullable so existing Phase 2 seed cards still work)
- `@@unique([userId, provider, providerMessageId])` on `EmailCard` for
  idempotent sync

Migration is committed as `prisma/migrations/20260510160000_microsoft_outlook`.

### What Phase 3 intentionally excludes

- Real AI (placeholder summary/draft until Phase 4)
- Production user auth (still the seeded dev user via `x-user-id`)
- Gmail
- Stripe / billing
- Autonomous sending — every send still requires an explicit approve action
