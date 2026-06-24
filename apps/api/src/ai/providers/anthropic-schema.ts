import { z } from "zod/v4";

/**
 * Zod schema for the structured JSON output the model returns.
 *
 * The Anthropic SDK validates the model's response against this via
 * `zodOutputFormat()` + `messages.parse()`. Numeric / string range
 * constraints (`min`, `max`, `minLength`) are accepted by Zod but stripped
 * before being sent to the API — Anthropic's structured-outputs JSON
 * Schema subset doesn't support them. We rely on the system prompt to keep
 * `confidenceScore` in 0–100 and apply a final clamp in the provider as
 * belt-and-braces.
 */
export const aiDraftJsonSchema = z.object({
  summary: z.string(),
  senderIntent: z.string(),
  contextUsed: z.array(z.string()),
  draftReply: z.string(),
  confidenceScore: z.number().int(),
  riskLevel: z.enum(["low", "medium", "high"]),
  riskReason: z.string(),
  category: z.enum(["A", "B", "C"]),
  toneApplied: z.enum(["formal", "business", "friends"])
});

export type AiDraftJson = z.infer<typeof aiDraftJsonSchema>;
