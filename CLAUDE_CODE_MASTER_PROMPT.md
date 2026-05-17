# Claude Code / Codex Master Prompt – ReplyDeck

Copy and paste this into Claude Code, Codex, Cursor, or another coding agent.

---

You are a senior full-stack engineer and product-minded technical founder.

We are building **ReplyDeck**, an Outlook-first, phone-native AI email approval queue.

## Simple explanation

ReplyDeck is not a full email app.

It is a phone remote control for Outlook.

The product does this:

```txt
Email comes in.
AI reads it.
AI writes a reply.
Phone shows a card.
User taps Send, Edit, Reject, Regenerate, or Later.
If user sends, the reply goes through Outlook.
AI learns from what the user did.
```

## Core product idea

The unique part is the **mobile approval queue**, not the AI drafting itself.

The experience should feel like Tinder/cards for email decisions.

The hierarchy is:

```txt
1. Home screen / notification
2. Approval card
3. Full app only when needed
4. Outlook remains the source of truth
```

## MVP stack

Use:

- React Native + Expo + TypeScript for mobile app
- Node.js + TypeScript for backend
- Prefer NestJS if project is being built from scratch
- PostgreSQL + Prisma
- Redis + BullMQ for background jobs
- Microsoft Graph API for Outlook
- OpenAI or Anthropic behind an AI provider abstraction
- Stripe for billing later

## MVP scope

Build Outlook first.

Do not build Gmail yet.

Do not build a full inbox.

Do not build calendar.

Do not build CRM.

Do not build enterprise team inboxes yet.

Do not build autonomous sending.

## Product screens

Mobile app needs:

1. Onboarding screen
2. Connect Outlook screen
3. Approval queue screen
4. Card detail screen
5. Edit draft screen
6. Later/saved queue
7. Settings screen
8. Security/trust screen
9. Subscription screen later

## Card data

Each email approval card should have:

```ts
type EmailCard = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  summary: string;
  senderIntent: string;
  contextUsed: string[];
  draftReply: string;
  confidenceScore: number;
  riskLevel: "low" | "medium" | "high";
  riskReason: string;
  status: "pending" | "sent" | "rejected" | "later" | "edited";
};
```

## User actions

Each card supports:

- Send
- Edit
- Reject
- Regenerate
- Later

Every action creates:

- audit log
- feedback event

## Security rules

Critical:

- no email passwords
- Microsoft OAuth only
- encrypt access tokens and refresh tokens
- human approval always required
- never send without approval
- do not store attachments in MVP
- store minimal email data
- show what context was used
- allow user to disconnect Outlook
- allow user to delete stored data
- home-screen send only for low-risk high-confidence emails

## Home-screen rule

Only allow sending from notification/widget if:

```txt
riskLevel = low
confidenceScore >= 90
no legal issue
no financial commitment
no contract issue
no HR issue
no medical issue
no angry/conflict language
no attachment dependency
thread context was checked
```

Otherwise require opening the app.

## AI rules

The AI must return structured JSON only.

It must produce:

- summary
- sender intent
- context used
- draft reply
- confidence score
- risk level
- risk reason

The AI must not:

- invent facts
- invent commitments
- promise timelines unless supported by context
- give legal/financial/medical/HR advice
- send anything itself

## Learning engine

Do not fine-tune in MVP.

Use memory + retrieval + feedback.

The system should learn from:

- approved replies
- edited replies
- rejected replies
- regenerated replies
- saved-for-later replies
- previous sent emails
- sender-specific style
- thread context

Create:

- ToneProfile
- SenderProfile
- MemoryItem
- FeedbackEvent

## Required backend modules

Create clean modules:

- auth
- users
- microsoft
- emailCards
- ai
- memory
- audit
- billing later

## Required data models

Create Prisma models for:

- User
- ConnectedEmailAccount
- EmailMessage
- EmailThread
- EmailCard
- DraftReply
- ToneProfile
- SenderProfile
- MemoryItem
- FeedbackEvent
- AuditLog
- Subscription
- UsageCounter

## Build approach

Do not build everything at once.

Start with Phase 1 only:

### Phase 1

Build a working mobile app with fake email cards.

Requirements:

- beautiful mobile UI
- queue of fake cards
- swipe or button actions
- send/reject/later removes card
- regenerate changes draft text
- edit allows changing draft
- show confidence and risk
- show context used
- include fake home-screen widget section inside app
- no real Outlook yet
- no real AI yet

After Phase 1 works, stop and explain how to run it.

## First task

Generate:

1. monorepo structure
2. install commands
3. shared TypeScript types
4. fake email card data
5. React Native approval queue screen
6. card component
7. edit draft screen
8. basic settings/security screen
9. clear run instructions

Do not add Microsoft Graph yet.

Do not add Stripe yet.

Do not add real AI yet.

Only build the fake demo first.
