import type { RiskLevel } from "@replydeck/shared";
import type { AiDraftInput } from "../ai.types";

/**
 * Deterministic risk classifier. Runs before any LLM call so we have a
 * floor on risk regardless of how the model judges the draft.
 *
 * Sensitive categories are sourced from SECURITY_PRIVACY.md §10.
 *
 * Match anywhere in subject or body. Word-boundary on either side so
 * "contract" matches but "subcontracted" still matches via the broader
 * "contract" substring (intentional — we err on the side of HIGH).
 */
const HIGH_RISK_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(legal|lawyer|attorney|counsel|litigation)\b/i, reason: "legal language detected" },
  { pattern: /\b(contract|agreement|nda|t&cs|terms of service)\b/i, reason: "contract language detected" },
  { pattern: /\b(invoice|payment|wire|bank details|account number|iban|bsb|aud|usd|gbp|eur)\b/i, reason: "financial/payment detail detected" },
  { pattern: /\b(hr|fired|firing|hiring|salary|compensation|severance|redundancy)\b/i, reason: "HR/employment matter detected" },
  { pattern: /\b(medical|prescription|diagnosis|surgery|clinical|patient|health record)\b/i, reason: "medical content detected" },
  { pattern: /\b(confidential|nda|non-disclosure|privileged|restricted)\b/i, reason: "confidentiality marker detected" },
  { pattern: /\b(compliance|regulator|aml|kyc|gdpr|hipaa|soc ?2|iso ?27001)\b/i, reason: "regulatory matter detected" },
  { pattern: /\b(angry|furious|disappointed|unacceptable|breach|complaint|escalat|liability|sue)\b/i, reason: "high-emotion or grievance language detected" }
];

const MEDIUM_RISK_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(quote|proposal|estimate|deadline|deliverable|milestone)\b/i, reason: "commercial commitment language" },
  { pattern: /\b(reschedule|cancel|postpone|urgent|asap)\b/i, reason: "schedule/urgency change" },
  { pattern: /\b(introduce|introduction|connect|warm intro)\b/i, reason: "introduction request" }
];

export interface RiskAssessment {
  riskLevel: RiskLevel;
  riskReason: string;
  /** Raw matched phrases — useful for the daily wrap and debugging. */
  matchedSignals: string[];
}

export function assessRisk(input: AiDraftInput): RiskAssessment {
  const haystack = [
    input.currentEmail.subject,
    input.currentEmail.bodyPreview,
    ...input.thread.map((m) => m.bodyPreview)
  ].join(" \n ");

  if (input.currentEmail.hasAttachments) {
    return {
      riskLevel: "high",
      riskReason:
        "This email includes attachments and requires manual review.",
      matchedSignals: ["has_attachments"]
    };
  }

  const highMatches: string[] = [];
  for (const { pattern, reason } of HIGH_RISK_PATTERNS) {
    if (pattern.test(haystack)) {
      highMatches.push(reason);
    }
  }
  if (highMatches.length > 0) {
    return {
      riskLevel: "high",
      riskReason: highMatches[0],
      matchedSignals: highMatches
    };
  }

  const mediumMatches: string[] = [];
  for (const { pattern, reason } of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(haystack)) {
      mediumMatches.push(reason);
    }
  }
  if (mediumMatches.length > 0) {
    return {
      riskLevel: "medium",
      riskReason: mediumMatches[0],
      matchedSignals: mediumMatches
    };
  }

  return {
    riskLevel: "low",
    riskReason: "No sensitive signals detected.",
    matchedSignals: []
  };
}
