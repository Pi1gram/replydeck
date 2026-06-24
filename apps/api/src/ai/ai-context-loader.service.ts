import { Injectable, Logger } from "@nestjs/common";
import { ToneId as PrismaToneId } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { EmbeddingService } from "../knowledge/embeddings/embedding.service";
import { rankBySimilarity } from "../knowledge/embeddings/cosine";
import type {
  AiDraftInput,
  MemoryItemSnippet,
  SenderProfile,
  ThreadMessage,
  ToneId,
  ToneProfile
} from "./ai.types";

// How many memory rows to pull as semantic-ranking candidates, and how many to
// actually feed the model. Candidates are already userId-scoped, so this stays
// cheap; ranking happens app-side (see knowledge/embeddings/cosine.ts).
const MEMORY_CANDIDATE_POOL = 30;
const MEMORY_CONTEXT_LIMIT = 8;

interface MemoryCandidate {
  id: string;
  scope: "USER" | "SENDER" | "THREAD" | "COMPANY";
  content: string;
  embedding: number[];
}

/**
 * Loads the per-user / per-sender context the AI module needs to draft a
 * reply, mapping Prisma row shapes (UPPERCASE enums, denormalised fields)
 * to the lowercase string-enum shape the AI module expects.
 *
 * Kept in the ai/ module so the orchestrator services (EmailCardsService,
 * MicrosoftService) don't have to know anything about how the AI types
 * are shaped.
 */
@Injectable()
export class AiContextLoader {
  private readonly logger = new Logger(AiContextLoader.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService
  ) {}

  async loadContext(args: {
    userId: string;
    currentEmail: AiDraftInput["currentEmail"];
    thread?: ThreadMessage[];
    toneOverride?: ToneId;
    regenerateAttempt?: number;
    previousDraft?: string;
    availability?: string;
  }): Promise<AiDraftInput> {
    const [toneRow, senderRow, memoryRows, queryVec] = await Promise.all([
      this.prisma.toneProfile.findUnique({
        where: { userId: args.userId }
      }),
      this.prisma.senderProfile.findUnique({
        where: {
          userId_senderEmail: {
            userId: args.userId,
            senderEmail: args.currentEmail.fromEmail
          }
        }
      }),
      this.prisma.memoryItem.findMany({
        where: {
          userId: args.userId,
          AND: [
            {
              OR: [
                { scope: "USER" },
                {
                  scope: "SENDER",
                  senderEmail: args.currentEmail.fromEmail
                }
              ]
            },
            {
              OR: [
                { expiresAt: null },
                { expiresAt: { gte: new Date() } }
              ]
            }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: MEMORY_CANDIDATE_POOL,
        select: { id: true, scope: true, content: true, embedding: true }
      }),
      this.embedQuery(args.currentEmail)
    ]);

    const memoryItems = selectMemoryItems(memoryRows, queryVec);

    return {
      userId: args.userId,
      currentEmail: args.currentEmail,
      thread: args.thread ?? [],
      toneProfile: toneRow ? toToneProfile(toneRow) : null,
      senderProfile: senderRow ? toSenderProfile(senderRow) : null,
      memoryItems,
      toneOverride: args.toneOverride,
      regenerateAttempt: args.regenerateAttempt,
      previousDraft: args.previousDraft,
      availability: args.availability
    };
  }

  /**
   * Embed the incoming email so we can rank memory by semantic relevance.
   * Best-effort: on failure we return an empty vector and retrieval degrades
   * to recency.
   */
  private async embedQuery(
    email: AiDraftInput["currentEmail"]
  ): Promise<number[]> {
    try {
      const text = `${email.subject}\n\n${email.bodyPreview ?? ""}`.trim();
      if (!text) return [];
      return await this.embeddings.embed(text);
    } catch (err) {
      this.logger.warn(
        `Query embedding failed; falling back to recency: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return [];
    }
  }
}

/**
 * Hybrid selection: take the most semantically-similar memory first, then
 * top up with the most recent candidates (which preserve order from the DB
 * query) so freshly-written, not-yet-embedded items still surface. Falls back
 * to pure recency when no query vector is available.
 */
export function selectMemoryItems(
  candidates: MemoryCandidate[],
  queryVec: number[]
): MemoryItemSnippet[] {
  const chosen: MemoryCandidate[] = [];
  const seen = new Set<string>();

  if (queryVec.length > 0) {
    for (const r of rankBySimilarity(queryVec, candidates, MEMORY_CONTEXT_LIMIT)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      chosen.push(r);
    }
  }
  for (const r of candidates) {
    if (chosen.length >= MEMORY_CONTEXT_LIMIT) break;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    chosen.push(r);
  }

  return chosen.map(toMemorySnippet);
}

function toToneId(t: PrismaToneId): ToneId {
  switch (t) {
    case "FORMAL":
      return "formal";
    case "FRIENDS":
      return "friends";
    case "BUSINESS":
    default:
      return "business";
  }
}

function toToneProfile(row: {
  defaultTone: PrismaToneId;
  averageReplyLength: string | null;
  preferredGreetings: string[];
  preferredSignOffs: string[];
  avoidPhrases: string[];
  styleNotes: string[];
}): ToneProfile {
  return {
    defaultTone: toToneId(row.defaultTone),
    averageReplyLength: row.averageReplyLength ?? "2-4 sentences",
    preferredGreetings: row.preferredGreetings,
    preferredSignOffs: row.preferredSignOffs,
    avoidPhrases: row.avoidPhrases,
    styleNotes: row.styleNotes
  };
}

function toSenderProfile(row: {
  senderEmail: string;
  relationship: string | null;
  formality: string | null;
  usualReplyLength: string | null;
  preferredTone: PrismaToneId | null;
  pinAlwaysReview: boolean;
  notes: string[];
}): SenderProfile {
  const notes = row.pinAlwaysReview
    ? ["always-return (user pinned this sender)", ...row.notes]
    : row.notes;
  return {
    senderEmail: row.senderEmail,
    relationship: row.relationship ?? undefined,
    formality: row.formality ?? undefined,
    usualReplyLength: row.usualReplyLength ?? undefined,
    preferredTone: row.preferredTone ? toToneId(row.preferredTone) : undefined,
    notes
  };
}

function toMemorySnippet(row: {
  scope: "USER" | "SENDER" | "THREAD" | "COMPANY";
  content: string;
}): MemoryItemSnippet {
  return {
    scope: row.scope.toLowerCase() as MemoryItemSnippet["scope"],
    content: row.content
  };
}
