import "reflect-metadata";

// Make sure DEV_USER_ID is set in every worker process. globalSetup sets it
// for the controller process only — child workers inherit env vars but if
// jest is run with maxWorkers > 1 we want a hard guarantee.
if (!process.env.DEV_USER_ID) {
  process.env.DEV_USER_ID = "cmozb3wxt0000epl11g97atj3";
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://replydeck:replydeck@localhost:5433/replydeck_test?schema=public";
}
if (!process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

// Phase 4: force the mock AI provider in tests. Real Anthropic calls would
// be slow ($$$ in CI, non-deterministic — Claude is conservative with vague
// test fixtures and routes them to risk=high). Tests verify orchestrator
// wiring; the real provider is exercised by scripts/smoke-anthropic.ts.
process.env.AI_PROVIDER = "mock";
delete process.env.ANTHROPIC_API_KEY;

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request = require("supertest");
import {
  EmailCardStatus,
  PrismaClient,
  Prisma,
  RiskLevel
} from "@prisma/client";
import { fakeEmailCards } from "@replydeck/shared";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma.service";

export const DEMO_USER_ID = "cmozb3wxt0000epl11g97atj3";
export const DEMO_USER_EMAIL = "demo@replydeck.local";
export const DEMO_USER_NAME = "Demo User";

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

export type HttpAgent = ReturnType<typeof request>;

export interface TestHandle {
  app: INestApplication;
  http: HttpAgent;
  prisma: PrismaService;
  demoUserId: string;
}

/**
 * Build the same Nest app the production `main.ts` builds — same
 * ValidationPipe, same CORS config — and return a supertest agent bound to
 * its underlying HTTP server.
 */
export async function bootstrap(): Promise<TestHandle> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? "*", credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  await app.init();

  const prisma = app.get(PrismaService);
  const http: HttpAgent = request(app.getHttpServer());

  return {
    app,
    http,
    prisma,
    demoUserId: DEMO_USER_ID
  };
}

/**
 * TRUNCATE the four user-managed tables and re-seed the demo user + the 5
 * fake cards (mirrors `prisma/seed.ts` so we don't have to shell out).
 */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","FeedbackEvent","EmailCard","ConnectedEmailAccount","User" RESTART IDENTITY CASCADE'
  );

  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME },
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      name: DEMO_USER_NAME
    }
  });

  for (const card of fakeEmailCards) {
    const riskLevel = RISK_LEVEL_MAP[card.riskLevel];
    const status = STATUS_MAP[card.status];
    if (!riskLevel || !status) {
      throw new Error(`Bad seed card ${card.id}`);
    }
    await prisma.emailCard.create({
      data: {
        id: card.id,
        userId: DEMO_USER_ID,
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
      }
    });
  }
}

/**
 * Convenience for creating a second user used in cross-user isolation tests.
 */
export async function createSecondUser(
  prisma: PrismaClient,
  id = "user_other_test_001"
): Promise<{ id: string; email: string }> {
  const email = `other_${id}@replydeck.local`;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { id, email, name: "Other User" }
  });
  return { id: user.id, email: user.email };
}

/**
 * Build a valid CreateEmailCardDto payload. Tests can spread overrides over
 * this to flex specific fields.
 */
export function makeCreateCardPayload(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    fromName: "Test Sender",
    fromEmail: "test@example.com",
    subject: "A new email",
    receivedAt: "2026-05-10T09:00:00.000Z",
    summary: "Brief summary",
    senderIntent: "Ask a question.",
    contextUsed: ["context line 1", "context line 2"],
    draftReply: "Hi there,\n\nOriginal draft.\n\nAlex",
    confidenceScore: 80,
    riskLevel: "low",
    riskReason: "Routine email.",
    ...overrides
  };
}
