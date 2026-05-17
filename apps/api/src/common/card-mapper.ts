import type { EmailCard as PrismaEmailCard } from "@prisma/client";
import type {
  EmailCard,
  EmailCardStatus,
  RiskLevel
} from "@replydeck/shared";

export type WireEmailCard = EmailCard & {
  sentAt: string | null;
};

export function toWireCard(card: PrismaEmailCard): WireEmailCard {
  const contextUsed = Array.isArray(card.contextUsed)
    ? (card.contextUsed as unknown[]).map((entry) => String(entry))
    : [];

  return {
    id: card.id,
    fromName: card.fromName,
    fromEmail: card.fromEmail,
    subject: card.subject,
    receivedAt: card.receivedAt.toISOString(),
    summary: card.summary,
    senderIntent: card.senderIntent,
    contextUsed,
    draftReply: card.draftReply,
    confidenceScore: card.confidenceScore,
    riskLevel: card.riskLevel.toLowerCase() as RiskLevel,
    riskReason: card.riskReason,
    status: card.status.toLowerCase() as EmailCardStatus,
    sentAt: card.sentAt ? card.sentAt.toISOString() : null
  };
}

