import type { AiDraftInput, Category } from "../ai.types";
import type { RiskAssessment } from "./risk-heuristics";

/**
 * Category A/B/C router from Guy's May 2026 memo.
 *
 *   A — Important emails to the user personally. Always returned for review.
 *       Never auto-sent.
 *   B — Routine correspondence worth handling. Swiper drafts, user approves
 *       before sending.
 *   C — Predictable, low-stakes emails. Eligible for auto-send when the
 *       user has opted in.
 *
 * This is a deterministic first pass; the LLM may later reclassify within
 * limits, but it can never *downgrade* A → B/C in MVP. A users can also
 * pin senders/domains as always-A regardless of content.
 */

export interface CategoryAssessment {
  category: Category;
  reason: string;
  /** Concrete features that fed the decision — used in audit metadata. */
  signals: string[];
}

const NEWSLETTER_HINTS = [
  /unsubscribe/i,
  /view in browser/i,
  /you are receiving this/i,
  /update your preferences/i,
  /no[- ]?reply@/i
];

const TRANSACTIONAL_HINTS = [
  /your (order|booking|reservation|invoice|receipt)/i,
  /confirmation number/i,
  /shipping/i,
  /tracking number/i,
  /password reset/i,
  /verification code/i,
  /one-time (code|password)/i
];

const PERSONAL_FIRST_PERSON_HINTS = [
  /\b(personally|just between us|off the record|family|kids?|my (wife|husband|partner|parent))\b/i
];

export function classifyCategory(
  input: AiDraftInput,
  risk: RiskAssessment
): CategoryAssessment {
  const signals: string[] = [];

  if (risk.riskLevel === "high") {
    return {
      category: "A",
      reason: "High risk — must be reviewed personally.",
      signals: ["risk_high", ...risk.matchedSignals]
    };
  }

  const hay = `${input.currentEmail.subject}\n${input.currentEmail.bodyPreview}`;

  for (const pattern of PERSONAL_FIRST_PERSON_HINTS) {
    if (pattern.test(hay)) {
      signals.push("personal_language");
      return {
        category: "A",
        reason: "Personal language detected — return to user.",
        signals
      };
    }
  }

  const senderMatchesPin = input.senderProfile?.notes.some((note) =>
    /always[- ]?return|always[- ]?review|pin/i.test(note)
  );
  if (senderMatchesPin) {
    signals.push("sender_pinned_always_review");
    return {
      category: "A",
      reason: "Sender is pinned as always-review.",
      signals
    };
  }

  const newsletterMatch = NEWSLETTER_HINTS.some((p) => p.test(hay));
  const transactionalMatch = TRANSACTIONAL_HINTS.some((p) => p.test(hay));

  if (newsletterMatch || transactionalMatch) {
    if (newsletterMatch) signals.push("newsletter");
    if (transactionalMatch) signals.push("transactional");
    return {
      category: "C",
      reason: newsletterMatch
        ? "Newsletter / marketing email."
        : "Transactional confirmation.",
      signals
    };
  }

  if (risk.riskLevel === "medium") {
    signals.push("risk_medium");
    return {
      category: "B",
      reason: "Routine correspondence — draft and ask for approval.",
      signals
    };
  }

  return {
    category: "B",
    reason: "Default routing — draft and ask for approval.",
    signals
  };
}
