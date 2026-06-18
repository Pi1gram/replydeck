import { Injectable } from "@nestjs/common";
import { ToneId as PrismaToneId } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import type {
  AiDraftInput,
  MemoryItemSnippet,
  SenderProfile,
  ThreadMessage,
  ToneId,
  ToneProfile
} from "./ai.types";

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
  constructor(private readonly prisma: PrismaService) {}

  async loadContext(args: {
    userId: string;
    currentEmail: AiDraftInput["currentEmail"];
    thread?: ThreadMessage[];
    toneOverride?: ToneId;
    regenerateAttempt?: number;
    previousDraft?: string;
  }): Promise<AiDraftInput> {
    const [toneRow, senderRow, memoryRows] = await Promise.all([
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
        take: 8
      })
    ]);

    return {
      userId: args.userId,
      currentEmail: args.currentEmail,
      thread: args.thread ?? [],
      toneProfile: toneRow ? toToneProfile(toneRow) : null,
      senderProfile: senderRow ? toSenderProfile(senderRow) : null,
      memoryItems: memoryRows.map(toMemorySnippet),
      toneOverride: args.toneOverride,
      regenerateAttempt: args.regenerateAttempt,
      previousDraft: args.previousDraft
    };
  }
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
