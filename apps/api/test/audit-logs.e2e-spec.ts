import {
  bootstrap,
  createSecondUser,
  DEMO_USER_ID,
  makeCreateCardPayload,
  resetDb,
  TestHandle
} from "./setup";

describe("AuditLogs (e2e)", () => {
  let handle: TestHandle;

  beforeAll(async () => {
    handle = await bootstrap();
  });

  afterAll(async () => {
    await handle.app.close();
  });

  beforeEach(async () => {
    await resetDb(handle.prisma);
  });

  it("returns rows ordered by createdAt desc with the expected actions", async () => {
    // Run a varied set of mutations.
    await handle.http
      .post("/email-cards")
      .set("x-user-id", DEMO_USER_ID)
      .send(makeCreateCardPayload({ subject: "Audit test #1" }))
      .expect(201);
    await handle.http
      .post("/email-cards/card_001/approve")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);
    await handle.http
      .post("/email-cards/card_002/later")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);
    await handle.http
      .patch("/email-cards/card_003/reply")
      .set("x-user-id", DEMO_USER_ID)
      .send({ draftReply: "edited body" })
      .expect(200);

    const res = await handle.http
      .get("/audit-logs")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    // desc ordering
    for (let i = 0; i < res.body.length - 1; i += 1) {
      const a = new Date(res.body[i].createdAt).getTime();
      const b = new Date(res.body[i + 1].createdAt).getTime();
      expect(a).toBeGreaterThanOrEqual(b);
    }

    const actions = res.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "card.created",
        "card.approved",
        "card.later",
        "card.edited"
      ])
    );
  });

  it("respects ?limit=1", async () => {
    await handle.http
      .post("/email-cards/card_001/approve")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);
    await handle.http
      .post("/email-cards/card_002/reject")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    const res = await handle.http
      .get("/audit-logs?limit=1")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(res.body).toHaveLength(1);
  });

  it("does not surface another user's audit logs", async () => {
    await handle.http
      .post("/email-cards/card_001/approve")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    const other = await createSecondUser(handle.prisma, "user_audit_other_01");
    const otherCard = await handle.prisma.emailCard.create({
      data: {
        userId: other.id,
        fromName: "Other Sender",
        fromEmail: "other2@example.com",
        subject: "Other subject",
        receivedAt: new Date("2026-05-10T10:00:00.000Z"),
        summary: "summary",
        senderIntent: "intent",
        contextUsed: ["x"],
        draftReply: "draft",
        confidenceScore: 50,
        riskLevel: "LOW",
        riskReason: "reason"
      }
    });
    await handle.http
      .post(`/email-cards/${otherCard.id}/reject`)
      .set("x-user-id", other.id)
      .expect(200);

    const demoRes = await handle.http
      .get("/audit-logs")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    demoRes.body.forEach((e: { userId: string }) => {
      expect(e.userId).toBe(DEMO_USER_ID);
    });
    expect(
      demoRes.body.some(
        (e: { emailCardId: string | null }) => e.emailCardId === otherCard.id
      )
    ).toBe(false);
  });
});
