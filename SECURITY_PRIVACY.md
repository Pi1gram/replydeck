# Security and Privacy – ReplyDeck

## Main trust principle

```txt
Nothing sends without your explicit approval.
You decide what counts as approval.
```

There are two valid approval models:

1. **Per-card approval.** You tap Send. This is the default and applies to
   every email in Category A (important / personal) and Category B (routine).

2. **Pre-authorised category approval.** You explicitly opt in to auto-send
   for Category C (predictable, low-stakes — newsletters, transactional
   confirmations). You can scope this by sender or domain, and every
   auto-sent reply appears in the end-of-day wrap with one-tap revoke +
   one-tap "never auto-send this sender again".

The MVP must never blur these two models. Auto-send is opt-in, scoped,
visible after the fact, and revocable. Anything outside Category C requires
a per-card tap — no exceptions.

## User fear

Users will worry:

```txt
Can this app read all my emails?
Can it send something embarrassing?
Can it leak private information?
Can it store my full inbox?
Can I disconnect it?
```

The product must answer those fears clearly.

## Security rules

### 1. No email passwords

Never ask for Outlook password.

Use Microsoft OAuth only.

### 2. Least privilege

Request only the Microsoft permissions needed for MVP.

Start with:
- sign in
- read mail
- send mail
- offline access for token refresh

Do not request calendar, files, contacts, or shared mailbox access in MVP.

### 3. Human approval, always — but approval can be batched

The AI drafts. The AI never sends Category A or B emails without a
per-card tap from the user. The AI may send Category C emails only if the
user has explicitly enabled auto-send (master toggle in settings, plus the
sender/domain is on the auto-send allowlist).

The classifier may NEVER downgrade a card's category. If heuristics or the
LLM mark a card as A, no later step can re-route it to B or C. Risk floor
is enforced in `apps/api/src/ai/ai.service.ts` (the provider's output is
snapped back to the heuristic risk/category if it tries to soften them).

### 4. Home-screen send restrictions

A send-from-widget / send-from-notification action is allowed only if ALL
of the following are true:

```txt
category   = C  (or category = B with a per-card explicit user tap)
riskLevel  = low
confidenceScore >= 90
no legal/financial/HR/medical/regulatory signals
no angry/grievance language
no attachment dependency
thread context was checked
sender is on the user's auto-send allowlist (for the silent C path)
```

Otherwise the widget/notification button says:

```txt
Open app to review
```

### 4a. Auto-send guarantees

When a Category C email is auto-sent on the user's behalf, the system MUST:

```txt
1. Write an AuditLog row of action `card.auto_sent` with the full draft text.
2. Add the card to the daily wrap email queue for that user.
3. Include the recipient + draft text in the wrap email.
4. Offer a one-tap "revoke auto-send for this sender" link in the wrap.
5. Never auto-send to a sender that has been added to the do-not-auto-send
   list within the current 24h window.
```

A user revocation tap MUST take effect for the rest of that day immediately,
even if more emails from the same sender arrive in the meantime.

### 5. Minimal storage

Store only what is needed.

Store:
- message ID
- sender
- subject
- summary
- draft reply
- risk score
- status
- feedback events
- tone profile
- audit log

Avoid storing:
- full mailbox history
- unnecessary raw email body
- attachments
- sensitive documents

### 6. Encryption

Encrypt:
- Microsoft access tokens
- Microsoft refresh tokens
- stored draft replies
- sensitive memory items

Use:
- AWS KMS, Azure Key Vault, or another managed secret encryption system

### 7. Audit logs

Every important action creates an audit log:

```txt
AI draft created
Email card viewed
Reply edited
Reply approved
Reply sent
Reply rejected
Reply regenerated
Outlook connected
Outlook disconnected
Data deleted
```

### 8. User controls

User must be able to:

```txt
Disconnect Outlook
Delete all stored data
Disable AI learning
Disable home-screen approval
See what context was used
```

### 9. Do not store attachments in MVP

Attachments create too much privacy and security risk.

For MVP, detect if attachments exist and show:

```txt
This email has attachments. Open app to review manually.
```

### 10. Sensitive email detection

Mark as high risk if email includes:

- legal advice
- contracts
- money/payment
- HR
- firing/hiring
- medical
- personal relationship conflict
- angry language
- confidential documents
- regulatory/compliance matters

High-risk emails cannot be sent from widget.

## Security positioning for marketing

Use simple trust copy:

```txt
AI writes. You stay in control.
Important emails always wait for your tap.
Auto-send (when you turn it on) is scoped, visible in your daily wrap,
and revocable with one tap.
Your inbox stays in Outlook / Gmail.
You can disconnect any time.
Every action is logged.
```
