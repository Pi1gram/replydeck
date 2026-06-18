import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request = require("supertest");
import {
  EmailCardStatus,
  EmailProvider,
  FeedbackAction,
  ToneId
} from "@prisma/client";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma.service";
import { CryptoService } from "../src/common/crypto.service";
import { GraphClient } from "../src/microsoft/graph-client";

import { DEMO_USER_ID, resetDb } from "./setup";

/**
 * e2e wiring test for Phase 5 auto-send.
 *
 * This is the end-to-end glue test for `decideAutoSend` — the pure
 * decision logic is unit-tested in auto-send-decision.e2e-spec.ts, here
 * we verify that the MicrosoftService sync loop actually:
 *
 *   1. Loads the user's ToneProfile + the per-sender SenderProfile
 *   2. Calls decideAutoSend with the right shape
 *   3. On an auto-send decision: marks the card SENT, writes a
 *      `card.auto_sent` audit row, and an AUTO_SENT FeedbackEvent
 *   4. On a "hold" decision: leaves the card PENDING with no
 *      auto_sent feedback
 *
 * The Outlook send call itself is mocked via GraphClient so no real
 * network traffic flies. Risk classification + category routing are
 * deterministic (see ai/classifier/*), so the test fixtures below are
 * crafted to land on Category C (newsletter / transactional hints) and
 * risk=low (no sensitive keywords, no attachments).
 */

class MockGraphClient {
  sendCalls: Array<{ messageId: string; body: string }> = [];

  recentMessages: Array<Record<string, unknown>> = [];

  refreshResponse = {
    access_token: "fresh-access",
    refresh_token: "fresh-refresh",
    expires_in: 3600,
    scope: "openid profile email offline_access User.Read Mail.Read Mail.Send",
    token_type: "Bearer"
  };

  async exchangeCodeForTokens() {
    return this.refreshResponse;
  }

  async refreshTokens() {
    return this.refreshResponse;
  }

  async getMe() {
    return {
      id: "ms-user-1",
      mail: "demo@outlook.test",
      userPrincipalName: "demo@outlook.test",
      displayName: "Demo Outlook User"
    };
  }

  async listRecentMessages() {
    return this.recentMessages;
  }

  async listMessagesByConversation() {
    return [];
  }

  async getMessage(_token: string, id: string) {
    return (
      this.recentMessages.find((m) => m["id"] === id) ?? {
        id,
        conversationId: "conv-fallback"
      }
    );
  }

  async sendReply(args: {
    accessToken: string;
    messageId: string;
    body: string;
  }) {
    this.sendCalls.push({ messageId: args.messageId, body: args.body });
  }
}

interface Handle {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  crypto: CryptoService;
  graph: MockGraphClient;
}

async function bootstrapWithMockGraph(): Promise<Handle> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(GraphClient)
    .useValue(new MockGraphClient())
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: "*", credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  await app.init();

  return {
    app,
    http: request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    crypto: app.get(CryptoService),
    graph: app.get(GraphClient) as unknown as MockGraphClient
  };
}

async function seedConnectedOutlookAccount(handle: Handle): Promise<void> {
  await handle.prisma.connectedEmailAccount.create({
    data: {
      userId: DEMO_USER_ID,
      provider: EmailProvider.OUTLOOK,
      providerUserId: "ms-user-1",
      email: "demo@outlook.test",
      encryptedAccessToken: handle.crypto.encrypt("seeded-access-token"),
      encryptedRefreshToken: handle.crypto.encrypt("seeded-refresh-token"),
      scopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "User.Read",
        "Mail.Read",
        "Mail.Send"
      ],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });
}

async function setToneProfile(
  prisma: PrismaService,
  autoSendEnabled: boolean
): Promise<void> {
  await prisma.toneProfile.upsert({
    where: { userId: DEMO_USER_ID },
    create: {
      userId: DEMO_USER_ID,
      defaultTone: ToneId.BUSINESS,
      autoSendEnabled
    },
    update: { autoSendEnabled }
  });
}

async function setSenderProfile(
  prisma: PrismaService,
  senderEmail: string,
  flags: {
    autoSendAllowed?: boolean;
    autoSendDenied?: boolean;
    pinAlwaysReview?: boolean;
  }
): Promise<void> {
  const domain = senderEmail.split("@")[1] ?? null;
  await prisma.senderProfile.upsert({
    where: {
      userId_senderEmail: {
        userId: DEMO_USER_ID,
        senderEmail
      }
    },
    create: {
      userId: DEMO_USER_ID,
      senderEmail,
      senderDomain: domain,
      autoSendAllowed: flags.autoSendAllowed ?? false,
      autoSendDenied: flags.autoSendDenied ?? false,
      pinAlwaysReview: flags.pinAlwaysReview ?? false
    },
    update: {
      autoSendAllowed: flags.autoSendAllowed ?? false,
      autoSendDenied: flags.autoSendDenied ?? false,
      pinAlwaysReview: flags.pinAlwaysReview ?? false
    }
  });
}

/**
 * Newsletter-shaped Graph message — body preview contains an "unsubscribe"
 * hint so the deterministic category classifier routes to C, and there are
 * no high-risk patterns so risk is LOW. The mock AI provider assigns
 * confidence 92 to Category C cards, which clears the 90 threshold.
 */
function newsletterMessage(over: {
  id: string;
  fromEmail: string;
  fromName?: string;
}): Record<string, unknown> {
  return {
    id: over.id,
    conversationId: `conv-${over.id}`,
    internetMessageId: `<${over.id}@example.com>`,
    subject: "Weekly digest from Newsletters Inc",
    bodyPreview:
      "Here is your weekly roundup of articles. Click unsubscribe at the bottom to opt out.",
    receivedDateTime: new Date().toISOString(),
    hasAttachments: false,
    from: {
      emailAddress: {
        name: over.fromName ?? "Newsletter",
        address: over.fromEmail
      }
    }
  };
}

/**
 * Legal / contract-shaped message — risk classifier hits a high-risk
 * pattern, which forces Category A. decideAutoSend will reject on
 * risk_not_low or category_not_c.
 */
function highRiskMessage(over: {
  id: string;
  fromEmail: string;
}): Record<string, unknown> {
  return {
    id: over.id,
    conversationId: `conv-${over.id}`,
    internetMessageId: `<${over.id}@example.com>`,
    subject: "Contract review — urgent",
    bodyPreview:
      "Please review the attached NDA and confirm before we proceed with the legal filing.",
    receivedDateTime: new Date().toISOString(),
    hasAttachments: false,
    from: {
      emailAddress: { name: "Legal", address: over.fromEmail }
    }
  };
}

describe("Auto-send wiring (e2e)", () => {
  let handle: Handle;

  beforeAll(async () => {
    handle = await bootstrapWithMockGraph();
  });

  afterAll(async () => {
    await handle.app.close();
  });

  beforeEach(async () => {
    await resetDb(handle.prisma);
    handle.graph.sendCalls.length = 0;
    handle.graph.recentMessages = [];
    await seedConnectedOutlookAccount(handle);
  });

  it("auto-sends a Category C low-risk card when tone autoSendEnabled=true and sender autoSendAllowed=true", async () => {
    const sender = "weekly@newsletters.example";
    await setToneProfile(handle.prisma, true);
    await setSenderProfile(handle.prisma, sender, {
      autoSendAllowed: true,
      autoSendDenied: false,
      pinAlwaysReview: false
    });

    handle.graph.recentMessages = [
      newsletterMessage({ id: "auto-msg-1", fromEmail: sender })
    ];

    const res = await handle.http
      .post("/outlook/sync")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(res.body.created).toHaveLength(1);
    expect(res.body.autoSent).toBe(1);

    const cardId = res.body.created[0];
    const card = await handle.prisma.emailCard.findUniqueOrThrow({
      where: { id: cardId }
    });
    expect(card.status).toBe(EmailCardStatus.SENT);
    expect(card.category).toBe("C");
    expect(card.riskLevel).toBe("LOW");
    expect(card.sentAt).not.toBeNull();

    // Graph send was actually called with the auto-sent draft.
    expect(handle.graph.sendCalls).toHaveLength(1);
    expect(handle.graph.sendCalls[0].messageId).toBe("auto-msg-1");
    expect(handle.graph.sendCalls[0].body.length).toBeGreaterThan(0);

    // Audit + feedback trail.
    const autoAudit = await handle.prisma.auditLog.findFirst({
      where: { emailCardId: cardId, action: "card.auto_sent" }
    });
    expect(autoAudit).not.toBeNull();
    const meta = autoAudit?.metadata as Record<string, unknown> | null;
    expect(meta?.gateId).toBe("all_gates_passed");

    const feedback = await handle.prisma.feedbackEvent.findFirst({
      where: { emailCardId: cardId, action: FeedbackAction.AUTO_SENT }
    });
    expect(feedback).not.toBeNull();
  });

  it("leaves the card PENDING when tone autoSendEnabled=false (master toggle off)", async () => {
    const sender = "weekly2@newsletters.example";
    await setToneProfile(handle.prisma, false);
    await setSenderProfile(handle.prisma, sender, {
      autoSendAllowed: true,
      autoSendDenied: false,
      pinAlwaysReview: false
    });

    handle.graph.recentMessages = [
      newsletterMessage({ id: "auto-msg-2", fromEmail: sender })
    ];

    const res = await handle.http
      .post("/outlook/sync")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(res.body.created).toHaveLength(1);
    expect(res.body.autoSent).toBe(0);

    const cardId = res.body.created[0];
    const card = await handle.prisma.emailCard.findUniqueOrThrow({
      where: { id: cardId }
    });
    expect(card.status).toBe(EmailCardStatus.PENDING);
    expect(card.sentAt).toBeNull();

    expect(handle.graph.sendCalls).toHaveLength(0);

    const autoAudit = await handle.prisma.auditLog.findFirst({
      where: { emailCardId: cardId, action: "card.auto_sent" }
    });
    expect(autoAudit).toBeNull();
    const feedback = await handle.prisma.feedbackEvent.findFirst({
      where: { emailCardId: cardId, action: FeedbackAction.AUTO_SENT }
    });
    expect(feedback).toBeNull();
  });

  it("leaves the card PENDING when the sender has autoSendDenied=true even with the master toggle on", async () => {
    const sender = "weekly3@newsletters.example";
    await setToneProfile(handle.prisma, true);
    // Allowed=true AND Denied=true — deny must win per the trust contract.
    await setSenderProfile(handle.prisma, sender, {
      autoSendAllowed: true,
      autoSendDenied: true,
      pinAlwaysReview: false
    });

    handle.graph.recentMessages = [
      newsletterMessage({ id: "auto-msg-3", fromEmail: sender })
    ];

    const res = await handle.http
      .post("/outlook/sync")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(res.body.created).toHaveLength(1);
    expect(res.body.autoSent).toBe(0);

    const cardId = res.body.created[0];
    const card = await handle.prisma.emailCard.findUniqueOrThrow({
      where: { id: cardId }
    });
    expect(card.status).toBe(EmailCardStatus.PENDING);
    expect(handle.graph.sendCalls).toHaveLength(0);
  });

  it("leaves a HIGH-risk message PENDING regardless of auto-send toggles", async () => {
    const sender = "legal@partner.example";
    await setToneProfile(handle.prisma, true);
    await setSenderProfile(handle.prisma, sender, {
      autoSendAllowed: true,
      autoSendDenied: false,
      pinAlwaysReview: false
    });

    handle.graph.recentMessages = [
      highRiskMessage({ id: "auto-msg-4", fromEmail: sender })
    ];

    const res = await handle.http
      .post("/outlook/sync")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(res.body.created).toHaveLength(1);
    expect(res.body.autoSent).toBe(0);

    const cardId = res.body.created[0];
    const card = await handle.prisma.emailCard.findUniqueOrThrow({
      where: { id: cardId }
    });
    expect(card.status).toBe(EmailCardStatus.PENDING);
    // Risk classifier put this in HIGH and category-classifier forced A.
    expect(card.riskLevel).toBe("HIGH");
    expect(card.category).toBe("A");
    expect(handle.graph.sendCalls).toHaveLength(0);

    const autoAudit = await handle.prisma.auditLog.findFirst({
      where: { emailCardId: cardId, action: "card.auto_sent" }
    });
    expect(autoAudit).toBeNull();
  });
});
