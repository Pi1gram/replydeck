import {
  AutoSendInputs,
  decideAutoSend
} from "../src/ai/auto-send-decision";

function baseInput(over: Partial<AutoSendInputs> = {}): AutoSendInputs {
  return {
    ai: {
      category: "C",
      riskLevel: "low",
      confidenceScore: 95
    },
    card: {
      hasAttachments: false
    },
    user: {
      autoSendEnabled: true
    },
    sender: {
      autoSendAllowed: true,
      autoSendDenied: false,
      pinAlwaysReview: false
    },
    ...over
  };
}

describe("decideAutoSend (Phase 5 trust gate)", () => {
  describe("happy path", () => {
    it("auto-sends a Category C, low-risk, high-confidence, allowlisted card", () => {
      const decision = decideAutoSend(baseInput());
      expect(decision.autoSend).toBe(true);
      expect(decision.gateId).toBe("all_gates_passed");
    });
  });

  describe("master toggle", () => {
    it("blocks when the user has auto-send disabled", () => {
      const decision = decideAutoSend(
        baseInput({ user: { autoSendEnabled: false } })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("master_toggle_off");
      expect(decision.reason).toContain("disabled");
    });
  });

  describe("sender gates", () => {
    it("blocks when there is no sender profile at all", () => {
      const decision = decideAutoSend(baseInput({ sender: null }));
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("no_sender_profile");
    });

    it("blocks when the sender is pinned as always-review", () => {
      const decision = decideAutoSend(
        baseInput({
          sender: {
            autoSendAllowed: true,
            autoSendDenied: false,
            pinAlwaysReview: true
          }
        })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("sender_pinned_always_review");
    });

    it("blocks when the sender is explicitly denied (even if also allowed)", () => {
      const decision = decideAutoSend(
        baseInput({
          sender: {
            autoSendAllowed: true,
            autoSendDenied: true,
            pinAlwaysReview: false
          }
        })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("sender_explicitly_denied");
    });

    it("blocks when the sender is not on the allowlist", () => {
      const decision = decideAutoSend(
        baseInput({
          sender: {
            autoSendAllowed: false,
            autoSendDenied: false,
            pinAlwaysReview: false
          }
        })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("sender_not_on_allowlist");
    });
  });

  describe("AI quality gates", () => {
    it("blocks when category is A", () => {
      const decision = decideAutoSend(
        baseInput({
          ai: { category: "A", riskLevel: "low", confidenceScore: 95 }
        })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("category_not_c");
    });

    it("blocks when category is B", () => {
      const decision = decideAutoSend(
        baseInput({
          ai: { category: "B", riskLevel: "low", confidenceScore: 95 }
        })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("category_not_c");
    });

    it("blocks when risk is medium", () => {
      const decision = decideAutoSend(
        baseInput({
          ai: { category: "C", riskLevel: "medium", confidenceScore: 95 }
        })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("risk_not_low");
    });

    it("blocks when risk is high", () => {
      const decision = decideAutoSend(
        baseInput({
          ai: { category: "C", riskLevel: "high", confidenceScore: 95 }
        })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("risk_not_low");
    });

    it("blocks when confidence is 89 (below threshold)", () => {
      const decision = decideAutoSend(
        baseInput({
          ai: { category: "C", riskLevel: "low", confidenceScore: 89 }
        })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("confidence_below_threshold");
    });

    it("auto-sends at exactly confidence 90 (boundary case)", () => {
      const decision = decideAutoSend(
        baseInput({
          ai: { category: "C", riskLevel: "low", confidenceScore: 90 }
        })
      );
      expect(decision.autoSend).toBe(true);
    });
  });

  describe("attachment gate", () => {
    it("blocks when the email has attachments", () => {
      const decision = decideAutoSend(
        baseInput({ card: { hasAttachments: true } })
      );
      expect(decision.autoSend).toBe(false);
      expect(decision.gateId).toBe("has_attachments");
    });
  });

  describe("gate ordering — first failure wins", () => {
    it("returns master_toggle_off when toggle off and other gates also fail", () => {
      const decision = decideAutoSend({
        ai: { category: "A", riskLevel: "high", confidenceScore: 10 },
        card: { hasAttachments: true },
        user: { autoSendEnabled: false },
        sender: null
      });
      expect(decision.gateId).toBe("master_toggle_off");
    });

    it("surfaces pinAlwaysReview ahead of denylist (so the operator sees the pin)", () => {
      const decision = decideAutoSend(
        baseInput({
          sender: {
            autoSendAllowed: true,
            autoSendDenied: true,
            pinAlwaysReview: true
          }
        })
      );
      expect(decision.gateId).toBe("sender_pinned_always_review");
    });
  });

  describe("reason text", () => {
    it("includes a non-empty reason for every decision", () => {
      const decisions = [
        decideAutoSend(baseInput()),
        decideAutoSend(baseInput({ user: { autoSendEnabled: false } })),
        decideAutoSend(baseInput({ sender: null })),
        decideAutoSend(baseInput({ card: { hasAttachments: true } }))
      ];
      for (const decision of decisions) {
        expect(decision.reason.length).toBeGreaterThan(0);
      }
    });
  });
});
