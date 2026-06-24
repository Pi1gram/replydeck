import {
  PrismaClient,
  EmailCardStatus,
  RiskLevel,
  Prisma
} from "@prisma/client";
import { fakeEmailCards } from "@replydeck/shared";

const prisma = new PrismaClient();

const RISK_LEVEL_MAP: Record<string, RiskLevel> = {
  low: RiskLevel.LOW,
  medium: RiskLevel.MEDIUM,
  high: RiskLevel.HIGH
};

const STATUS_MAP: Record<string, EmailCardStatus> = {
  pending: EmailCardStatus.PENDING,
  sent: EmailCardStatus.SENT,
  rejected: EmailCardStatus.REJECTED,
  later: EmailCardStatus.LATER,
  edited: EmailCardStatus.EDITED
};

async function main() {
  const email = process.env.DEV_USER_EMAIL ?? "demo@replydeck.local";
  const name = process.env.DEV_USER_NAME ?? "Demo User";
  // Fall back to the canonical demo id so the seed is deterministic on a
  // fresh DB even when DEV_USER_ID is not set in the environment.
  // All docs, tests, mobile builds, and Fly secrets reference this value.
  const CANONICAL_DEV_USER_ID = "cmozb3wxt0000epl11g97atj3";
  const fixedId = process.env.DEV_USER_ID || CANONICAL_DEV_USER_ID;

  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { id: fixedId, email, name }
  });

  for (const card of fakeEmailCards) {
    const riskLevel = RISK_LEVEL_MAP[card.riskLevel];
    const status = STATUS_MAP[card.status];

    if (!riskLevel) {
      throw new Error(
        `Unknown riskLevel "${card.riskLevel}" on card ${card.id}`
      );
    }
    if (!status) {
      throw new Error(`Unknown status "${card.status}" on card ${card.id}`);
    }

    const data = {
      userId: user.id,
      fromName: card.fromName,
      fromEmail: card.fromEmail,
      subject: card.subject,
      receivedAt: new Date(card.receivedAt),
      summary: card.summary,
      senderIntent: card.senderIntent,
      contextUsed: card.contextUsed as Prisma.InputJsonValue,
      draftReply: card.draftReply,
      confidenceScore: card.confidenceScore,
      riskLevel,
      riskReason: card.riskReason,
      status
    };

    await prisma.emailCard.upsert({
      where: { id: card.id },
      update: data,
      create: { id: card.id, ...data }
    });
  }

  console.log(`✅ Seeded 1 user, ${fakeEmailCards.length} email cards`);
  console.log(`DEV_USER_ID=${user.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
