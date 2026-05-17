# Technical Architecture – ReplyDeck

## Simple architecture

```txt
React Native App
      |
Backend API
      |
PostgreSQL Database
      |
Redis Queue
      |
Microsoft Graph API
      |
AI Provider
      |
Stripe Billing
```

## Recommended monorepo

```txt
replydeck/
  apps/
    mobile/
      src/
        screens/
        components/
        hooks/
        api/
        types/
      app.json
      package.json

    api/
      src/
        modules/
          auth/
          users/
          microsoft/
          email-cards/
          ai/
          memory/
          billing/
          audit/
        common/
        main.ts
      prisma/
        schema.prisma
      package.json

  packages/
    shared/
      src/
        types/
        constants/
        validation/

  docs/
    PROJECT_CONTEXT.md
    MVP_SPEC.md
    ARCHITECTURE.md
    SECURITY_PRIVACY.md
    AI_LEARNING_ENGINE.md
    BUILD_PHASES.md

  docker-compose.yml
  package.json
  README.md
```

## Backend modules

### auth

Handles app auth and Microsoft OAuth.

Responsibilities:
- app sessions
- Microsoft login
- OAuth callback
- token refresh
- logout

### microsoft

Handles Outlook/Microsoft Graph.

Responsibilities:
- fetch inbox emails
- fetch email thread
- create reply
- send reply
- subscribe to email changes later
- delta sync later

### email-cards

Core product module.

Responsibilities:
- create email cards
- list pending cards
- get card detail
- approve card
- reject card
- regenerate card
- save for later
- edit card reply

### ai

LLM layer.

Responsibilities:
- summarize email
- draft reply
- classify risk
- score confidence
- generate alternative reply

### memory

Learning system.

Responsibilities:
- tone profile
- sender profile
- thread summary
- approved/rejected/edited feedback
- retrieve relevant context before drafting

### audit

Trust and compliance layer.

Responsibilities:
- log AI draft creation
- log user approvals
- log sends
- log edits
- log rejected replies
- log token connection/disconnection

### billing

Stripe subscription module.

Responsibilities:
- checkout session
- subscription status
- plan limits
- usage tracking

## API endpoints

### Auth

```txt
POST /auth/microsoft/start
GET  /auth/microsoft/callback
POST /auth/logout
GET  /auth/me
```

### Email cards

```txt
GET    /email-cards
GET    /email-cards/:id
POST   /email-cards/:id/approve
POST   /email-cards/:id/reject
POST   /email-cards/:id/later
POST   /email-cards/:id/regenerate
PATCH  /email-cards/:id/reply
```

### Outlook

```txt
POST /outlook/sync
GET  /outlook/messages/recent
```

### Settings

```txt
GET   /settings/tone-profile
PATCH /settings/tone-profile
DELETE /settings/delete-data
POST /settings/disconnect-outlook
```

## Data flow

### New email flow

```txt
New Outlook email
    ↓
Backend fetches email
    ↓
Backend fetches thread context
    ↓
Backend retrieves memory
    ↓
AI creates summary + reply + risk score
    ↓
EmailCard saved
    ↓
Mobile app shows card
```

### Approval flow

```txt
User taps Send
    ↓
Backend checks risk
    ↓
Backend checks user approval
    ↓
Backend sends reply through Microsoft Graph
    ↓
Audit log saved
    ↓
Feedback event saved
    ↓
Tone/sender profile updates
```

## Important architecture rule

Outlook remains the source of truth.

ReplyDeck only stores what it needs to power the approval queue.
