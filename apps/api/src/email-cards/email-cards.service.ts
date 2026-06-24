import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef
} from "@nestjs/common";
import {
  Category,
  EmailCard as PrismaEmailCard,
  EmailCardStatus,
  EmailProvider,
  FeedbackAction,
  Prisma,
  RiskLevel,
  ToneId
} from "@prisma/client";
import { AiContextLoader } from "../ai/ai-context-loader.service";
import { AiService } from "../ai/ai.service";
import type { AiDraftResult } from "../ai/ai.types";
import { decideAutoSend } from "../ai/auto-send-decision";
import { PROMPT_VERSION } from "../ai/prompts/system-prompt";
import { toWireCard, WireEmailCard } from "../common/card-mapper";
import { PrismaService } from "../common/prisma.service";
import { LearningService } from "../learning/learning.service";
import { MicrosoftService } from "../microsoft/microsoft.service";
import { CreateEmailCardDto } from "./dto/create-email-card.dto";
import { UpdateReplyDto } from "./dto/update-reply.dto";

const TONE_TO_PRISMA: Record<AiDraftResult["toneApplied"], ToneId> = {
  formal: ToneId.FORMAL,
  business: ToneId.BUSINESS,
  friends: ToneId.FRIENDS
};
const RISK_TO_PRISMA: Record<AiDraftResult["riskLevel"], RiskLevel> = {
  low: RiskLevel.LOW,
  medium: RiskLevel.MEDIUM,
  high: RiskLevel.HIGH
};
const CATEGORY_TO_PRISMA: Record<AiDraftResult["category"], Category> = {
  A: Category.A,
  B: Category.B,
  C: Category.C
};

const STATUS_MAP: Record<string, EmailCardStatus> = {
  pending: EmailCardStatus.PENDING,
  sent: EmailCardStatus.SENT,
  rejected: EmailCardStatus.REJECTED,
  later: EmailCardStatus.LATER,
  edited: EmailCardStatus.EDITED
};

const RISK_MAP: Record<string, RiskLevel> = {
  low: RiskLevel.LOW,
  medium: RiskLevel.MEDIUM,
  high: RiskLevel.HIGH
};

@Injectable()
export class EmailCardsService {
  private readonly logger = new Logger(EmailCardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MicrosoftService))
    private readonly microsoft: MicrosoftService,
    private readonly ai: AiService,
    private readonly aiContext: AiContextLoader,
    private readonly learning: LearningService
  ) {}

  async list(userId: string, statusFilter?: string): Promise<WireEmailCard[]> {
    const where: Prisma.EmailCardWhereInput = { userId };
    if (statusFilter) {
      const mapped = STATUS_MAP[statusFilter.toLowerCase()];
      if (!mapped) {
        throw new BadRequestException(
          `Unknown status filter: ${statusFilter}`
        );
      }
      where.status = mapped;
    }
    const cards = await this.prisma.emailCard.findMany({
      where,
      orderBy: { updatedAt: "desc" }
    });
    return cards.map(toWireCard);
  }

  async findOne(userId: string, id: string): Promise<WireEmailCard> {
    const card = await this.requireOwnedCard(userId, id);
    return toWireCard(card);
  }

  async create(
    userId: string,
    dto: CreateEmailCardDto
  ): Promise<WireEmailCard> {
    const riskLevel = RISK_MAP[dto.riskLevel];
    if (!riskLevel) {
      throw new BadRequestException(`Invalid riskLevel: ${dto.riskLevel}`);
    }

    const [card] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emailCard.create({
        data: {
          userId,
          fromName: dto.fromName,
          fromEmail: dto.fromEmail,
          subject: dto.subject,
          receivedAt: new Date(dto.receivedAt),
          summary: dto.summary,
          senderIntent: dto.senderIntent,
          contextUsed: dto.contextUsed,
          draftReply: dto.draftReply,
          confidenceScore: dto.confidenceScore,
          riskLevel,
          riskReason: dto.riskReason,
          status: EmailCardStatus.PENDING
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          emailCardId: created.id,
          action: "card.created",
          metadata: {
            fromEmail: created.fromEmail,
            riskLevel: created.riskLevel
          }
        }
      });
      return [created];
    });

    return toWireCard(card);
  }

  async approve(userId: string, id: string): Promise<WireEmailCard> {
    const existing = await this.requireOwnedCard(userId, id);

    // Idempotency: never re-send a card that's already SENT.
    if (existing.status === EmailCardStatus.SENT) {
      await this.prisma.auditLog.create({
        data: {
          userId,
          emailCardId: id,
          action: "outlook.send.skipped_duplicate",
          metadata: { reason: "already_sent", sentAt: existing.sentAt }
        }
      });
      return toWireCard(existing);
    }

    // Allow approval only from a pending-like state.
    // EDITED in our enum means "edited and still awaiting send".
    const sendableStatuses: EmailCardStatus[] = [
      EmailCardStatus.PENDING,
      EmailCardStatus.EDITED
    ];
    if (!sendableStatuses.includes(existing.status)) {
      throw new BadRequestException(
        `Cannot approve a card in status ${existing.status}`
      );
    }

    // Phase 3 safety rule: real Outlook sends require an explicit approve
    // call (this method is only invoked from POST /email-cards/:id/approve)
    // AND the card must clear every gate below.
    if (
      existing.provider === EmailProvider.OUTLOOK &&
      existing.providerMessageId
    ) {
      await this.sendOutlookReply(userId, existing);
    }

    return this.statusTransition({
      userId,
      id,
      newStatus: EmailCardStatus.SENT,
      auditAction: "card.approved",
      feedbackAction: FeedbackAction.APPROVED,
      setSentAt: true
    });
  }

  /**
   * Phase 5 — auto-send hot path. Called from MicrosoftService after a
   * freshly-synced Category C card passes decideAutoSend().
   *
   * Defensively re-checks the same gates so a race (e.g. user toggles
   * autoSendEnabled off, or pins the sender to always-review) between sync
   * and persistence cannot leak a send. Writes a `card.auto_sent` audit
   * row and an `AUTO_SENT` FeedbackEvent so the daily wrap email + the
   * activity timeline can both surface the action.
   */
  async autoSendCard(
    userId: string,
    cardId: string,
    decisionMeta: { gateId: string; reason: string }
  ): Promise<WireEmailCard> {
    const existing = await this.requireOwnedCard(userId, cardId);

    if (existing.status !== EmailCardStatus.PENDING) {
      throw new BadRequestException(
        `Cannot auto-send a card in status ${existing.status}`
      );
    }

    // Defensive re-check of the eligibility gates. The pure decideAutoSend
    // call up in MicrosoftService already cleared them, but reload tone +
    // sender here in case the user changed something between draft and
    // persistence. Cheap (two indexed reads) and the alternative is a
    // race that auto-sends a denylisted sender.
    const [toneRow, senderRow] = await Promise.all([
      this.prisma.toneProfile.findUnique({ where: { userId } }),
      this.prisma.senderProfile.findUnique({
        where: {
          userId_senderEmail: { userId, senderEmail: existing.fromEmail }
        }
      })
    ]);

    const recheck = decideAutoSend({
      ai: {
        category:
          existing.category === Category.A
            ? "A"
            : existing.category === Category.B
            ? "B"
            : "C",
        riskLevel:
          existing.riskLevel === RiskLevel.LOW
            ? "low"
            : existing.riskLevel === RiskLevel.MEDIUM
            ? "medium"
            : "high",
        confidenceScore: existing.confidenceScore
      },
      card: { hasAttachments: existing.hasAttachments },
      user: { autoSendEnabled: toneRow?.autoSendEnabled ?? false },
      sender: senderRow
        ? {
            autoSendAllowed: senderRow.autoSendAllowed,
            autoSendDenied: senderRow.autoSendDenied,
            pinAlwaysReview: senderRow.pinAlwaysReview
          }
        : null
    });

    if (!recheck.autoSend) {
      // Race detected — gates flipped between decide and persist. Abort
      // quietly; the card stays PENDING and the user will see it in the
      // queue.
      await this.prisma.auditLog.create({
        data: {
          userId,
          emailCardId: cardId,
          action: "auto_send.failure",
          metadata: {
            stage: "recheck",
            gateId: recheck.gateId,
            reason: recheck.reason
          }
        }
      });
      throw new BadRequestException(
        `Auto-send aborted on recheck: ${recheck.reason}`
      );
    }

    // From here on it's the same Outlook send path used by the manual
    // approve flow, but with a different terminal audit + feedback action.
    if (
      existing.provider === EmailProvider.OUTLOOK &&
      existing.providerMessageId
    ) {
      await this.sendOutlookReply(userId, existing);
    } else {
      throw new BadRequestException(
        "autoSendCard requires an Outlook-linked card (provider + providerMessageId)."
      );
    }

    const previousStatus = existing.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.emailCard.update({
        where: { id: cardId },
        data: {
          status: EmailCardStatus.SENT,
          sentAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          emailCardId: cardId,
          action: "card.auto_sent",
          metadata: {
            previousStatus,
            gateId: decisionMeta.gateId,
            reason: decisionMeta.reason,
            confidence: existing.confidenceScore,
            riskLevel: existing.riskLevel,
            category: existing.category,
            // Full draft text per SECURITY_PRIVACY.md 4a so the daily
            // wrap email can render exactly what was sent on the user's
            // behalf, and an auditor can answer "what did we send".
            draftReply: existing.draftReply
          }
        }
      });
      await tx.feedbackEvent.create({
        data: {
          userId,
          emailCardId: cardId,
          action: FeedbackAction.AUTO_SENT,
          afterText: existing.draftReply
        }
      });
      return next;
    });

    // Note: NOT calling LearningService.recordFeedback here — AUTO_SENT is
    // not user intent. The learning loop is fed by APPROVED / EDITED /
    // REJECTED only (see LearningService.buildDraft).

    return toWireCard(updated);
  }

  private async sendOutlookReply(
    userId: string,
    card: PrismaEmailCard
  ): Promise<void> {
    if (card.riskLevel === RiskLevel.HIGH) {
      throw new BadRequestException(
        "High-risk Outlook cards cannot be sent — manual review required."
      );
    }
    if (!card.draftReply || card.draftReply.trim().length === 0) {
      throw new BadRequestException(
        "Cannot send an Outlook reply with an empty draft."
      );
    }
    if (!card.providerMessageId) {
      throw new BadRequestException(
        "Card has no providerMessageId — cannot send via Outlook."
      );
    }

    const hasAccount = await this.microsoft.hasConnectedAccount(userId);
    if (!hasAccount) {
      throw new BadRequestException(
        "No connected Outlook account for this user."
      );
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        emailCardId: card.id,
        action: "outlook.send.attempt",
        metadata: {
          providerMessageId: card.providerMessageId,
          riskLevel: card.riskLevel
        }
      }
    });

    try {
      await this.microsoft.sendReply(
        userId,
        card.providerMessageId,
        card.draftReply
      );
      await this.prisma.auditLog.create({
        data: {
          userId,
          emailCardId: card.id,
          action: "outlook.send.success",
          metadata: { providerMessageId: card.providerMessageId }
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Outlook send failed for card ${card.id}: ${message}`
      );
      await this.prisma.auditLog.create({
        data: {
          userId,
          emailCardId: card.id,
          action: "outlook.send.failed",
          metadata: {
            providerMessageId: card.providerMessageId,
            error: message
          }
        }
      });
      throw err;
    }
  }

  async reject(userId: string, id: string): Promise<WireEmailCard> {
    return this.statusTransition({
      userId,
      id,
      newStatus: EmailCardStatus.REJECTED,
      auditAction: "card.rejected",
      feedbackAction: FeedbackAction.REJECTED
    });
  }

  async later(userId: string, id: string): Promise<WireEmailCard> {
    return this.statusTransition({
      userId,
      id,
      newStatus: EmailCardStatus.LATER,
      auditAction: "card.later",
      feedbackAction: FeedbackAction.SAVED_LATER
    });
  }

  async regenerate(userId: string, id: string): Promise<WireEmailCard> {
    const existing = await this.requireOwnedCard(userId, id);
    const beforeText = existing.draftReply;
    const previousStatus = existing.status;

    const regenCount = await this.prisma.feedbackEvent.count({
      where: { emailCardId: id, action: FeedbackAction.REGENERATED }
    });

    const aiInput = await this.aiContext.loadContext({
      userId,
      currentEmail: {
        fromName: existing.fromName,
        fromEmail: existing.fromEmail,
        subject: existing.subject,
        receivedAt: existing.receivedAt.toISOString(),
        // Phase 4: we don't store the raw body separately yet, so the
        // existing `summary` field is the best body proxy we have on
        // synced cards. For real Outlook cards, summary == bodyPreview
        // at sync time (see MicrosoftService.syncRecentInboxToCards).
        bodyPreview: existing.summary,
        hasAttachments: existing.hasAttachments
      },
      regenerateAttempt: regenCount + 1,
      previousDraft: beforeText
    });

    const ai = await this.ai.generateDraft(aiInput);
    const contextUsed = ai.contextUsed.slice(0, 4) as Prisma.InputJsonValue;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.emailCard.update({
        where: { id },
        data: {
          summary: ai.summary,
          senderIntent: ai.senderIntent,
          contextUsed,
          draftReply: ai.draftReply,
          confidenceScore: ai.confidenceScore,
          riskLevel: RISK_TO_PRISMA[ai.riskLevel],
          riskReason: ai.riskReason,
          category: CATEGORY_TO_PRISMA[ai.category],
          toneApplied: TONE_TO_PRISMA[ai.toneApplied],
          aiPromptVersion: PROMPT_VERSION
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          emailCardId: id,
          action: "card.regenerated",
          metadata: {
            previousStatus,
            attempt: regenCount + 1,
            promptVersion: PROMPT_VERSION,
            confidence: ai.confidenceScore
          }
        }
      });
      await tx.feedbackEvent.create({
        data: {
          userId,
          emailCardId: id,
          action: FeedbackAction.REGENERATED,
          beforeText,
          afterText: ai.draftReply
        }
      });
      return next;
    });

    await this.safeRecordFeedback({
      userId,
      emailCardId: id,
      action: FeedbackAction.REGENERATED,
      beforeText,
      afterText: ai.draftReply
    });

    return toWireCard(updated);
  }

  async updateReply(
    userId: string,
    id: string,
    dto: UpdateReplyDto
  ): Promise<WireEmailCard> {
    const existing = await this.requireOwnedCard(userId, id);
    const beforeText = existing.draftReply;
    const afterText = dto.draftReply;
    const previousStatus = existing.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.emailCard.update({
        where: { id },
        data: {
          draftReply: afterText,
          status: EmailCardStatus.EDITED
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          emailCardId: id,
          action: "card.edited",
          metadata: { previousStatus }
        }
      });
      await tx.feedbackEvent.create({
        data: {
          userId,
          emailCardId: id,
          action: FeedbackAction.EDITED,
          beforeText,
          afterText
        }
      });
      return next;
    });

    await this.safeRecordFeedback({
      userId,
      emailCardId: id,
      action: FeedbackAction.EDITED,
      beforeText,
      afterText
    });

    return toWireCard(updated);
  }

  private async statusTransition(args: {
    userId: string;
    id: string;
    newStatus: EmailCardStatus;
    auditAction: string;
    feedbackAction: FeedbackAction;
    setSentAt?: boolean;
  }): Promise<WireEmailCard> {
    const { userId, id, newStatus, auditAction, feedbackAction, setSentAt } =
      args;
    const existing = await this.requireOwnedCard(userId, id);
    const previousStatus = existing.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.emailCard.update({
        where: { id },
        data: {
          status: newStatus,
          ...(setSentAt ? { sentAt: new Date() } : {})
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          emailCardId: id,
          action: auditAction,
          metadata: { previousStatus }
        }
      });
      await tx.feedbackEvent.create({
        data: {
          userId,
          emailCardId: id,
          action: feedbackAction
        }
      });
      return next;
    });

    await this.safeRecordFeedback({
      userId,
      emailCardId: id,
      action: feedbackAction,
      beforeText: null,
      afterText: null
    });

    return toWireCard(updated);
  }

  private async safeRecordFeedback(args: {
    userId: string;
    emailCardId: string;
    action: FeedbackAction;
    beforeText: string | null;
    afterText: string | null;
  }): Promise<void> {
    try {
      await this.learning.recordFeedback(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `LearningService.recordFeedback failed for card ${args.emailCardId} (${args.action}): ${message}`
      );
    }
  }

  private async requireOwnedCard(
    userId: string,
    id: string
  ): Promise<PrismaEmailCard> {
    const card = await this.prisma.emailCard.findUnique({ where: { id } });
    if (!card || card.userId !== userId) {
      throw new NotFoundException(`Email card ${id} not found`);
    }
    return card;
  }
}
