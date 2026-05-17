# Microsoft / Outlook Setup — Phase 3

End-to-end checklist for connecting ReplyDeck's API to a real Outlook account
through Microsoft Graph. Once finished you'll be able to sync recent inbox
messages, see them as cards, edit a draft, approve, and watch a real reply
land in the recipient's inbox — with no autonomous send anywhere in the
pipeline.

> **Phase 3 safety rule.** A real Outlook reply is sent **only** in response
> to an explicit `POST /email-cards/:id/approve` call. There is no background
> job, no widget send, no auto-send. High-risk cards (attachments, etc.) are
> rejected before they ever reach the Graph API.

---

## 1. Register an Azure application

1. Go to <https://portal.azure.com> → **Microsoft Entra ID** →
   **App registrations** → **New registration**.
2. **Name:** `ReplyDeck Dev` (anything works).
3. **Supported account types:** *Accounts in any organizational directory and
   personal Microsoft accounts* (the `common` tenant). For a single tenant,
   pick the org-only option and put the tenant id into
   `MICROSOFT_TENANT_ID`.
4. **Redirect URI:** add a *Web* redirect of:
   ```
   http://localhost:4000/auth/microsoft/callback
   ```
   This must match `MICROSOFT_REDIRECT_URI` exactly (scheme, host, port,
   path).
5. Click **Register**. Note the **Application (client) ID** — this becomes
   `MICROSOFT_CLIENT_ID`.

### Client secret

1. Open the new app → **Certificates & secrets** → **New client secret**.
2. Description: `Phase 3 dev`. Expiry: 6 months is fine for development.
3. **Copy the *Value*** (not the Secret ID). This becomes
   `MICROSOFT_CLIENT_SECRET` and Azure won't let you read it again.

### API permissions (delegated scopes)

Open **API permissions** → **Add a permission** → **Microsoft Graph** →
**Delegated permissions**. Add **only** these:

| Scope | Why |
|---|---|
| `openid` | Required for OIDC sign-in. |
| `profile` | Lets `/me` return display name. |
| `email` | Lets `/me` return the user's email address. |
| `offline_access` | Required to receive a refresh token. |
| `User.Read` | Read the connected user's profile (for `/me`). |
| `Mail.Read` | Read inbox messages (`/me/messages`). |
| `Mail.Send` | Send a reply when the user approves a card. |

Per `SECURITY_PRIVACY.md`, do **not** add `Calendars.*`, `Files.*`,
`Contacts.*`, or shared-mailbox scopes in the MVP. Don't grant admin
consent unless you actually need it for org accounts.

---

## 2. Generate `TOKEN_ENCRYPTION_KEY`

Tokens are stored in Postgres encrypted with AES-256-GCM. You need a 32-byte
random key, hex-encoded:

```bash
openssl rand -hex 32
```

Copy the 64-character hex string into `apps/api/.env` as
`TOKEN_ENCRYPTION_KEY`.

> ⚠️ Keep this key out of git. Losing it means no existing connected account
> can be decrypted — every user has to re-connect.

---

## 3. Fill in `.env`

Open `apps/api/.env` (copy from `.env.example` if it doesn't exist) and set:

```
MICROSOFT_CLIENT_ID=<Application (client) ID from Azure>
MICROSOFT_CLIENT_SECRET=<client secret VALUE>
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=http://localhost:4000/auth/microsoft/callback
APP_REDIRECT_AFTER_AUTH=http://localhost:4000/auth/connected
TOKEN_ENCRYPTION_KEY=<output of openssl rand -hex 32>
OAUTH_COOKIE_SECURE=false
```

For production set `OAUTH_COOKIE_SECURE=true` (the OAuth state cookie will
only travel over HTTPS) and switch to a real first-party callback page.

---

## 4. Apply the Phase 3 migration

```bash
docker compose up -d postgres
npm install
npm run prisma:migrate -w @replydeck/api    # applies microsoft_outlook migration
npm run prisma:generate -w @replydeck/api
npm run prisma:seed -w @replydeck/api       # demo user + 5 Phase 2 cards
```

If `prisma generate` complains about `@prisma/client`, recreate the
workspace symlink (one-time fix documented in `README.md`):

```bash
ln -sf ../../../../node_modules/@prisma/client apps/api/node_modules/@prisma/client
npm run prisma:generate -w @replydeck/api
```

---

## 5. Run the API

```bash
npm run start:dev -w @replydeck/api
```

You should see `MicrosoftController {/outlook}`, `AuthController {/}` and the
new routes mapped:

```
/auth/me                       (GET)
/auth/microsoft/start          (POST)
/auth/microsoft/callback       (GET)
/auth/connected                (GET)
/settings/disconnect-outlook   (POST)
/outlook/sync                  (POST)
/outlook/messages/recent       (GET)
```

---

## 6. Connect Outlook (manual smoke test)

Phase 3 still uses the seeded dev user — there is no real user-auth UI yet.
The OAuth state cookie must travel with the browser, so this needs a browser,
not curl.

1. Ensure `apps/api/.env` has `DEV_USER_ID` set to the demo user id printed
   by the seed (default: `cmozb3wxt0000epl11g97atj3`).
2. From a browser-friendly tool (Postman, Insomnia, or `curl -c jar` plus
   `xdg-open`), POST to start the flow:

   ```bash
   curl -i -c /tmp/rd_cookies.txt \
        -H "x-user-id: cmozb3wxt0000epl11g97atj3" \
        -X POST http://localhost:4000/auth/microsoft/start
   ```

   Response is `{ "url": "https://login.microsoftonline.com/..." }`.
3. Open that URL in **the same browser session** that holds the cookies the
   server set. Sign in with the Microsoft account whose inbox you want to
   sync.
4. Microsoft redirects back to
   `http://localhost:4000/auth/microsoft/callback?...` — the server
   validates the state cookie, exchanges the PKCE code, encrypts the tokens,
   stores a `ConnectedEmailAccount` row, then 302s to
   `/auth/connected`.
5. Verify connection:

   ```bash
   curl -H "x-user-id: cmozb3wxt0000epl11g97atj3" http://localhost:4000/auth/me
   ```

   You should see `{ "outlook": { "connected": true, "email": "..." } }`.

> The simplest way to drive the OAuth handshake during development is to
> paste the URL from step 2 into a normal browser tab, then sign in. Cookies
> set by `/auth/microsoft/start` are scoped to the API origin, so visiting
> `localhost:4000` in the browser before clicking through works fine.

---

## 7. Sync recent emails into cards

```bash
curl -X POST -H "x-user-id: cmozb3wxt0000epl11g97atj3" \
     "http://localhost:4000/outlook/sync?top=10"
```

Response: `{ "created": ["...","..."], "skipped": 0 }`.

Re-run it: `created` should now be empty and `skipped` should equal the
count of messages we already saw — uniqueness is enforced by
`(userId, provider, providerMessageId)` using the immutable Graph id.

Inspect:

```bash
curl -H "x-user-id: cmozb3wxt0000epl11g97atj3" \
     "http://localhost:4000/email-cards?status=pending"
```

Cards backed by Outlook will have `provider: "OUTLOOK"` (in the DB; the
mobile-shape JSON keeps that field internal for now) and a placeholder
draft reply. AI fills the real draft in Phase 4.

---

## 8. Approve a card → real Outlook reply

> ⚠️ This will actually send. Use a test inbox or send to yourself first.

1. Pick a low-risk card from the sync (`riskLevel: "low"`).
2. Edit the draft to something safe:

   ```bash
   curl -X PATCH \
        -H "x-user-id: cmozb3wxt0000epl11g97atj3" \
        -H "Content-Type: application/json" \
        -d '{"draftReply":"Hi, just confirming I received your message."}' \
        http://localhost:4000/email-cards/<CARD_ID>/reply
   ```

3. Approve:

   ```bash
   curl -X POST \
        -H "x-user-id: cmozb3wxt0000epl11g97atj3" \
        http://localhost:4000/email-cards/<CARD_ID>/approve
   ```

4. Confirm the reply appears in the recipient's mailbox (and in your Sent
   folder in Outlook).

5. Audit the trail:

   ```bash
   curl -H "x-user-id: cmozb3wxt0000epl11g97atj3" \
        "http://localhost:4000/audit-logs?limit=20"
   ```

   Expect, in order:
   `card.created` → `card.edited` → `outlook.send.attempt` →
   `outlook.send.success` → `card.approved`.

   Re-running the approve on the same card writes
   `outlook.send.skipped_duplicate` and does **not** call Graph again —
   the safety check rejects re-sending a card whose status is already
   `SENT`.

---

## 9. Disconnect

```bash
curl -X POST -H "x-user-id: cmozb3wxt0000epl11g97atj3" \
     http://localhost:4000/settings/disconnect-outlook
```

Drops the `ConnectedEmailAccount` row and writes an
`outlook.disconnected` audit log. Existing email cards stay (so the audit
trail survives), but no further sync or send is possible until the user
re-connects.

---

## What Phase 3 deliberately does **not** do

- ❌ AI drafting / classification (Phase 4 replaces placeholder drafts).
- ❌ Production user auth (still the seeded dev user via `x-user-id`).
- ❌ Gmail integration.
- ❌ Stripe / billing.
- ❌ Background polling, webhooks, or any auto-send path.
- ❌ Storing or downloading attachments. `EmailCard.hasAttachments` is set
  from Graph's `hasAttachments` flag; cards with attachments are forced to
  `riskLevel = HIGH`.

> TODO (Phase 4+): Microsoft Graph's `hasAttachments` does **not** include
> *inline* attachments referenced in the message body. If we need to detect
> those reliably we'll have to inspect the message body or call
> `/messages/{id}/attachments`. For Phase 3 we accept the false negative.
