/**
 * Phase 4.7 smoke test — run a real generateDraft call against Anthropic.
 *
 * Run from apps/api:
 *   npx ts-node scripts/smoke-anthropic.ts
 *
 * Verifies:
 *   1. SDK call shape (no 400, no auth error)
 *   2. JSON output parses through zodOutputFormat
 *   3. Cache write on call 1, cache read on call 2 (same tone + system prefix)
 *   4. Risk floor still wins (we send a high-risk fixture and the response stays high)
 *
 * Costs ~$0.03 across both calls. Safe to re-run.
 */
import "reflect-metadata";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import { AnthropicProvider } from "../src/ai/providers/anthropic.provider";
import { assessRisk } from "../src/ai/classifier/risk-heuristics";
import { classifyCategory } from "../src/ai/classifier/category-classifier";
import type { AiDraftInput } from "../src/ai/ai.types";

function makeInput(overrides: Partial<AiDraftInput> = {}): AiDraftInput {
  return {
    userId: "user_smoke_test",
    currentEmail: {
      fromName: "Mia Chen",
      fromEmail: "mia@example.com",
      subject: "Quick check — tomorrow's review",
      receivedAt: "2026-05-17T09:00:00.000Z",
      bodyPreview:
        "Hi — can we still do 10am tomorrow? I'd love to focus on the approval queue flow and what happens after a user taps Send. Free to push to 10:30 if that's better.",
      hasAttachments: false
    },
    thread: [
      {
        fromEmail: "mia@example.com",
        fromName: "Mia Chen",
        receivedAt: "2026-05-16T15:00:00.000Z",
        bodyPreview: "Locking in our review for tomorrow — looking forward to it.",
        fromUser: false
      },
      {
        fromEmail: "user@example.com",
        fromName: "User",
        receivedAt: "2026-05-16T16:00:00.000Z",
        bodyPreview: "Sounds good — 10am works.",
        fromUser: true
      }
    ],
    toneProfile: {
      defaultTone: "business",
      averageReplyLength: "2-3 sentences",
      preferredGreetings: ["Hi"],
      preferredSignOffs: ["Thanks", "Best"],
      avoidPhrases: ["I hope this email finds you well", "circling back"],
      styleNotes: ["Lead with the answer.", "Avoid filler."]
    },
    senderProfile: null,
    memoryItems: [],
    ...overrides
  };
}

async function callOnce(
  provider: AnthropicProvider,
  input: AiDraftInput,
  label: string
): Promise<void> {
  console.log(`\n=== ${label} ===`);
  const start = Date.now();
  const risk = assessRisk(input);
  const category = classifyCategory(input, risk);
  console.log(
    `heuristic floor: risk=${risk.riskLevel} category=${category.category}`
  );

  const result = await provider.generate({ input, pre: { risk, category } });
  const elapsed = Date.now() - start;
  console.log(`elapsed: ${elapsed}ms`);
  console.log("---");
  console.log(`summary:        ${result.summary}`);
  console.log(`senderIntent:   ${result.senderIntent}`);
  console.log(`category:       ${result.category}`);
  console.log(`riskLevel:      ${result.riskLevel}  (${result.riskReason})`);
  console.log(`confidence:     ${result.confidenceScore}`);
  console.log(`toneApplied:    ${result.toneApplied}`);
  console.log(`contextUsed:`);
  for (const c of result.contextUsed) console.log(`  - ${c}`);
  console.log(`draftReply:`);
  console.log(
    result.draftReply
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n")
  );
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY missing. Aborting.");
    process.exit(1);
  }
  const provider = new AnthropicProvider({
    apiKey,
    effort: "medium"
  });

  // --- Call 1: low-risk routine email (should write cache) ---
  await callOnce(
    provider,
    makeInput(),
    "Call 1 — low-risk routine (expect cache WRITE)"
  );

  // --- Call 2: same tone + system prefix, different email (should hit cache) ---
  await callOnce(
    provider,
    makeInput({
      currentEmail: {
        fromName: "Jordan Park",
        fromEmail: "jordan@example.com",
        subject: "Thoughts on the landing page draft?",
        receivedAt: "2026-05-17T11:30:00.000Z",
        bodyPreview:
          "Hey — sending over the landing page draft. Want to make sure the tone matches before we go live. Any quick reactions?",
        hasAttachments: false
      },
      thread: []
    }),
    "Call 2 — same tone profile, different email (expect cache READ)"
  );

  // --- Call 3: high-risk fixture (should snap risk to high) ---
  await callOnce(
    provider,
    makeInput({
      currentEmail: {
        fromName: "Counsel Office",
        fromEmail: "counsel@firm.example",
        subject: "Revised NDA for your signature",
        receivedAt: "2026-05-17T13:00:00.000Z",
        bodyPreview:
          "Please find attached the revised NDA. Kindly confirm the wire to account 12345.",
        hasAttachments: true
      },
      thread: []
    }),
    "Call 3 — legal+financial+attachment (expect risk=high, category=A)"
  );

  console.log("\nSmoke test complete.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
