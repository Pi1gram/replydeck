import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import {
  EmailCard as PrismaEmailCard,
  EmailCardStatus,
  EmailProvider,
  FeedbackAction,
  Prisma,
  RiskLevel
} from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { toWireCard, WireEmailCard } from "../common/card-mapper";
import { MicrosoftService } from "../microsoft/microsoft.service";
import { CreateEmailCardDto } from "./dto/create-email-card.dto";
import { UpdateReplyDto } from "./dto/update-reply.dto";
import {
  FALLBACK_REGENERATED_DRAFT,
  regeneratedDrafts
} from "./regenerated-drafts";

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
    private readonly microsoft: MicrosoftService
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

    const drafts = regeneratedDrafts[id];
    let nextDraft: string;
    if (drafts && drafts.length > 0) {
      const regenCount = await this.prisma.feedbackEvent.count({
        where: { emailCardId: id, action: FeedbackAction.REGENERATED }
      });
      nextDraft = drafts[regenCount % drafts.length];
    } else {
      nextDraft = FALLBACK_REGENERATED_DRAFT;
    }

    const beforeText = existing.draftReply;
    const previousStatus = existing.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.emailCard.update({
        where: { id },
        data: { draftReply: nextDraft }
      });
      await tx.auditLog.create({
        data: {
          userId,
          emailCardId: id,
          action: "card.regenerated",
          metadata: { previousStatus }
        }
      });
      await tx.feedbackEvent.create({
        data: {
          userId,
          emailCardId: id,
          action: FeedbackAction.REGENERATED,
          beforeText,
          afterText: nextDraft
        }
      });
      return next;
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

    return toWireCard(updated);
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
