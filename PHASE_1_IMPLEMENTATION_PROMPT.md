# Phase 1 Implementation Prompt – Fake Mobile Demo

Use this prompt after the master prompt if you want the AI coding agent to start building.

---

Build Phase 1 only.

Create a React Native + Expo + TypeScript app for ReplyDeck.

Do not connect Outlook.
Do not use real AI.
Do not build backend yet.

The app should simulate the core product with fake email cards.

## Requirements

### Screens

1. Onboarding screen
2. Approval queue screen
3. Edit draft screen
4. Saved/Later screen
5. Security screen
6. Settings screen

### Main approval queue

The approval queue must show one email card at a time.

Each card shows:

- from name
- from email
- subject
- received time
- summary
- sender intent
- context used
- AI draft reply
- confidence score
- risk level
- risk reason

Actions:

- Send
- Edit
- Reject
- Regenerate
- Later

### Behaviour

- Send removes card and increments sent count
- Reject removes card and increments rejected count
- Later removes card and adds it to later list
- Regenerate changes the draft reply
- Edit opens edit screen and allows user to modify reply
- Save edit updates card reply and marks it edited
- Show empty state when queue is cleared

### Fake home-screen section

Inside the app, include a UI section that represents the future home-screen widget.

It should show:

- sender
- short summary
- Send / Later / Open buttons

But if riskLevel is medium or high, Send should become Review.

### Design

Make it feel premium, simple, and phone-native.

Use:
- dark background
- soft cards
- clear typography
- warm gold accent
- no clutter
- no generic AI robot imagery

### Fake data

Create at least 5 fake email cards.

Include:
- low-risk confirmation email
- medium-risk deadline email
- high-risk legal/contract email
- internal team email
- client follow-up email

### Types

Create shared TypeScript type:

```ts
export type RiskLevel = "low" | "medium" | "high";

export type EmailCardStatus =
  | "pending"
  | "sent"
  | "rejected"
  | "later"
  | "edited";

export type EmailCard = {
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
  riskLevel: RiskLevel;
  riskReason: string;
  status: EmailCardStatus;
};
```

### Output

Return:

1. file tree
2. install commands
3. all code files
4. how to run
5. what to build next

Stop after Phase 1.
