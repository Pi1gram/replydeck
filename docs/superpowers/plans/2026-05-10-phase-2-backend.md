# Phase 2 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute. Tasks below are decomposed for fresh-subagent dispatch.

**Goal:** Add a NestJS + Postgres + Prisma backend that persists ReplyDeck email cards, records audit logs and feedback events for every action, and is wired into the existing Expo mobile app.

**Architecture:** New `apps/api` workspace running NestJS 10. Postgres 16 in Docker. Prisma ORM with the trimmed Phase 2 subset of `PRISMA_SCHEMA_DRAFT.md` (User, EmailCard, FeedbackEvent, AuditLog + enums). No real auth — a single seeded "demo" user resolved from the `x-user-id` header (default to env-configured demo id). Mobile app fetches cards from the API and posts mutations; static `fakeEmailCards.ts` becomes seed data only.

**Tech Stack:** NestJS 10, TypeScript 5.4, Prisma 5.x, PostgreSQL 16, Jest + supertest, Docker Compose, npm workspaces.

---

## Phase 2 Constraints (do not violate)

- ❌ No Outlook / Microsoft Graph
- ❌ No real LLM calls (regenerate uses canned placeholder text)
- ❌ No Stripe
- ❌ No real auth (single dev user via `x-user-id` header)
- ✅ Every approve / reject / later / edit / regenerate writes an `AuditLog`
- ✅ Approve / reject / later / edit / regenerate also write a `FeedbackEvent` (action enum)
- ✅ Mobile app must read cards from the API (not from `fakeEmailCards.ts` at runtime)

---

## Repo Layout After Phase 2

```
replydeck_ai_agent_pack/
├── apps/
│   ├── api/                     ← NEW
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts
│   │   │   └── migrations/...
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── prisma.module.ts
│   │   │   │   ├── prisma.service.ts
│   │   │   │   ├── current-user.decorator.ts
│   │   │   │   ├── dev-user.guard.ts
│   │   │   │   └── card-mapper.ts
│   │   │   ├── users/
│   │   │   │   ├── users.module.ts
│   │   │   │   └── users.service.ts
│   │   │   ├── email-cards/
│   │   │   │   ├── email-cards.module.ts
│   │   │   │   ├── email-cards.controller.ts
│   │   │   │   ├── email-cards.service.ts
│   │   │   │   ├── regenerated-drafts.ts
│   │   │   │   └── dto/
│   │   │   │       ├── create-email-card.dto.ts
│   │   │   │       └── update-reply.dto.ts
│   │   │   ├── feedback-events/
│   │   │   │   ├── feedback-events.module.ts
│   │   │   │   ├── feedback-events.controller.ts
│   │   │   │   └── feedback-events.service.ts
│   │   │   └── audit-logs/
│   │   │       ├── audit-logs.module.ts
│   │   │       ├── audit-logs.controller.ts
│   │   │       └── audit-logs.service.ts
│   │   ├── test/
│   │   │   ├── setup.ts
│   │   │   ├── email-cards.e2e-spec.ts
│   │   │   ├── feedback-events.e2e-spec.ts
│   │   │   └── audit-logs.e2e-spec.ts
│   │   ├── .env.example
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── mobile/                  ← MODIFIED (API integration)
│       └── src/
│           ├── api/             ← NEW
│           │   ├── client.ts
│           │   └── emailCards.ts
│           └── App.tsx          ← rewritten to call API
├── packages/shared/             ← unchanged (still source of seed data)
├── docker-compose.yml           ← NEW (Postgres 16)
├── package.json                 ← scripts updated
└── README.md                    ← Phase 2 run instructions
```

---

## Trimmed Prisma Schema (Phase 2 only)

This is what the database subagent should write to `apps/api/prisma/schema.prisma`. Models and enums are taken verbatim from `PRISMA_SCHEMA_DRAFT.md` with everything Outlook / AI-memory / billing-related stripped. **Do not add anything beyond what is listed.**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum EmailCardStatus {
  PENDING
  SENT
  REJECTED
  LATER
  EDITED
}

enum RiskLevel {
  LOW
  MEDIUM
  HIGH
}

enum FeedbackAction {
  APPROVED
  EDITED
  REJECTED
  REGENERATED
  SAVED_LATER
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  emailCards     EmailCard[]
  feedbackEvents FeedbackEvent[]
  auditLogs      AuditLog[]
}

model EmailCard {
  id              String          @id @default(cuid())
  userId          String
  fromName        String
  fromEmail       String
  subject         String
  receivedAt      DateTime
  summary         String
  senderIntent    String
  contextUsed     Json
  draftReply      String
  confidenceScore Int
  riskLevel       RiskLevel
  riskReason      String
  status          EmailCardStatus @default(PENDING)
  sentAt          DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  feedbackEvents FeedbackEvent[]
  auditLogs      AuditLog[]

  @@index([userId, status])
}

model FeedbackEvent {
  id          String         @id @default(cuid())
  userId      String
  emailCardId String
  action      FeedbackAction
  beforeText  String?
  afterText   String?
  createdAt   DateTime       @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  emailCard EmailCard @relation(fields: [emailCardId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([emailCardId])
}

model AuditLog {
  id          String   @id @default(cuid())
  userId      String
  emailCardId String?
  action      String
  metadata    Json?
  createdAt   DateTime @default(now())

  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  emailCard EmailCard? @relation(fields: [emailCardId], references: [id])

  @@index([userId])
}
```

---

## Endpoints (from PHASE_2_BACKEND_PROMPT.md)

| Method | Path | Behavior | Audit | Feedback |
|---|---|---|---|---|
| GET | `/email-cards` | List cards for current user, filterable by `?status=` | — | — |
| GET | `/email-cards/:id` | Single card or 404 | — | — |
| POST | `/email-cards` | Create card (status PENDING) | `card.created` | — |
| POST | `/email-cards/:id/approve` | Status → SENT, sets `sentAt` | `card.approved` | `APPROVED` |
| POST | `/email-cards/:id/reject` | Status → REJECTED | `card.rejected` | `REJECTED` |
| POST | `/email-cards/:id/later` | Status → LATER | `card.later` | `SAVED_LATER` |
| POST | `/email-cards/:id/regenerate` | Replaces `draftReply` with next placeholder | `card.regenerated` | `REGENERATED` (before/after) |
| PATCH | `/email-cards/:id/reply` | Updates `draftReply`, status → EDITED | `card.edited` | `EDITED` (before/after) |
| GET | `/audit-logs` | List recent audit rows for user | — | — |
| GET | `/feedback-events` | List recent feedback rows for user | — | — |

**Mobile-shape mapping:** Prisma returns uppercase enums (`PENDING`, `LOW`); mobile types use lowercase (`pending`, `low`). The `card-mapper.ts` helper converts Prisma `EmailCard` → wire-format JSON matching `packages/shared/src/types.ts:EmailCard`.

---

## Dev User Strategy

- Seed creates a `User` with id from `DEV_USER_ID` env var (or generated cuid if unset; the seed script prints the id).
- A `CurrentUser` param decorator reads `x-user-id` from the request, falling back to `process.env.DEV_USER_ID`.
- A `DevUserGuard` 401s if the resolved user does not exist in the DB.
- Mobile app sends `x-user-id: <demo id>` on every request, configured via `EXPO_PUBLIC_DEV_USER_ID`.

---

## Subagent Dispatch

Tasks are grouped so each subagent owns a coherent slice with minimal cross-talk. Dispatch in this order:

1. **Database subagent** (Task A) — schema, docker-compose, migration, seed. **Blocks all other backend work.**
2. **Backend subagent** (Task B) — NestJS app + all endpoints + business logic. Depends on A.
3. **QA subagent** (Task C) — e2e tests + assertions on audit/feedback rows. Depends on B.
4. **Mobile integration subagent** (Task D) — replace fake data wiring with API calls. Depends on B (can run in parallel with C).
5. **Docs** (Task E) — README + run instructions. Depends on A–D.

---

## Task A — Database Subagent

**Owns:** Postgres in Docker, Prisma schema + migration, seed script.

**Files:**
- Create: `docker-compose.yml` (root)
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/.env.example`
- Create: `apps/api/prisma/schema.prisma` (verbatim from "Trimmed Prisma Schema" above)
- Create: `apps/api/prisma/seed.ts`
- Run: `prisma migrate dev --name init` to generate `apps/api/prisma/migrations/.../migration.sql`

**Acceptance:**
- `docker compose up -d postgres` starts Postgres on `localhost:5433` (use 5433 to avoid colliding with any local 5432).
- `npm run prisma:migrate -w @replydeck/api` succeeds against the running container.
- `npm run prisma:seed -w @replydeck/api` creates 1 user + 5 email cards from the existing `packages/shared/src/fakeEmailCards.ts`.
- Demo user id is printed on seed and stable across re-seeds (use a fixed cuid via `DEV_USER_ID` if set; otherwise upsert by email `demo@replydeck.local`).

**`docker-compose.yml`:**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: replydeck
      POSTGRES_PASSWORD: replydeck
      POSTGRES_DB: replydeck
    ports:
      - "5433:5432"
    volumes:
      - replydeck_pg:/var/lib/postgresql/data

volumes:
  replydeck_pg:
```

**`apps/api/.env.example`:**

```
DATABASE_URL="postgresql://replydeck:replydeck@localhost:5433/replydeck?schema=public"
PORT=4000
DEV_USER_ID=
DEV_USER_EMAIL=demo@replydeck.local
DEV_USER_NAME=Demo User
CORS_ORIGIN=*
```

**`apps/api/package.json` (key parts):**

```json
{
  "name": "@replydeck/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "nest start",
    "start:dev": "nest start --watch",
    "build": "nest build",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "prisma:seed": "ts-node prisma/seed.ts",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "typecheck": "tsc --noEmit"
  },
  "prisma": { "seed": "ts-node prisma/seed.ts" }
}
```

**Seed strategy:** Import `fakeEmailCards` from `@replydeck/shared`. For each card, upsert by deterministic id (use `card_001`–`card_005`), converting `riskLevel` and `status` to uppercase enum values, parsing `receivedAt` to a `Date`. Also seed a small `regeneratedDrafts` lookup the API can read at runtime — but the canonical placeholder source for regenerate at runtime should live in `apps/api/src/email-cards/regenerated-drafts.ts` (Task B).

---

## Task B — Backend Subagent

**Owns:** NestJS app, all four modules, all 10 endpoints, audit/feedback writes.

**Depends on:** Task A complete (schema + generated client).

**Key files (full content required from the subagent):**

- `apps/api/src/main.ts` — `NestFactory.create(AppModule)`, `app.enableCors()`, `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`, listen on `process.env.PORT ?? 4000`.
- `apps/api/src/app.module.ts` — imports `ConfigModule.forRoot({ isGlobal: true })`, `PrismaModule`, `UsersModule`, `EmailCardsModule`, `FeedbackEventsModule`, `AuditLogsModule`.
- `apps/api/src/common/prisma.service.ts` — `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy`.
- `apps/api/src/common/prisma.module.ts` — `@Global()` providing `PrismaService`.
- `apps/api/src/common/current-user.decorator.ts` — param decorator returning `{ id: string }` from `req.user`.
- `apps/api/src/common/dev-user.guard.ts` — reads `x-user-id` header (or `DEV_USER_ID` env), looks up user via `PrismaService`, attaches to `req.user`, throws `UnauthorizedException` if not found. Apply globally via `APP_GUARD`.
- `apps/api/src/common/card-mapper.ts` — `toWireCard(card: PrismaEmailCard)` returning the mobile-shape JSON (lowercase enums, `receivedAt` as ISO string, `contextUsed` cast to `string[]`).
- `apps/api/src/email-cards/email-cards.controller.ts` — all 8 routes, `@UseGuards` already global. Uses `@CurrentUser()` to get `{id}`.
- `apps/api/src/email-cards/email-cards.service.ts` — single-method-per-action, each wrapping a `prisma.$transaction` that updates the card AND writes `AuditLog` AND (where applicable) `FeedbackEvent`. Throws `NotFoundException` if card missing or not owned by user.
- `apps/api/src/email-cards/regenerated-drafts.ts` — exports the `regeneratedDrafts` map (copied from `packages/shared/src/fakeEmailCards.ts`). `regenerate()` rotates by counting existing `REGENERATED` feedback events for the card.
- `apps/api/src/email-cards/dto/create-email-card.dto.ts` — `class-validator` DTO mirroring `EmailCard` minus `id`, `status`, `sentAt`, with lowercase enum coercion.
- `apps/api/src/email-cards/dto/update-reply.dto.ts` — `{ draftReply: string }` (`@IsString @MinLength(1)`).
- `apps/api/src/feedback-events/*` — controller `GET /feedback-events?limit=50&cursor=`, service queries by user, ordered by `createdAt desc`.
- `apps/api/src/audit-logs/*` — same shape as feedback-events.
- `apps/api/src/users/users.service.ts` — `findById`, `findOrThrow`. No public controller in Phase 2.

**Audit + feedback contract (must be enforced inside service transactions):**

| Endpoint | AuditLog.action | FeedbackEvent.action | Feedback before/after |
|---|---|---|---|
| POST `/email-cards` | `card.created` | — | — |
| POST `/email-cards/:id/approve` | `card.approved` | `APPROVED` | — |
| POST `/email-cards/:id/reject` | `card.rejected` | `REJECTED` | — |
| POST `/email-cards/:id/later` | `card.later` | `SAVED_LATER` | — |
| POST `/email-cards/:id/regenerate` | `card.regenerated` | `REGENERATED` | beforeText = old draft, afterText = new draft |
| PATCH `/email-cards/:id/reply` | `card.edited` | `EDITED` | beforeText = old draft, afterText = new draft |

`AuditLog.metadata` should include the prior status when status changes.

**Validation:** All POST/PATCH bodies validated by `ValidationPipe`. Reject unknown fields (`whitelist: true`).

**Acceptance:**
- `npm run start:dev -w @replydeck/api` starts on port 4000.
- `curl -H "x-user-id: <demo>" http://localhost:4000/email-cards` returns 5 cards.
- `curl -X POST -H "x-user-id: <demo>" http://localhost:4000/email-cards/card_001/approve` flips status to `sent` (lowercase in response), and a row appears in both `AuditLog` and `FeedbackEvent`.

---

## Task C — QA Subagent

**Owns:** End-to-end test suite proving every endpoint behaves and every action is logged.

**Depends on:** Task B.

**Setup:** A `test/setup.ts` that:
1. Loads a separate test DB URL (`DATABASE_URL_TEST` or appends `?schema=test_<uuid>`), runs `prisma migrate deploy` against it.
2. Provides `bootstrap()` returning `{ app, prisma, demoUserId }` via `Test.createTestingModule({ imports: [AppModule] })`.
3. Provides `resetDb()` that truncates all tables between tests.

**Test files (each ~5–10 cases):**

- `test/email-cards.e2e-spec.ts`:
  - `GET /email-cards` returns seeded cards with mobile-shape JSON (lowercase `riskLevel`, lowercase `status`).
  - `GET /email-cards/:id` returns one or 404.
  - `POST /email-cards` creates a card AND writes an `AuditLog{action: 'card.created'}`.
  - `approve` / `reject` / `later` each update status and create matching audit + feedback rows.
  - `regenerate` changes `draftReply`, writes feedback with `beforeText`/`afterText`.
  - `PATCH /:id/reply` updates draft and sets status to `edited`, writes feedback with `beforeText`/`afterText`.
- `test/feedback-events.e2e-spec.ts`: list endpoint returns rows sorted desc, paginated.
- `test/audit-logs.e2e-spec.ts`: list endpoint returns rows sorted desc.

**Acceptance:** `npm run test:e2e -w @replydeck/api` runs all suites green.

---

## Task D — Mobile Integration Subagent

**Owns:** Replace in-memory queue in the mobile app with API-driven state.

**Depends on:** Task B running locally (subagent verifies via `curl` first).

**Files:**
- Create: `apps/mobile/src/api/client.ts`

```ts
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-user-id": USER_ID,
      ...(init.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body) })
};
```

- Create: `apps/mobile/src/api/emailCards.ts` exporting typed wrappers around each endpoint, returning `EmailCard[]` / `EmailCard` from `@replydeck/shared`.
- Modify: `apps/mobile/src/App.tsx`
  - Replace `useState(fakeEmailCards)` initialization with `useEffect` that calls `listCards()`.
  - Add a loading state (simple spinner or empty placeholder) and error banner.
  - Each action handler (`sendCard`, `rejectCard`, `laterCard`, `regenerateCard`, `saveEdit`) calls the matching API method then refetches the queue.
  - Keep optimistic UI off for now — wait for API response before updating list (simpler, correctness first).

- Modify: `apps/mobile/.env.example` (or document in README): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DEV_USER_ID`.

**Acceptance:**
- With API + Postgres running and seeded, `npm run mobile` shows the 5 seeded cards and tapping Send / Reject / Later removes the card AND a corresponding row appears in `AuditLog` + `FeedbackEvent` (verified via `psql` or a follow-up `curl`).
- Static `fakeEmailCards.ts` is no longer imported anywhere in `apps/mobile/src/`. (It still lives in `packages/shared` as the seed source.)

---

## Task E — README / Run Instructions

**Owns:** Updating the root `README.md` with end-to-end Phase 2 setup.

**Sections to add:**

```md
## Phase 2 — Backend setup

### One-time

1. `docker compose up -d postgres`
2. `cp apps/api/.env.example apps/api/.env`
3. `npm install`
4. `npm run prisma:migrate -w @replydeck/api`
5. `npm run prisma:seed -w @replydeck/api`  → prints DEV_USER_ID

### Run the API

`npm run start:dev -w @replydeck/api`  (listens on http://localhost:4000)

### Run the mobile app against the API

Set in `apps/mobile/.env`:

EXPO_PUBLIC_API_URL=http://<your-lan-ip>:4000
EXPO_PUBLIC_DEV_USER_ID=<id printed by seed>

Then `npm run mobile` and scan with Expo Go.

### Run the test suite

`npm run test:e2e -w @replydeck/api`
```

---

## Self-Review Notes

- ✅ All 10 endpoints from `PHASE_2_BACKEND_PROMPT.md` covered.
- ✅ Audit log written on every mutation; feedback event on approve/reject/later/edit/regenerate.
- ✅ Regenerate uses placeholder text from `regenerated-drafts.ts` (no AI).
- ✅ No Outlook, AI, Stripe, or auth modules introduced.
- ✅ Mobile app reads from API, not static file.
- ✅ Schema is a strict subset of `PRISMA_SCHEMA_DRAFT.md` Phase 2 models.
- ✅ Run instructions cover Postgres, migration, seed, API, mobile.
