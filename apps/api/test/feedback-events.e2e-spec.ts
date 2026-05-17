import {
  bootstrap,
  createSecondUser,
  DEMO_USER_ID,
  resetDb,
  TestHandle
} from "./setup";

describe("FeedbackEvents (e2e)", () => {
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

  it("returns rows ordered by createdAt desc after several mutations", async () => {
    // Trigger 3 feedback-emitting actions across 3 different cards.
    await handle.http
      .post("/email-cards/card_001/approve")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);
    await handle.http
      .post("/email-cards/card_002/reject")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);
    await handle.http
      .post("/email-cards/card_003/regenerate")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    const res = await handle.http
      .get("/feedback-events")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);

    // Ordered desc by createdAt.
    for (let i = 0; i < res.body.length - 1; i += 1) {
      const a = new Date(res.body[i].createdAt).getTime();
      const b = new Date(res.body[i + 1].createdAt).getTime();
      expect(a).toBeGreaterThanOrEqual(b);
    }

    // Sanity: actions present include the three we triggered.
    const actions = new Set(res.body.map((e: { action: string }) => e.action));
    expect(actions.has("APPROVED")).toBe(true);
    expect(actions.has("REJECTED")).toBe(true);
    expect(actions.has("REGENERATED")).toBe(true);
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
      .get("/feedback-events?limit=1")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(res.body).toHaveLength(1);
  });

  it("does not surface another user's feedback events", async () => {
    // Demo user creates 2 feedback events.
    await handle.http
      .post("/email-cards/card_001/approve")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);
    await handle.http
      .post("/email-cards/card_002/reject")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    // Other user has its own card and triggers an event on it.
    const other = await createSecondUser(handle.prisma);
    const otherCard = await handle.prisma.emailCard.create({
      data: {
        userId: other.id,
        fromName: "Other Sender",
        fromEmail: "other@example.com",
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
      .post(`/email-cards/${otherCard.id}/approve`)
      .set("x-user-id", other.id)
      .expect(200);

    const demoRes = await handle.http
      .get("/feedback-events")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    // Demo user must only see their own events.
    demoRes.body.forEach((e: { userId: string }) => {
      expect(e.userId).toBe(DEMO_USER_ID);
    });
    // And the other user's card id must not appear.
    expect(
      demoRes.body.some(
        (e: { emailCardId: string }) => e.emailCardId === otherCard.id
      )
    ).toBe(false);
  });
});
