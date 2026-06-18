import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "../src/ai/ai.module";
import { AiService } from "../src/ai/ai.service";
import type { AiDraftInput } from "../src/ai/ai.types";

function makeInput(overrides: Partial<AiDraftInput> = {}): AiDraftInput {
  return {
    userId: "user_test_123",
    currentEmail: {
      fromName: "Test Sender",
      fromEmail: "sender@example.com",
      subject: "Quick question",
      receivedAt: "2026-05-17T09:00:00.000Z",
      bodyPreview: "Can we catch up next week?",
      hasAttachments: false
    },
    thread: [],
    toneProfile: null,
    senderProfile: null,
    memoryItems: [],
    ...overrides
  };
}

describe("AiService (mock provider, e2e wiring)", () => {
  let service: AiService;

  beforeAll(async () => {
    // Force the factory to take the mock branch even if .env says otherwise.
    process.env.AI_PROVIDER = "mock";
    delete process.env.ANTHROPIC_API_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AiModule
      ]
    }).compile();

    service = moduleRef.get(AiService);
  });

  describe("risk floor", () => {
    it("forces high risk when an attachment is present", async () => {
      const result = await service.generateDraft(
        makeInput({
          currentEmail: {
            ...makeInput().currentEmail,
            hasAttachments: true
          }
        })
      );
      expect(result.riskLevel).toBe("high");
    });

    it("forces high risk + category A on legal language", async () => {
      const result = await service.generateDraft(
        makeInput({
          currentEmail: {
            ...makeInput().currentEmail,
            subject: "Revised contract for your review",
            bodyPreview: "Please find attached the revised NDA."
          }
        })
      );
      expect(result.riskLevel).toBe("high");
      expect(result.category).toBe("A");
    });

    it("forces high risk on financial language", async () => {
      const result = await service.generateDraft(
        makeInput({
          currentEmail: {
            ...makeInput().currentEmail,
            subject: "Invoice payment update",
            bodyPreview:
              "Could you confirm the wire to account number 12345?"
          }
        })
      );
      expect(result.riskLevel).toBe("high");
    });
  });

  describe("category routing", () => {
    it("routes newsletter-like email to Category C", async () => {
      const result = await service.generateDraft(
        makeInput({
          currentEmail: {
            ...makeInput().currentEmail,
            fromName: "Acme Newsletter",
            subject: "Weekly digest — view in browser",
            bodyPreview: "Click here to unsubscribe at any time."
          }
        })
      );
      expect(result.category).toBe("C");
    });

    it("routes transactional confirmation to Category C", async () => {
      const result = await service.generateDraft(
        makeInput({
          currentEmail: {
            ...makeInput().currentEmail,
            subject: "Your order has shipped",
            bodyPreview: "Tracking number 1Z999AA10123456784. Shipping in 2 days."
          }
        })
      );
      expect(result.category).toBe("C");
    });

    it("respects sender pinning (always-review note)", async () => {
      const result = await service.generateDraft(
        makeInput({
          senderProfile: {
            senderEmail: "boss@example.com",
            notes: ["always-return — boss prefers manual review"]
          }
        })
      );
      expect(result.category).toBe("A");
    });

    it("routes routine correspondence to Category B by default", async () => {
      const result = await service.generateDraft(
        makeInput({
          currentEmail: {
            ...makeInput().currentEmail,
            subject: "Catch up next week?",
            bodyPreview: "Free Tuesday or Wednesday afternoon for coffee?"
          }
        })
      );
      expect(result.category).toBe("B");
    });
  });

  describe("tone application", () => {
    it("applies formal tone override when requested", async () => {
      const result = await service.generateDraft(
        makeInput({ toneOverride: "formal" })
      );
      expect(result.toneApplied).toBe("formal");
      // Mock provider uses "Dear" greeting for formal tone.
      expect(result.draftReply.startsWith("Dear")).toBe(true);
    });

    it("applies friends tone when sender profile prefers it", async () => {
      const result = await service.generateDraft(
        makeInput({
          senderProfile: {
            senderEmail: "buddy@example.com",
            preferredTone: "friends",
            notes: []
          }
        })
      );
      expect(result.toneApplied).toBe("friends");
    });

    it("defaults to business tone with no profile", async () => {
      const result = await service.generateDraft(makeInput());
      expect(result.toneApplied).toBe("business");
    });
  });

  describe("shape", () => {
    it("returns ≤4 contextUsed entries", async () => {
      const result = await service.generateDraft(makeInput());
      expect(result.contextUsed.length).toBeLessThanOrEqual(4);
    });

    it("returns confidenceScore in [0, 100]", async () => {
      const result = await service.generateDraft(makeInput());
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(100);
    });

    it("includes a non-empty draftReply", async () => {
      const result = await service.generateDraft(makeInput());
      expect(result.draftReply.length).toBeGreaterThan(0);
    });
  });
});
