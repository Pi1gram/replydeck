# Phase 3 Outlook Prompt – Microsoft Graph Integration

Use this after backend and fake mobile app are working.

---

Build Phase 3 only.

Add Microsoft Outlook connection through Microsoft Graph.

## Rules

- OAuth only
- never ask for email password
- store encrypted tokens
- do not store attachments
- do not send anything yet unless user approves through existing card action
- keep Outlook as source of truth

## Required features

1. Microsoft OAuth login
2. OAuth callback
3. token storage
4. token refresh
5. fetch recent inbox messages
6. fetch message thread/conversation
7. create EmailCard records from fetched Outlook messages

## Required Microsoft service methods

```ts
startOAuth(userId: string): Promise<string>
handleOAuthCallback(code: string): Promise<void>
refreshAccessToken(accountId: string): Promise<void>
getRecentMessages(userId: string): Promise<OutlookMessage[]>
getMessageThread(userId: string, messageId: string): Promise<OutlookMessage[]>
sendReply(userId: string, messageId: string, body: string): Promise<void>
```

## Safety

For this phase, if an email has attachments, still create a card but mark riskLevel as high and riskReason as:

```txt
This email includes attachments and requires manual review.
```

## Required output

1. env variables needed
2. Microsoft app registration instructions
3. backend auth routes
4. Microsoft service code
5. database changes if needed
6. test flow
7. local run instructions

Stop after Phase 3.
