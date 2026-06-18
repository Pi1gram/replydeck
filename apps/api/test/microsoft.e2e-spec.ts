import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request = require("supertest");
import { EmailProvider } from "@prisma/client";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma.service";
import { CryptoService } from "../src/common/crypto.service";
import { GraphClient } from "../src/microsoft/graph-client";

import {
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
  DEMO_USER_NAME,
  resetDb
} from "./setup";

/**
 * Hand-rolled in-memory replacement for GraphClient. Each test sets the
 * fixtures it needs on the instance returned by getMock().
 */
class MockGraphClient {
  exchangeCalls: Array<Record<string, string>> = [];
  refreshCalls: Array<Record<string, string>> = [];
  sendCalls: Array<{ messageId: string; body: string; accessToken: string }> = [];

  exchangeResponse = {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 3600,
    scope: "openid profile email offline_access User.Read Mail.Read Mail.Send",
    token_type: "Bearer"
  };

  refreshResponse = {
    access_token: "access-2",
    refresh_token: "refresh-2",
    expires_in: 3600,
    scope: "openid profile email offline_access User.Read Mail.Read Mail.Send",
    token_type: "Bearer"
  };

  meResponse = {
    id: "ms-user-1",
    mail: "demo@outlook.test",
    userPrincipalName: "demo@outlook.test",
    displayName: "Demo Outlook User"
  };

  recentMessages: Array<Record<string, unknown>> = [];
  conversationMessages: Array<Record<string, unknown>> = [];
  sendShouldFail = false;

  async exchangeCodeForTokens(args: Record<string, string>) {
    this.exchangeCalls.push(args);
    return this.exchangeResponse;
  }

  async refreshTokens(args: Record<string, string>) {
    this.refreshCalls.push(args);
    return this.refreshResponse;
  }

  async getMe() {
    return this.meResponse;
  }

  async listRecentMessages() {
    return this.recentMessages;
  }

  async listMessagesByConversation() {
    return this.conversationMessages;
  }

  async getMessage(_token: string, id: string) {
    return (
      this.recentMessages.find((m) => m["id"] === id) ?? {
        id,
        conversationId: "conv-fallback"
      }
    );
  }

  async sendReply(args: { accessToken: string; messageId: string; body: string }) {
    this.sendCalls.push(args);
    if (this.sendShouldFail) {
      const err = new Error("simulated graph send failure");
      throw err;
    }
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

async function seedConnectedOutlookAccount(
  handle: Handle,
  overrides: { expiresAt?: Date } = {}
): Promise<void> {
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
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000)
    }
  });
}

describe("Microsoft / Outlook (e2e)", () => {
  let handle: Handle;

  beforeAll(async () => {
    handle = await bootstrapWithMockGraph();
  });

  afterAll(async () => {
    await handle.app.close();
  });

  beforeEach(async () => {
    // Ensure demo user + (5) Phase-2 seed cards exist; new tables are
    // truncated by resetDb's CASCADE.
    await resetDb(handle.prisma);
    // Reset mock graph state between tests
    handle.graph.exchangeCalls.length = 0;
    handle.graph.refreshCalls.length = 0;
    handle.graph.sendCalls.length = 0;
    handle.graph.recentMessages = [];
    handle.graph.conversationMessages = [];
    handle.graph.sendShouldFail = false;
  });

  // ---------- /outlook/sync ----------

  describe("POST /outlook/sync", () => {
    beforeEach(async () => {
      await seedConnectedOutlookAccount(handle);
    });

    it("creates EmailCard rows for new Outlook messages", async () => {
      handle.graph.recentMessages = [
        graphMessage({
          id: "msg-imm-1",
          subject: "Quick question",
          fromName: "Alice",
          fromEmail: "alice@example.com",
          hasAttachments: false
        }),
        graphMessage({
          id: "msg-imm-2",
          subject: "Q2 plan attached",
          fromName: "Bob",
          fromEmail: "bob@example.com",
          hasAttachments: true
        })
      ];

      const res = await handle.http
        .post("/outlook/sync")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);

      expect(res.body.created).toHaveLength(2);
      expect(res.body.skipped).toBe(0);

      const cards = await handle.prisma.emailCard.findMany({
        where: {
          userId: DEMO_USER_ID,
          provider: EmailProvider.OUTLOOK
        },
        orderBy: { createdAt: "asc" }
      });
      expect(cards).toHaveLength(2);

      const lowRisk = cards.find((c) => c.providerMessageId === "msg-imm-1")!;
      expect(lowRisk.riskLevel).toBe("LOW");
      expect(lowRisk.hasAttachments).toBe(false);

      const highRisk = cards.find((c) => c.providerMessageId === "msg-imm-2")!;
      expect(highRisk.riskLevel).toBe("HIGH");
      expect(highRisk.riskReason).toContain("attachments");
      expect(highRisk.hasAttachments).toBe(true);
    });

    it("is idempotent — re-syncing the same window does not duplicate", async () => {
      handle.graph.recentMessages = [
        graphMessage({
          id: "msg-imm-3",
          subject: "First sync",
          fromName: "Carol",
          fromEmail: "carol@example.com"
        })
      ];

      const first = await handle.http
        .post("/outlook/sync")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(first.body.created).toHaveLength(1);
      expect(first.body.skipped).toBe(0);

      const second = await handle.http
        .post("/outlook/sync")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(second.body.created).toHaveLength(0);
      expect(second.body.skipped).toBe(1);

      const total = await handle.prisma.emailCard.count({
        where: {
          userId: DEMO_USER_ID,
          provider: EmailProvider.OUTLOOK,
          providerMessageId: "msg-imm-3"
        }
      });
      expect(total).toBe(1);
    });

    it("refreshes the access token when it has already expired", async () => {
      // Wipe and reseed with an expired account.
      await handle.prisma.connectedEmailAccount.deleteMany({
        where: { userId: DEMO_USER_ID }
      });
      await seedConnectedOutlookAccount(handle, {
        expiresAt: new Date(Date.now() - 60 * 1000)
      });

      handle.graph.recentMessages = [
        graphMessage({
          id: "msg-imm-refresh",
          subject: "After refresh",
          fromName: "Dave",
          fromEmail: "dave@example.com"
        })
      ];

      await handle.http
        .post("/outlook/sync")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);

      expect(handle.graph.refreshCalls.length).toBeGreaterThan(0);
      const refreshed = await handle.prisma.connectedEmailAccount.findFirst({
        where: { userId: DEMO_USER_ID }
      });
      expect(refreshed!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ---------- approve sends real Outlook reply ----------

  describe("POST /email-cards/:id/approve (Outlook-linked)", () => {
    beforeEach(async () => {
      await seedConnectedOutlookAccount(handle);
    });

    it("calls Graph sendReply, marks card SENT, audits attempt+success", async () => {
      handle.graph.recentMessages = [
        graphMessage({
          id: "msg-approve-1",
          subject: "Please reply",
          fromName: "Eve",
          fromEmail: "eve@example.com"
        })
      ];
      const sync = await handle.http
        .post("/outlook/sync")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      const cardId = sync.body.created[0];

      // Replace placeholder draft with real text via the edit endpoint.
      await handle.http
        .patch(`/email-cards/${cardId}/reply`)
        .set("x-user-id", DEMO_USER_ID)
        .send({ draftReply: "Hello Eve, on it." })
        .expect(200);

      const approveRes = await handle.http
        .post(`/email-cards/${cardId}/approve`)
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);

      expect(approveRes.body.status).toBe("sent");
      expect(handle.graph.sendCalls).toHaveLength(1);
      expect(handle.graph.sendCalls[0].messageId).toBe("msg-approve-1");
      // Body contains the user's draft plus the "Sent with ReplyDeck AI"
      // footer appended by appendReplyDeckFooter() — see outbound-footer.ts.
      expect(handle.graph.sendCalls[0].body).toContain("Hello Eve, on it.");
      expect(handle.graph.sendCalls[0].body).toContain(
        "Sent with ReplyDeck AI"
      );

      const audits = await handle.prisma.auditLog.findMany({
        where: { emailCardId: cardId },
        orderBy: { createdAt: "asc" }
      });
      const actions = audits.map((a) => a.action);
      expect(actions).toContain("outlook.send.attempt");
      expect(actions).toContain("outlook.send.success");
      expect(actions).toContain("card.approved");
    });

    it("is idempotent — re-approving an already-SENT card does NOT call Graph again", async () => {
      handle.graph.recentMessages = [
        graphMessage({
          id: "msg-approve-2",
          subject: "Once is enough",
          fromName: "Frank",
          fromEmail: "frank@example.com"
        })
      ];
      const sync = await handle.http
        .post("/outlook/sync")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      const cardId = sync.body.created[0];
      await handle.http
        .patch(`/email-cards/${cardId}/reply`)
        .set("x-user-id", DEMO_USER_ID)
        .send({ draftReply: "Sounds good." })
        .expect(200);

      await handle.http
        .post(`/email-cards/${cardId}/approve`)
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);

      // Second approve must NOT trigger another Graph send.
      const second = await handle.http
        .post(`/email-cards/${cardId}/approve`)
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(second.body.status).toBe("sent");
      expect(handle.graph.sendCalls).toHaveLength(1);

      const audit = await handle.prisma.auditLog.findFirst({
        where: {
          emailCardId: cardId,
          action: "outlook.send.skipped_duplicate"
        }
      });
      expect(audit).not.toBeNull();
    });

    it("refuses to send a HIGH-risk Outlook card", async () => {
      handle.graph.recentMessages = [
        graphMessage({
          id: "msg-approve-3",
          subject: "Has attachment",
          fromName: "Grace",
          fromEmail: "grace@example.com",
          hasAttachments: true
        })
      ];
      const sync = await handle.http
        .post("/outlook/sync")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      const cardId = sync.body.created[0];

      // Caller can't bypass HIGH simply by editing — risk stays on the card.
      await handle.http
        .patch(`/email-cards/${cardId}/reply`)
        .set("x-user-id", DEMO_USER_ID)
        .send({ draftReply: "Reply attempt." })
        .expect(200);

      await handle.http
        .post(`/email-cards/${cardId}/approve`)
        .set("x-user-id", DEMO_USER_ID)
        .expect(400);

      expect(handle.graph.sendCalls).toHaveLength(0);
    });

    it("audits a failed send when Graph rejects the request", async () => {
      handle.graph.recentMessages = [
        graphMessage({
          id: "msg-approve-4",
          subject: "Will fail",
          fromName: "Henry",
          fromEmail: "henry@example.com"
        })
      ];
      const sync = await handle.http
        .post("/outlook/sync")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      const cardId = sync.body.created[0];
      await handle.http
        .patch(`/email-cards/${cardId}/reply`)
        .set("x-user-id", DEMO_USER_ID)
        .send({ draftReply: "Hello." })
        .expect(200);

      handle.graph.sendShouldFail = true;
      await handle.http
        .post(`/email-cards/${cardId}/approve`)
        .set("x-user-id", DEMO_USER_ID)
        .expect(500);

      const failed = await handle.prisma.auditLog.findFirst({
        where: { emailCardId: cardId, action: "outlook.send.failed" }
      });
      expect(failed).not.toBeNull();

      const card = await handle.prisma.emailCard.findUnique({
        where: { id: cardId }
      });
      // Card must NOT have been moved to SENT when the send fails.
      expect(card!.status).not.toBe("SENT");
    });
  });

  // ---------- Phase 2 cards still work ----------

  describe("Phase 2 seed cards (no provider)", () => {
    it("approve still flips status to SENT and does NOT call Graph", async () => {
      // No connected account, no providerMessageId → don't try to send.
      const res = await handle.http
        .post("/email-cards/card_001/approve")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(res.body.status).toBe("sent");
      expect(handle.graph.sendCalls).toHaveLength(0);
    });
  });

  // ---------- /settings/disconnect-outlook ----------

  describe("POST /settings/disconnect-outlook", () => {
    it("removes the connected account and writes an audit log", async () => {
      await seedConnectedOutlookAccount(handle);
      await handle.http
        .post("/settings/disconnect-outlook")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);

      const remaining = await handle.prisma.connectedEmailAccount.findFirst({
        where: { userId: DEMO_USER_ID }
      });
      expect(remaining).toBeNull();

      const audit = await handle.prisma.auditLog.findFirst({
        where: { userId: DEMO_USER_ID, action: "outlook.disconnected" }
      });
      expect(audit).not.toBeNull();
    });
  });

  // ---------- /auth/me ----------

  describe("GET /auth/me", () => {
    it("reports outlook.connected=false before connect", async () => {
      const res = await handle.http
        .get("/auth/me")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(res.body.outlook.connected).toBe(false);
    });

    it("reports outlook.connected=true after seeding an account", async () => {
      await seedConnectedOutlookAccount(handle);
      const res = await handle.http
        .get("/auth/me")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(res.body.outlook.connected).toBe(true);
      expect(res.body.outlook.email).toBe("demo@outlook.test");
    });
  });
});

function graphMessage(over: {
  id: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  hasAttachments?: boolean;
  conversationId?: string;
  receivedDateTime?: string;
}): Record<string, unknown> {
  return {
    id: over.id,
    conversationId: over.conversationId ?? `conv-${over.id}`,
    internetMessageId: `<${over.id}@example.com>`,
    subject: over.subject,
    bodyPreview: `Body preview for ${over.subject}`,
    receivedDateTime: over.receivedDateTime ?? new Date().toISOString(),
    hasAttachments: !!over.hasAttachments,
    from: {
      emailAddress: { name: over.fromName, address: over.fromEmail }
    }
  };
}

// Quiet unused-warning when DEMO_USER_EMAIL/NAME aren't directly referenced.
void DEMO_USER_EMAIL;
void DEMO_USER_NAME;
