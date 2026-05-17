# MVP Specification – ReplyDeck

## MVP goal

Build the smallest working version that proves users will process email through approval cards instead of opening Outlook.

## MVP user story

As a busy professional,
I want AI to prepare replies to my Outlook emails,
so I can approve them quickly from my phone.

## MVP flow

```txt
1. User opens app
2. User signs in with Microsoft
3. User connects Outlook
4. Backend reads recent emails
5. Backend generates AI reply cards
6. Mobile app shows cards
7. User approves, edits, rejects, regenerates, or saves for later
8. If approved, backend sends reply through Outlook
9. System logs the action
10. System learns from the action
```

## Phase 1 MVP – fake data only

Build this first.

### Screens

1. Onboarding screen
2. Mock approval queue
3. Card detail screen
4. Edit reply screen
5. Settings screen
6. Security/trust screen

### Fake email card fields

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

### Card actions

- Send
- Edit
- Reject
- Regenerate
- Later

For Phase 1, actions update local state only.

## Phase 2 MVP – backend

Add:

- API server
- PostgreSQL database
- Prisma schema
- EmailCard CRUD
- user table
- audit log table
- feedback event table

## Phase 3 MVP – Microsoft Outlook

Add:

- Microsoft OAuth login
- store encrypted tokens
- fetch recent Outlook messages
- fetch conversation thread
- create reply card
- send approved reply

## Phase 4 MVP – AI

Add:

- AI summary
- AI draft reply
- risk classification
- confidence score
- context-used explanation

The AI must return structured JSON.

## Phase 5 MVP – learning

Add:

- tone profile
- sender profile
- feedback events
- edited reply comparison
- memory retrieval

## Phase 6 MVP – phone-native layer

Add:

- push notifications
- actionable notifications
- iOS widget / home-screen layer
- only low-risk high-confidence emails can be sent from widget

## MVP success metrics

The MVP is successful if:

```txt
20 pilot users
$49 AUD/month willingness to pay
30+ email cards processed per user per week
users keep using it after 14 days
```
