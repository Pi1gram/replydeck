import type {
  AiDraftInput,
  ToneId,
  ToneProfile
} from "../ai.types";
import type { CategoryAssessment } from "../classifier/category-classifier";
import type { RiskAssessment } from "../classifier/risk-heuristics";

const DEFAULT_TONES: Record<ToneId, ToneProfile> = {
  formal: {
    defaultTone: "formal",
    averageReplyLength: "3-6 sentences",
    preferredGreetings: ["Dear", "Hello"],
    preferredSignOffs: ["Kind regards", "Sincerely"],
    avoidPhrases: ["hey", "no worries", "cheers"],
    styleNotes: [
      "Use full names and titles where known.",
      "Avoid contractions.",
      "Be explicit about commitments and dates."
    ]
  },
  business: {
    defaultTone: "business",
    averageReplyLength: "2-4 sentences",
    preferredGreetings: ["Hi", "Hello"],
    preferredSignOffs: ["Thanks", "Best", "Kind regards"],
    avoidPhrases: [
      "I hope this email finds you well",
      "circling back",
      "just checking in"
    ],
    styleNotes: [
      "Lead with the answer.",
      "Confirm next step in the final sentence.",
      "Avoid filler."
    ]
  },
  friends: {
    defaultTone: "friends",
    averageReplyLength: "1-3 sentences",
    preferredGreetings: ["Hey", "Hi"],
    preferredSignOffs: ["Cheers", "Thanks", ""],
    avoidPhrases: ["Dear", "kind regards", "to whom it may concern"],
    styleNotes: [
      "Casual. Contractions are fine.",
      "Short. Don't over-explain.",
      "Drop the sign-off if it reads more natural without one."
    ]
  }
};

export function resolveToneProfile(
  input: AiDraftInput
): { profile: ToneProfile; toneApplied: ToneId } {
  const override = input.toneOverride;
  const senderPreferred = input.senderProfile?.preferredTone;
  const profileDefault = input.toneProfile?.defaultTone;

  const toneApplied: ToneId =
    override ?? senderPreferred ?? profileDefault ?? "business";

  if (input.toneProfile && input.toneProfile.defaultTone === toneApplied) {
    return { profile: input.toneProfile, toneApplied };
  }
  return { profile: DEFAULT_TONES[toneApplied], toneApplied };
}

/**
 * Build the per-user tone block that goes in the `system` field.
 *
 * Stable across requests for the same user → cacheable. Putting tone in
 * the system field (separate from the volatile per-email content) is what
 * makes the per-user cache layer work in `AnthropicProvider`.
 */
export function buildToneSystemBlock(args: {
  toneApplied: ToneId;
  tone: ToneProfile;
}): string {
  const { toneApplied, tone } = args;
  return [
    "TONE PROFILE — apply this voice to the draft.",
    "",
    `Tone: ${toneApplied}`,
    `Average reply length: ${tone.averageReplyLength}`,
    `Preferred greetings: ${tone.preferredGreetings.join(", ") || "(none)"}`,
    `Preferred sign-offs: ${tone.preferredSignOffs.join(", ") || "(none)"}`,
    `Avoid phrases: ${tone.avoidPhrases.join(", ") || "(none)"}`,
    `Style notes: ${tone.styleNotes.join(" / ") || "(none)"}`
  ].join("\n");
}

export interface EmailContextArgs {
  input: AiDraftInput;
  risk: RiskAssessment;
  category: CategoryAssessment;
}

/**
 * Build the per-request user message body — current email, thread, sender
 * profile, memory items, and the heuristic pre-assessment. Volatile by
 * design; not cached.
 */
export function buildEmailContextMessage(args: EmailContextArgs): string {
  const { input, risk, category } = args;

  const threadLines =
    input.thread.length === 0
      ? "(no prior messages in thread)"
      : input.thread
          .map((m, idx) => {
            const speaker = m.fromUser ? "USER" : m.fromName;
            return `[${idx + 1}] ${speaker} <${m.fromEmail}> @ ${m.receivedAt}\n${m.bodyPreview}`;
          })
          .join("\n---\n");

  const memoryBlock =
    input.memoryItems.length === 0
      ? "(no relevant memories)"
      : input.memoryItems
          .map((m) => `- (${m.scope}) ${m.content}`)
          .join("\n");

  const senderBlock = input.senderProfile
    ? [
        `email: ${input.senderProfile.senderEmail}`,
        input.senderProfile.relationship
          ? `relationship: ${input.senderProfile.relationship}`
          : null,
        input.senderProfile.formality
          ? `formality: ${input.senderProfile.formality}`
          : null,
        input.senderProfile.usualReplyLength
          ? `usual length: ${input.senderProfile.usualReplyLength}`
          : null,
        input.senderProfile.preferredTone
          ? `preferred tone: ${input.senderProfile.preferredTone}`
          : null,
        input.senderProfile.notes.length > 0
          ? `notes: ${input.senderProfile.notes.join("; ")}`
          : null
      ]
        .filter(Boolean)
        .join("\n")
    : "(no sender profile yet)";

  const regenerateBlock =
    input.regenerateAttempt && input.regenerateAttempt > 0
      ? [
          "",
          `REGENERATION ATTEMPT #${input.regenerateAttempt + 1}`,
          "The user wasn't satisfied with the previous draft. Produce a",
          "meaningfully different reply — different opening, different",
          "phrasing, different structure. Do not paraphrase the prior draft.",
          input.previousDraft
            ? `\nPREVIOUS DRAFT (avoid duplicating):\n${input.previousDraft}`
            : ""
        ]
          .filter(Boolean)
          .join("\n")
      : "";

  return [
    "CURRENT EMAIL:",
    `From: ${input.currentEmail.fromName} <${input.currentEmail.fromEmail}>`,
    `Subject: ${input.currentEmail.subject}`,
    `Received: ${input.currentEmail.receivedAt}`,
    `Has attachments: ${input.currentEmail.hasAttachments ? "yes" : "no"}`,
    "",
    "BODY PREVIEW:",
    input.currentEmail.bodyPreview || "(empty)",
    "",
    "THREAD CONTEXT (newest last):",
    threadLines,
    "",
    "SENDER PROFILE:",
    senderBlock,
    "",
    "RELEVANT MEMORIES:",
    memoryBlock,
    regenerateBlock,
    "",
    "HEURISTIC PRE-ASSESSMENT (you may revise riskLevel UP but not DOWN; you may move category B/C → A but not A → B/C):",
    `riskLevel:  ${risk.riskLevel}  (${risk.riskReason})`,
    `category:   ${category.category}  (${category.reason})`,
    "",
    "Return the JSON object now."
  ].join("\n");
}
