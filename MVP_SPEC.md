# MVP Specification – ReplyDeck

> **Updated 2026-05-17** — aligned with Guy's May 2026 partnership memo.
> See `BUILD_PHASES.md` for the rebased sequencing.

## MVP goal

Prove that real users will run their inbox through AI approval cards
from their phone, including from the lock screen — and will pay for it.

## MVP user story

As a busy professional,
I want AI to triage and pre-draft my Outlook and Gmail replies,
so I can clear my inbox from my phone — often without unlocking it.

## MVP flow

```txt
 1. User opens app
 2. User signs in (Apple / Google / Microsoft)
 3. User connects Outlook and/or Gmail
 4. User picks tone (Formal / Business / Friends) and lookback (default 6 months)
 5. Backend pulls recent mail across all connected accounts
 6. AI drafts a reply + classifies risk + assigns Category (A/B/C)
 7. Lock-screen widget surfaces the next card
 8. Rich notification fires when each new email arrives
 9. User approves / edits / rejects / regenerates / saves for later
10. If approved, reply sends through Outlook / Gmail
11. If Category C and user has opted in to auto-send: reply sends silently,
    appears in tonight's 6pm wrap email
12. System logs the action and learns from it
```

## What Phase 1 of the MVP ships

This is Guy's day-one list, expressed as concrete deliverables.

### Surfaces

- Lock-screen widget (iOS + Android). Long-press opens full triage
  without unlocking.
- Rich notification with embedded AI draft preview + send/reject buttons.
- In-app card queue (existing Phase 1 demo evolved).

### Gestures (in-app + widget)

- Swipe right — send drafted reply.
- Swipe left — return to inbox and mark as unread.
- Centre button short-press — regenerate the draft.
- Centre button long-hold — voice dictation (Phase 7).
- Tap card — open and edit the reply manually.

### Onboarding

- Sign in (Apple / Google / Microsoft).
- Connect Outlook and/or Gmail.
- Choose default tone: Formal / Business / Friends.
- Opt in to email context lookback (default 6 months, adjustable).
- Consent screen for AI processing of email content.

### Tone

- Three presets: Formal, Business, Friends.
- Per-contact tone override.
- Per-domain tone override.

### Category routing (A/B/C)

- **A** — important personal email. Always returned for review. Never
  auto-sent.
- **B** — routine correspondence. Draft and ask for approval.
- **C** — predictable, low-stakes (newsletters, transactional). Eligible
  for auto-send if user has enabled the master toggle AND the sender or
  domain is on the auto-send allowlist.

### Auto-send

- Master toggle in settings, off by default.
- Per-sender and per-domain allowlist + denylist.
- Daily wrap email at user-configured time (default 6pm local) listing
  every auto-sent reply with full text + one-tap "revoke and never
  auto-send this sender again".
- All auto-sends written to `AuditLog` with full draft text.

### Email signature

- Outbound replies include a small footer: "Sent with ReplyDeck AI"
  (with link). Toggleable per-user; on by default for the pilot.

### AI

- Real Anthropic Claude draft, summary, sender intent, risk, category.
- Tone profile applied per user, overridable per sender.
- Risk classifier with heuristic floor — provider can never downgrade.

### Security

- Tokens encrypted at rest (envelope encryption, KMS in prod).
- Biometric app lock (Face ID, Touch ID, fingerprint).
- No data resale, no advertising, no third-party sharing of email content.
- One-tap disconnect / delete-all-data.
- Every action audit-logged.

### Platforms

- iOS (iPhone and iPad).
- Android (phone and tablet).
- Full feature parity from day one.

### Providers

- Outlook + Microsoft 365 (including send-as aliases).
- Gmail (including send-as aliases).
- Multiple accounts per user, unified queue.

### Plus

- AI-prioritised inbox.
- Snooze to time/date.
- One-tap unsubscribe.
- Search.
- Dark mode.
- Shake-to-undo on any swipe action.

## MVP success metrics

```txt
 5 pilot users (Guy memo step 4)
$49 AUD/month willingness to pay (subject to dynamic-pricing review
   after Phase 2 cost-base data is in)
30+ email cards processed per user per week
users keep using it after 14 days
```

## Out of MVP (Guy's Phase 2 territory)

- Attachment read + summarise
- Send attachments from cloud storage
- Folder cleanup / auto-organise
- Meeting coordination via Outlook calendar
- Apple Watch / CarPlay / Android Auto / macOS / web
- iCloud Mail / IMAP / Exchange
- NL search, action items, tone-shift detection, multi-language
- Project memory, contact history cards
- Third-party integrations (calendars, tasks, Slack, Teams, CRMs)
- Encrypted threads, compliance certs, data residency, SSO
