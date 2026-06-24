import type { RiskLevel } from "@replydeck/shared";

/**
 * Phase 4 AI module: pure types, no Prisma or framework coupling. The
 * orchestrator (EmailCardsService / MicrosoftService) gathers the inputs
 * from the database and hands them to AiService.generateDraft.
 */

export type ToneId = "formal" | "business" | "friends";

export type Category = "A" | "B" | "C";

export interface ToneProfile {
  defaultTone: ToneId;
  averageReplyLength: string;
  preferredGreetings: string[];
  preferredSignOffs: string[];
  avoidPhrases: string[];
  styleNotes: string[];
}

export interface SenderProfile {
  senderEmail: string;
  relationship?: string;
  formality?: string;
  usualReplyLength?: string;
  preferredTone?: ToneId;
  notes: string[];
}

export interface ThreadMessage {
  fromEmail: string;
  fromName: string;
  receivedAt: string;
  bodyPreview: string;
  fromUser: boolean;
}

export interface MemoryItemSnippet {
  scope: "user" | "sender" | "thread" | "company";
  content: string;
}

export interface AiDraftInput {
  userId: string;
  currentEmail: {
    fromName: string;
    fromEmail: string;
    subject: string;
    receivedAt: string;
    bodyPreview: string;
    hasAttachments: boolean;
  };
  thread: ThreadMessage[];
  toneProfile: ToneProfile | null;
  senderProfile: SenderProfile | null;
  memoryItems: MemoryItemSnippet[];
  toneOverride?: ToneId;
  /**
   * 0-indexed attempt counter. >0 means the user is regenerating; the
   * prompt asks the model to vary the phrasing from prior attempts.
   */
  regenerateAttempt?: number;
  /**
   * Previous draft (if regenerating). Helps the model produce something
   * meaningfully different rather than near-duplicate.
   */
  previousDraft?: string;
  /**
   * Compact free/busy summary of the user's calendar, injected only when the
   * incoming email looks like a scheduling request. Lets the model propose or
   * confirm times. Abstracted — busy blocks only, no event subjects.
   */
  availability?: string;
}

export interface AiDraftResult {
  summary: string;
  senderIntent: string;
  contextUsed: string[];
  draftReply: string;
  confidenceScore: number;
  riskLevel: RiskLevel;
  riskReason: string;
  category: Category;
  /**
   * Echoes which tone was actually applied — useful when toneOverride was
   * absent and we fell back to the profile default (or "business").
   */
  toneApplied: ToneId;
}
