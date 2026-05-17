import type { EmailCard } from "./types";

export const fakeEmailCards: EmailCard[] = [
  {
    id: "card_001",
    fromName: "Mia Chen",
    fromEmail: "mia@northstar.studio",
    subject: "Confirming tomorrow's design review",
    receivedAt: "2026-05-10T08:15:00+10:00",
    summary:
      "Mia is confirming the 10:30 AM design review and asking whether the latest mobile approval flow is still the focus.",
    senderIntent: "Confirm attendance and agenda.",
    contextUsed: [
      "Previous reply said the meeting remains at 10:30 AM",
      "Project notes mention the approval queue prototype",
      "No attachments required"
    ],
    draftReply:
      "Hi Mia,\n\nConfirmed for 10:30 AM tomorrow. Let’s keep the focus on the mobile approval flow and the send/edit/reject decision states.\n\nThanks,\nAlex",
    confidenceScore: 96,
    riskLevel: "low",
    riskReason: "Simple scheduling confirmation with thread context checked.",
    status: "pending"
  },
  {
    id: "card_002",
    fromName: "Sam Patel",
    fromEmail: "sam@orbitlegal.co",
    subject: "Deadline for updated statement of work",
    receivedAt: "2026-05-10T07:42:00+10:00",
    summary:
      "Sam needs the updated SOW by Friday and asks whether the current approval covers the extra implementation week.",
    senderIntent: "Clarify deadline and scope approval.",
    contextUsed: [
      "Last sent email mentioned Friday as a target date",
      "Draft SOW notes include an optional implementation week",
      "No signed approval found in mock context"
    ],
    draftReply:
      "Hi Sam,\n\nThanks for the note. I can aim to send the updated SOW by Friday. I’m checking the approval status for the extra implementation week and will avoid treating it as confirmed until we have that in writing.\n\nBest,\nAlex",
    confidenceScore: 82,
    riskLevel: "medium",
    riskReason:
      "Mentions scope and approval. Requires review before any commitment is made.",
    status: "pending"
  },
  {
    id: "card_003",
    fromName: "Priya Raman",
    fromEmail: "priya@halcyonpartners.com",
    subject: "Contract indemnity clause",
    receivedAt: "2026-05-09T18:26:00+10:00",
    summary:
      "Priya asks whether you accept the revised indemnity wording in the services agreement.",
    senderIntent: "Get acceptance of a legal contract change.",
    contextUsed: [
      "Thread contains contract negotiation language",
      "No legal approval in context",
      "Attachment dependency detected but attachments are not stored in MVP"
    ],
    draftReply:
      "Hi Priya,\n\nThanks for sending this through. I need to review the revised wording with the right context before responding, so I’m not able to confirm acceptance by email yet.\n\nRegards,\nAlex",
    confidenceScore: 64,
    riskLevel: "high",
    riskReason:
      "Legal contract issue with attachment dependency. App review is required.",
    status: "pending"
  },
  {
    id: "card_004",
    fromName: "Jordan Lee",
    fromEmail: "jordan@replydeck.internal",
    subject: "Can you sanity check the pilot invite copy?",
    receivedAt: "2026-05-09T16:08:00+10:00",
    summary:
      "Jordan wants a quick review of the pilot invite copy before sending it to five founders.",
    senderIntent: "Request internal feedback.",
    contextUsed: [
      "Recent internal thread about pilot users",
      "Tone profile prefers concise edits",
      "No sensitive customer data included"
    ],
    draftReply:
      "Hey Jordan,\n\nYes, send it through. I’ll focus on whether the copy makes the approval queue value clear without making it sound like a full inbox replacement.\n\nAlex",
    confidenceScore: 91,
    riskLevel: "low",
    riskReason: "Internal feedback request with no external commitment.",
    status: "pending"
  },
  {
    id: "card_005",
    fromName: "Elena Morris",
    fromEmail: "elena@fieldstonecap.com",
    subject: "Following up on ReplyDeck pilot access",
    receivedAt: "2026-05-09T14:31:00+10:00",
    summary:
      "Elena is following up on pilot access and asks whether her assistant can be included in the first test group.",
    senderIntent: "Get pilot timing and access details.",
    contextUsed: [
      "Previous sent email promised early pilot access",
      "Pilot list memory shows Elena as priority",
      "No enterprise/team inbox support in MVP"
    ],
    draftReply:
      "Hi Elena,\n\nYou’re still on the early pilot list. I’m keeping the first test group focused on individual Outlook accounts, so I’d start with your account first and bring your assistant in once the workflow is stable.\n\nBest,\nAlex",
    confidenceScore: 88,
    riskLevel: "medium",
    riskReason:
      "Touches access expectations and product scope. Review before sending.",
    status: "pending"
  }
];

export const regeneratedDrafts: Record<string, string[]> = {
  card_001: [
    "Hi Mia,\n\nYes, confirmed for 10:30 AM tomorrow. The mobile approval flow is still the right focus, especially the card states and quick actions.\n\nThanks,\nAlex",
    "Hi Mia,\n\nConfirmed. Let’s use tomorrow’s review for the approval queue flow, with extra attention on Send, Edit, Reject, Regenerate, and Later.\n\nAlex"
  ],
  card_002: [
    "Hi Sam,\n\nThanks. Friday is a workable target for the updated SOW. I’m still checking whether the added implementation week has formal approval, so I won’t treat that scope as confirmed yet.\n\nBest,\nAlex"
  ],
  card_003: [
    "Hi Priya,\n\nThanks for the revised clause. I need to review it properly before responding, so please do not treat this email as acceptance of the updated wording.\n\nRegards,\nAlex"
  ],
  card_004: [
    "Hey Jordan,\n\nSure. Send it over and I’ll look for clarity, tone, and whether it avoids positioning ReplyDeck as a full email client.\n\nAlex"
  ],
  card_005: [
    "Hi Elena,\n\nYou’re still included for early access. For the first pilot pass, I’m keeping testing to one Outlook account per user, then expanding once the approval flow is reliable.\n\nBest,\nAlex"
  ]
};
