import { Injectable, Logger } from "@nestjs/common";
import {
  FeedbackAction,
  MemoryScope,
  MemorySourceType,
  Prisma,
  SensitivityLevel
} from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { EmbeddingService } from "../knowledge/embeddings/embedding.service";

const CONTENT_MAX = 400;
const SNIPPET_MAX = 120;
const SENDER_SCOPE_CAP = 20;
const USER_SCOPE_CAP = 50;

interface MemoryDraft {
  scope: MemoryScope;
  sourceType: MemorySourceType;
  sensitivity: SensitivityLevel;
  content: string;
  senderEmail: string | null;
}

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService
  ) {}

  /**
   * Embed memory content for semantic retrieval. Best-effort: a provider
   * failure must never block learning, so we fall back to an empty vector
   * (the retrieval layer degrades to recency for that item).
   */
  private async safeEmbed(
    content: string
  ): Promise<{ embedding: number[]; embeddingModel: string | null }> {
    try {
      const embedding = await this.embeddings.embed(content);
      return { embedding, embeddingModel: this.embeddings.model };
    } catch (err) {
      this.logger.warn(
        `Embedding failed; storing memory without vector: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return { embedding: [], embeddingModel: null };
    }
  }

  async recordFeedback(args: {
    userId: string;
    emailCardId: string;
    action: FeedbackAction;
    beforeText: string | null;
    afterText: string | null;
  }): Promise<void> {
    const card = await this.prisma.emailCard.findUnique({
      where: { id: args.emailCardId }
    });
    if (!card || card.userId !== args.userId) {
      return;
    }

    const draft = this.buildDraft({
      action: args.action,
      senderEmail: card.fromEmail,
      draftReply: card.draftReply,
      beforeText: args.beforeText,
      afterText: args.afterText
    });
    if (!draft) {
      return;
    }

    const { embedding, embeddingModel } = await this.safeEmbed(draft.content);

    await this.prisma.$transaction(async (tx) => {
      await this.enforceCap(tx, args.userId, draft);
      await tx.memoryItem.create({
        data: {
          userId: args.userId,
          scope: draft.scope,
          sourceType: draft.sourceType,
          sensitivity: draft.sensitivity,
          content: draft.content,
          senderEmail: draft.senderEmail,
          embedding,
          embeddingModel
        }
      });
    });
  }

  private buildDraft(args: {
    action: FeedbackAction;
    senderEmail: string;
    draftReply: string;
    beforeText: string | null;
    afterText: string | null;
  }): MemoryDraft | null {
    switch (args.action) {
      case FeedbackAction.APPROVED: {
        const snippet = truncate(args.draftReply, SNIPPET_MAX);
        const hasSender = args.senderEmail.length > 0;
        const content = hasSender
          ? `User approved this kind of reply to ${args.senderEmail}: "${snippet}"`
          : `User approved this kind of reply: "${snippet}"`;
        return {
          scope: hasSender ? MemoryScope.SENDER : MemoryScope.USER,
          sourceType: MemorySourceType.APPROVED_REPLY,
          sensitivity: SensitivityLevel.LOW,
          content: truncate(content, CONTENT_MAX),
          senderEmail: hasSender ? args.senderEmail : null
        };
      }
      case FeedbackAction.EDITED: {
        const before = args.beforeText ?? "";
        const after = args.afterText ?? "";
        const pattern = distillEditPattern(before, after);
        const beforeSnippet = truncate(before, SNIPPET_MAX);
        const afterSnippet = truncate(after, SNIPPET_MAX);
        const content = `User edited AI draft from "${beforeSnippet}" to "${afterSnippet}". Pattern: ${pattern}`;
        return {
          scope: MemoryScope.USER,
          sourceType: MemorySourceType.EDITED_REPLY,
          sensitivity: SensitivityLevel.LOW,
          content: truncate(content, CONTENT_MAX),
          senderEmail: null
        };
      }
      case FeedbackAction.REJECTED: {
        const snippet = truncate(args.draftReply, SNIPPET_MAX);
        const content = `User rejected an AI draft to ${args.senderEmail}. Avoid: "${snippet}".`;
        return {
          scope: MemoryScope.SENDER,
          sourceType: MemorySourceType.REJECTED_REPLY,
          sensitivity: SensitivityLevel.LOW,
          content: truncate(content, CONTENT_MAX),
          senderEmail: args.senderEmail
        };
      }
      case FeedbackAction.REGENERATED:
      case FeedbackAction.SAVED_LATER:
      default:
        return null;
    }
  }

  private async enforceCap(
    tx: Prisma.TransactionClient,
    userId: string,
    draft: MemoryDraft
  ): Promise<void> {
    if (draft.scope === MemoryScope.SENDER && draft.senderEmail) {
      await this.trimScope(tx, {
        where: {
          userId,
          scope: MemoryScope.SENDER,
          senderEmail: draft.senderEmail
        },
        cap: SENDER_SCOPE_CAP
      });
      return;
    }
    if (draft.scope === MemoryScope.USER) {
      await this.trimScope(tx, {
        where: { userId, scope: MemoryScope.USER },
        cap: USER_SCOPE_CAP
      });
    }
  }

  private async trimScope(
    tx: Prisma.TransactionClient,
    args: {
      where: Prisma.MemoryItemWhereInput;
      cap: number;
    }
  ): Promise<void> {
    const count = await tx.memoryItem.count({ where: args.where });
    const overflow = count - (args.cap - 1);
    if (overflow <= 0) {
      return;
    }
    const oldest = await tx.memoryItem.findMany({
      where: args.where,
      orderBy: { createdAt: "asc" },
      take: overflow,
      select: { id: true }
    });
    if (oldest.length === 0) {
      return;
    }
    await tx.memoryItem.deleteMany({
      where: { id: { in: oldest.map((row) => row.id) } }
    });
  }
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  if (limit <= 1) {
    return "…";
  }
  return `${value.slice(0, limit - 1)}…`;
}

function distillEditPattern(before: string, after: string): string {
  const trimmedBefore = before.trim();
  const trimmedAfter = after.trim();

  if (trimmedBefore.length === 0 && trimmedAfter.length === 0) {
    return "User edited the draft (see beforeText/afterText for detail)";
  }
  if (trimmedBefore.length === 0) {
    return "User wrote a reply from scratch";
  }
  if (trimmedAfter.length === 0) {
    return "User cleared the draft";
  }

  const beforeWords = wordSet(trimmedBefore);
  const afterWords = wordSet(trimmedAfter);
  const removed = [...beforeWords].filter((w) => !afterWords.has(w));
  const added = [...afterWords].filter((w) => !beforeWords.has(w));

  if (trimmedAfter.length > trimmedBefore.length * 1.5 && added.length > 0) {
    return `User added more detail (e.g. ${formatList(added)})`;
  }
  if (trimmedBefore.length > trimmedAfter.length * 1.5 && removed.length > 0) {
    return `User shortened the draft (removed e.g. ${formatList(removed)})`;
  }
  if (removed.length > 0 && added.length > 0) {
    return `Replaced ${formatList(removed)} with ${formatList(added)}`;
  }
  if (added.length > 0) {
    return `User added: ${formatList(added)}`;
  }
  if (removed.length > 0) {
    return `User removed: ${formatList(removed)}`;
  }
  return "User edited the draft (see beforeText/afterText for detail)";
}

function wordSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function formatList(values: string[]): string {
  return values.slice(0, 3).join(", ");
}
