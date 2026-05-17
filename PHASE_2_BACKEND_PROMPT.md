# Phase 2 Backend Prompt – API and Database

Use this after Phase 1 is working.

---

Build Phase 2 only.

Add backend and database for ReplyDeck.

Do not add Microsoft Outlook yet.
Do not add real AI yet.
Do not add Stripe yet.

## Stack

- Node.js
- TypeScript
- NestJS preferred
- PostgreSQL
- Prisma

## Required modules

- users
- emailCards
- feedbackEvents
- auditLogs

## Required endpoints

```txt
GET    /email-cards
GET    /email-cards/:id
POST   /email-cards
POST   /email-cards/:id/approve
POST   /email-cards/:id/reject
POST   /email-cards/:id/later
POST   /email-cards/:id/regenerate
PATCH  /email-cards/:id/reply
GET    /audit-logs
GET    /feedback-events
```

## Behaviour

- Cards are stored in database
- Approve marks card as SENT
- Reject marks card as REJECTED
- Later marks card as LATER
- Regenerate changes draftReply using fake generated text
- Edit updates draftReply and marks as EDITED
- Every action creates audit log
- Every action creates feedback event where appropriate

## Required output

1. backend file structure
2. Prisma schema
3. seed script with fake cards
4. controllers/routes
5. services
6. DTOs/validation
7. local run instructions
8. mobile app API integration instructions

Stop after Phase 2.
