// Mirror of regeneratedDrafts in packages/shared/src/fakeEmailCards.ts.
// Kept local so the API does not depend on runtime knowledge of seed data
// shape and so newly created (non-seed) cards can fall through to a
// deterministic placeholder.

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

export const FALLBACK_REGENERATED_DRAFT = "Regenerated draft (placeholder).";
