# Security and Privacy – ReplyDeck

## Main trust principle

```txt
Nothing sends without explicit human approval.
```

This rule must never be broken in the MVP.

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

### 3. Human approval only

The AI can draft.

The AI cannot send.

The user must approve.

### 4. Home-screen send restrictions

Only allow sending from widget/notification if:

```txt
riskLevel = low
confidenceScore >= 90
no legal issue
no financial commitment
no contract language
no angry tone
no HR issue
no medical issue
no attachment dependency
thread context was checked
```

Otherwise the button says:

```txt
Open app to review
```

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
AI writes. You approve.
Nothing sends without you.
Your inbox stays in Outlook.
You can disconnect any time.
Every action is logged.
```
