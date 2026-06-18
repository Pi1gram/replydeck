# ReplyDeck — Current Status

> Updated 2026-05-17 (end of day). Single page handoff so anyone (Jas, Guy,
> the next coding session) can see where we are without scrolling the
> history. Replace this file's contents at the end of every working
> session.

## Where we are

**End-to-end working on real Outlook** — tested on Jas's iPhone via Expo
Go on 2026-05-17. Real Microsoft OAuth → real inbox sync → AI-drafted
cards → real reply send via Microsoft Graph, with the "Sent with
ReplyDeck AI" footer attached. Heuristic risk floor blocked high-risk
sends as designed.

Stopped here because **Anthropic credits ran out mid-test** — the rest
of the product is functional, AI just falls back to high-risk
placeholder cards until credits are topped up.

## What's shipped (Phases 1–5)

- ✅ Phase 1 — Expo/RN mobile app, fake card queue
- ✅ Phase 2 — NestJS API, Prisma, Postgres
- ✅ Phase 3 — Microsoft OAuth + encrypted tokens + real Graph send
- ✅ Phase 4 — Real Claude Sonnet 4.6 drafting + tone profiles + A/B/C
  routing + risk floor + Settings API
- ✅ Phase 5 (scaffolding) — bundle IDs reserved, `eas.json` + native
  build config, CI workflow, Mobile Settings UI (tone toggle + sender
  overrides), outbound "Sent with ReplyDeck AI" footer
- ✅ 91 e2e tests, all green; typecheck green; security review clean

## What's pending an external decision

| Blocker | Cost | Wait | What it unblocks |
|---|---|---|---|
| Guy sign-off on partnership card | — | TBD | Everything below |
| Apple Developer Program enrolment | $99 USD/yr | 24–48h after submit | `expo prebuild` + EAS Build + TestFlight |
| Google Play Console signup | $25 USD one-off | Immediate | Play Internal Testing |
| Anthropic credit top-up | ~$100 USD | Immediate after Guy approves | Real AI drafts resume |
| Expo + Firebase accounts | Free | Immediate | Build pipeline + future Android push |

See `PHASE_5_MANUAL_SETUP.md` for the full ordered checklist.

## What's actively being built (not yet pilot-visible)

- ✅ **Auto-send decision logic** — `decideAutoSend()` pure function at
  `apps/api/src/ai/auto-send-decision.ts` with 17 tests covering every
  gate (master toggle, sender allow/deny, pin, category, risk,
  confidence, attachments). Wires into sync next session once the
  schema migrates.
- ✅ **Learning loop foundation** — `LearningService` translates
  approve/edit/reject feedback events into MemoryItem rows (capped at
  20 per sender, 50 per user). EDITED uses crude word-set diff for
  pattern distillation; LLM-distillation is the future upgrade.
- 🚧 **Auto-send schema migration** — `ToneProfile.autoSendEnabled` +
  `SenderProfile.autoSendAllowed/Denied` deferred to next session
  (needed API restart and the user was mid-test).
- 🚧 **Daily wrap email** — needs Postmark or Resend account (not in
  partnership funding yet).

## What's next, in order

1. **Guy approves spend** → Anthropic credits + Apple/Play/Expo accounts.
2. **Phase 5 prebuild + first TestFlight build** → pilots install on
   their phones. ~1 day after Apple enrolment completes.
3. **Auto-send + daily wrap pipeline** finished → opt-in Category C
   auto-send, 6pm wrap email with revoke. ~3 days. Needs Postmark or
   Resend account (cheap).
4. **API deploy to Fly.io / Railway** → kill the cloudflared tunnel
   restart pain. ~2h + a partnership card. ~$5/month.
5. **Phase 6 — lock-screen widget + rich notification** → Guy's day-one
   memo feature. Plan in `PHASE_6_WIDGET_PLAN.md`. ~1 week. Depends on
   prebuild and Apple/Play accounts.
6. **Phase 7 — Gmail multi-account + voice composition** → Avec wedge.
7. **Phase 8 — Real auth + Stripe billing** → ship-ready.

## Reproducing the dev environment

```powershell
# Terminal 1 — Postgres
docker compose up -d postgres

# Terminal 2 — API (uses Node 20 via fnm)
cd apps\api
npm run start:dev

# Terminal 3 — cloudflared tunnel (only needed for phone OAuth)
& 'C:\Program Files (x86)\cloudflared\cloudflared.exe' tunnel --url http://localhost:4000
# → paste the printed URL into apps/api/.env (MICROSOFT_REDIRECT_URI +
#   APP_REDIRECT_AFTER_AUTH) and apps/mobile/.env (EXPO_PUBLIC_API_URL)
# → add the URL to Azure App Registration redirect URIs
# → restart API

# Terminal 4 — Expo
cd apps\mobile
npm run tunnel
# → scan QR with Expo Go on iPhone
```

If you see 401 "Unknown dev user", re-seed:
```powershell
npm run prisma:seed -w '@replydeck/api'
```

## Critical files & where they live

| Layer | Path |
|---|---|
| Mobile entry | `apps/mobile/src/App.tsx` |
| Mobile API client | `apps/mobile/src/api/client.ts` |
| Mobile settings screens | `apps/mobile/src/screens/{Tone,SenderProfiles,Settings}Screen.tsx` |
| API root | `apps/api/src/app.module.ts` |
| AI provider | `apps/api/src/ai/providers/anthropic.provider.ts` |
| Outbound footer | `apps/api/src/common/outbound-footer.ts` |
| Settings module | `apps/api/src/settings/` |
| Schema | `apps/api/prisma/schema.prisma` |
| Phase 5 manual setup | `PHASE_5_MANUAL_SETUP.md` |
| Phase 6 plan | `PHASE_6_WIDGET_PLAN.md` |
| Security posture | `SECURITY_PRIVACY.md` |
| Build phase plan | `BUILD_PHASES.md` |

## Known gotchas

- **Node 14 on system PATH** — fnm-managed Node 20 lives at
  `C:\Users\jasbh\AppData\Roaming\fnm\node-versions\v20.20.2\installation`.
  PowerShell profile already prepends it for new shells.
- **Dev DB needs seeding** after every `prisma migrate dev` that wipes
  the User table — run `npm run prisma:seed -w '@replydeck/api'`.
- **Anthropic credit-low** surfaces as HTTP 402 with a clear message;
  check https://console.anthropic.com/settings/billing first when AI
  drafts mysteriously stop working.
- **Cloudflared quick tunnel URL changes** every restart. Update both
  env files + Azure App Registration redirect URI when it does. For
  pilot, deploy the API behind a stable hostname instead.
- **`expo prebuild` is one-way** for the Expo Go dev loop — running it
  means Expo Go can no longer run the app. Don't do this until Apple
  Developer Program enrolment is complete.

## How a new coding session picks up

1. Read this file (`STATUS.md`) first.
2. Run `git log --oneline -10` for recent commit context (if commits
   have been made).
3. Check `MEMORY.md` index at
   `C:\Users\jasbh\.claude\projects\C--Users-jasbh-Desktop-New-folder-ReplyDeck-replydeck\memory\MEMORY.md`
   — gotchas, decisions, brand-name preference, ID reservations.
4. Run `npm run typecheck` + `npm run test:e2e -w '@replydeck/api'` to
   confirm the workspace is in a clean state.
