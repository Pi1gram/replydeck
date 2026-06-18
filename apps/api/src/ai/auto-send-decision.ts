import type { RiskLevel } from "@replydeck/shared";
import type { Category } from "./ai.types";

/**
 * Phase 5 (Guy memo) — auto-send eligibility for Category C emails.
 *
 * Pure function with no I/O. Wires into MicrosoftService.syncRecentInboxToCards
 * (next session, once the autoSend* schema fields are migrated). Returns
 * an explicit decision + a one-line reason — the reason is what gets
 * written to the audit log so a future operator can always answer "why
 * did this email get auto-sent" or "why was it held for review".
 *
 * **Trust contract** (matches SECURITY_PRIVACY.md):
 *   - The user must have enabled auto-send globally (master toggle).
 *   - The specific sender must be on the user's auto-send allowlist.
 *   - The sender must NOT be on the user's auto-send denylist (deny wins).
 *   - The card must be category C, risk low, confidence >= 90.
 *   - The email must have no attachments (defensive — Graph's
 *     hasAttachments is best-effort).
 *   - Any failure of any gate falls back to "manual review".
 *
 * Adding a gate? Add a `Gate` record below and the function picks it up.
 * Don't sprinkle if-statements through the body.
 */

export interface AutoSendInputs {
  readonly ai: {
    readonly category: Category;
    readonly riskLevel: RiskLevel;
    readonly confidenceScore: number;
  };
  readonly card: {
    readonly hasAttachments: boolean;
  };
  readonly user: {
    /** ToneProfile.autoSendEnabled — master toggle. */
    readonly autoSendEnabled: boolean;
  };
  readonly sender:
    | {
        readonly autoSendAllowed: boolean;
        readonly autoSendDenied: boolean;
        readonly pinAlwaysReview: boolean;
      }
    | null;
}

export interface AutoSendDecision {
  readonly autoSend: boolean;
  readonly reason: string;
  /**
   * Which gate produced the decision. Stable identifier for analytics —
   * matches the keys in the `GATES` table below.
   */
  readonly gateId: AutoSendGateId;
}

const GATE_IDS = [
  "master_toggle_off",
  "no_sender_profile",
  "sender_pinned_always_review",
  "sender_explicitly_denied",
  "sender_not_on_allowlist",
  "category_not_c",
  "risk_not_low",
  "confidence_below_threshold",
  "has_attachments",
  "all_gates_passed"
] as const;
export type AutoSendGateId = (typeof GATE_IDS)[number];

const CONFIDENCE_THRESHOLD = 90;

interface Gate {
  readonly id: AutoSendGateId;
  readonly check: (i: AutoSendInputs) => boolean;
  readonly failureReason: string;
}

/**
 * Order matters: gates fail-fast top to bottom. Put the explicit
 * "always-review" gates first so they surface in the audit log even when
 * other gates would also have blocked.
 */
const GATES: Gate[] = [
  {
    id: "master_toggle_off",
    check: (i) => i.user.autoSendEnabled,
    failureReason: "User has auto-send disabled."
  },
  {
    id: "no_sender_profile",
    check: (i) => i.sender !== null,
    failureReason: "No sender profile — defaulting to manual review."
  },
  {
    id: "sender_pinned_always_review",
    check: (i) => i.sender !== null && !i.sender.pinAlwaysReview,
    failureReason: "Sender is pinned as always-review."
  },
  {
    id: "sender_explicitly_denied",
    check: (i) => i.sender !== null && !i.sender.autoSendDenied,
    failureReason: "Sender is on the do-not-auto-send list."
  },
  {
    id: "sender_not_on_allowlist",
    check: (i) => i.sender !== null && i.sender.autoSendAllowed,
    failureReason: "Sender is not on the auto-send allowlist."
  },
  {
    id: "category_not_c",
    check: (i) => i.ai.category === "C",
    failureReason: "Only Category C emails are eligible for auto-send."
  },
  {
    id: "risk_not_low",
    check: (i) => i.ai.riskLevel === "low",
    failureReason: "Only low-risk emails are eligible for auto-send."
  },
  {
    id: "confidence_below_threshold",
    check: (i) => i.ai.confidenceScore >= CONFIDENCE_THRESHOLD,
    failureReason: `Confidence below threshold of ${CONFIDENCE_THRESHOLD}.`
  },
  {
    id: "has_attachments",
    check: (i) => !i.card.hasAttachments,
    failureReason: "Email has attachments — manual review required."
  }
];

export function decideAutoSend(input: AutoSendInputs): AutoSendDecision {
  for (const gate of GATES) {
    if (!gate.check(input)) {
      return {
        autoSend: false,
        reason: gate.failureReason,
        gateId: gate.id
      };
    }
  }
  return {
    autoSend: true,
    reason: "All eligibility gates passed.",
    gateId: "all_gates_passed"
  };
}
