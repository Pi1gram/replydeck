# Build Phases – ReplyDeck

## Rule

Do not build everything at once.

Build in small phases.

Each phase should run locally before moving to the next.

---

# Phase 1 – Fake mobile demo

## Goal

Make the product feel real without Outlook.

## Build

- React Native app
- fake email cards
- swipe/tap actions
- send/edit/reject/regenerate/later buttons
- nice mobile UI
- simple settings page
- security page

## Done when

You can demo this:

```txt
User opens app
Sees email card
Taps Send
Card disappears
Next card appears
```

---

# Phase 2 – Backend and database

## Goal

Store real cards and actions.

## Build

- Node.js backend
- PostgreSQL
- Prisma schema
- EmailCard API
- AuditLog API
- FeedbackEvent API

## Done when

Mobile app loads cards from backend.

---

# Phase 3 – Microsoft Outlook connection

## Goal

Connect real Outlook account.

## Build

- Microsoft OAuth
- store encrypted tokens
- fetch recent emails
- fetch email thread
- create EmailCards from Outlook emails

## Done when

User can connect Outlook and see real emails as cards.

---

# Phase 4 – AI drafting

## Goal

Turn Outlook emails into AI reply cards.

## Build

- AI provider service
- structured JSON prompt
- summary
- draft reply
- risk score
- confidence score
- context used

## Done when

Real Outlook emails get AI-generated reply cards.

---

# Phase 5 – Approve and send

## Goal

Send approved replies.

## Build

- approve endpoint
- risk check
- send reply through Microsoft Graph
- audit log
- feedback event

## Done when

User taps Send and reply sends from Outlook.

---

# Phase 6 – Learning engine

## Goal

AI improves over time.

## Build

- tone profile
- sender profile
- memory items
- learn from edits
- learn from approvals
- learn from rejects

## Done when

AI prompt includes prior context and style memory.

---

# Phase 7 – Home-screen layer

## Goal

Make it phone-native.

## Build

- push notifications
- actionable notifications
- iOS widget
- low-risk home-screen send
- open-app review for risky emails

## Done when

User can handle safe emails from phone home screen.

---

# Phase 8 – Subscription

## Goal

Charge users.

## Build

- Stripe checkout
- subscription status
- monthly card limit
- usage counter
- upgrade page

## Done when

Only paying users can process beyond free trial limit.
