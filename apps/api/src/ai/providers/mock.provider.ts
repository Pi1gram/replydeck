import { Injectable } from "@nestjs/common";
import type { AiDraftInput, AiDraftResult, ToneId } from "../ai.types";
import type { CategoryAssessment } from "../classifier/category-classifier";
import type { RiskAssessment } from "../classifier/risk-heuristics";
import { resolveToneProfile } from "../prompts/build-user-prompt";
import type { AiProvider } from "./ai-provider.interface";

/**
 * Deterministic mock provider. Used:
 *   - in unit + e2e tests (no network, fast, reproducible),
 *   - when ANTHROPIC_API_KEY is absent (dev without the real provider).
 *
 * Output quality is intentionally mediocre — this is NOT a stand-in for
 * shipping. The goal is to keep the wiring fully exercised so the day we
 * drop in the real provider, nothing else changes.
 */
@Injectable()
export class MockProvider implements AiProvider {
  readonly name = "mock";

  async generate(args: {
    input: AiDraftInput;
    pre: { risk: RiskAssessment; category: CategoryAssessment };
  }): Promise<AiDraftResult> {
    const { input, pre } = args;
    const { toneApplied } = resolveToneProfile(input);

    const draftReply = mockDraft(input, toneApplied);
    const summary = mockSummary(input);
    const senderIntent = mockSenderIntent(input);

    return {
      summary,
      senderIntent,
      contextUsed: contextSnippets(input, pre),
      draftReply,
      confidenceScore: confidenceFor(pre),
      riskLevel: pre.risk.riskLevel,
      riskReason: pre.risk.riskReason,
      category: pre.category.category,
      toneApplied
    };
  }
}

function mockSummary(input: AiDraftInput): string {
  const subject = input.currentEmail.subject || "(no subject)";
  return `Mock summary of "${subject}" from ${input.currentEmail.fromName}.`;
}

function mockSenderIntent(input: AiDraftInput): string {
  const preview = input.currentEmail.bodyPreview.slice(0, 60).trim();
  return preview.length > 0
    ? `Sender appears to want: ${preview}…`
    : "Sender intent not detectable from preview.";
}

function contextSnippets(
  input: AiDraftInput,
  pre: { risk: RiskAssessment; category: CategoryAssessment }
): string[] {
  const out: string[] = [];
  if (input.thread.length > 0) {
    out.push(`${input.thread.length} prior message(s) in thread.`);
  }
  if (input.senderProfile) {
    out.push(`Sender profile present (${input.senderProfile.relationship ?? "unspecified relationship"}).`);
  }
  if (input.toneProfile) {
    out.push(`Tone profile: ${input.toneProfile.defaultTone}.`);
  }
  if (pre.risk.matchedSignals.length > 0) {
    out.push(`Risk signals: ${pre.risk.matchedSignals.join(", ")}.`);
  }
  return out.slice(0, 4);
}

function confidenceFor(pre: {
  risk: RiskAssessment;
  category: CategoryAssessment;
}): number {
  if (pre.risk.riskLevel === "high") return 35;
  if (pre.risk.riskLevel === "medium") return 65;
  if (pre.category.category === "C") return 92;
  return 80;
}

function mockDraft(input: AiDraftInput, tone: ToneId): string {
  const name = firstName(input.currentEmail.fromName);
  const attempt = input.regenerateAttempt ?? 0;

  if (tone === "formal") {
    const formal = [
      `Dear ${name},\n\nThank you for your email. I have noted the contents and will respond in detail shortly.\n\nKind regards`,
      `Dear ${name},\n\nI acknowledge receipt of your message and will provide a substantive response in due course.\n\nSincerely`,
      `Dear ${name},\n\nThank you for reaching out. I will review the details and follow up with a complete response soon.\n\nKind regards`
    ];
    return formal[attempt % formal.length];
  }
  if (tone === "friends") {
    const friendly = [
      `Hey ${name},\n\nGot it — will sort and reply properly soon.\n\nCheers`,
      `Hey ${name},\n\nThanks for the message — I'll come back to you shortly.`,
      `Hey ${name} — yep, on it. Reply incoming.`
    ];
    return friendly[attempt % friendly.length];
  }
  const business = [
    `Hi ${name},\n\nThanks — I've seen this and will come back to you with a proper reply shortly.\n\nThanks`,
    `Hi ${name},\n\nGot your note — will follow up with a full reply soon.\n\nBest`,
    `Hi ${name},\n\nThanks for the email. Reviewing now and will respond properly within the day.\n\nThanks`
  ];
  return business[attempt % business.length];
}

function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}
