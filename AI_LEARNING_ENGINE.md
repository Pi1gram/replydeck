# AI Learning Engine – ReplyDeck

## Important principle

Do not fine-tune the model in MVP.

Use:

```txt
Memory + retrieval + feedback
```

This is simpler, safer, cheaper, and easier to debug.

## What the AI needs before drafting

Before writing a reply, the system should gather:

```txt
Current email
Previous messages in the same thread
Previous replies from the user in that thread
Recent replies from user to same sender
User tone profile
Sender relationship profile
Relevant memory items
Risk rules
```

## The AI should output JSON

The AI must not return random prose.

It should return:

```json
{
  "summary": "Sarah wants confirmation on the revised timeline.",
  "senderIntent": "Confirm whether revised timeline works.",
  "contextUsed": [
    "Previous email in thread mentioned revised timeline.",
    "User usually replies formally to Sarah."
  ],
  "draftReply": "Thanks Sarah — the revised timeline works from our side. Please proceed accordingly.",
  "confidenceScore": 94,
  "riskLevel": "low",
  "riskReason": "Simple confirmation, no financial/legal commitment detected."
}
```

## Tone profile

Each user gets a tone profile.

Example:

```json
{
  "defaultTone": "warm, concise, professional",
  "averageReplyLength": "2-5 sentences",
  "preferredGreetings": ["Hi", "Thanks"],
  "preferredSignOffs": ["Kind regards", "Best"],
  "avoidPhrases": [
    "I hope this email finds you well",
    "circling back",
    "just checking in"
  ],
  "styleNotes": [
    "Thanks people first",
    "Uses direct confirmations",
    "Does not over-explain unless needed"
  ]
}
```

## Sender profile

Each recurring sender gets a profile.

Example:

```json
{
  "senderEmail": "sarah@example.com",
  "relationship": "client",
  "formality": "formal",
  "usualReplyLength": "short",
  "preferredTone": "professional",
  "notes": [
    "Often asks for confirmation on timelines",
    "User replies with clear yes/no plus next step"
  ]
}
```

## Memory items

Store useful patterns.

```ts
type MemoryItem = {
  id: string;
  userId: string;
  scope: "user" | "sender" | "thread" | "company";
  sourceType:
    | "approved_reply"
    | "edited_reply"
    | "rejected_reply"
    | "sent_email"
    | "thread_summary"
    | "sender_profile";
  content: string;
  sensitivityLevel: "low" | "medium" | "high";
  createdAt: string;
  expiresAt?: string;
};
```

## Feedback learning

### Approved

If user approves reply:

```txt
Save this as positive style example.
```

### Edited

If user edits reply:

```txt
Compare AI version vs edited version.
Learn what changed.
```

Example:

```txt
AI wrote: "I will review this shortly."
User changed to: "I’ll review this before Friday afternoon."

Learning:
User prefers specific timelines when they are already implied.
```

### Rejected

If user rejects:

```txt
Save as negative signal.
Avoid similar structure next time.
```

### Regenerated

If user regenerates:

```txt
First reply was not good enough.
Try a different tone or length.
```

### Later

If user saves for later:

```txt
Maybe this email needs more thinking or context.
Lower confidence on similar future emails.
```

## Prompt template

```txt
You are ReplyDeck, an AI email drafting assistant.

Your job:
- summarize the email
- identify what sender wants
- draft a reply in the user's style
- detect risk
- explain what context you used

Rules:
- Never invent facts.
- Never create commitments not supported by the thread.
- Never give legal, financial, medical, or HR advice.
- If unsure, mark riskLevel as high.
- Keep replies concise unless the user usually writes longer replies.
- Return JSON only.

Current email:
{{currentEmail}}

Thread context:
{{threadContext}}

User tone profile:
{{toneProfile}}

Sender profile:
{{senderProfile}}

Relevant memories:
{{memoryItems}}

Return JSON with:
summary
senderIntent
contextUsed
draftReply
confidenceScore
riskLevel
riskReason
```
