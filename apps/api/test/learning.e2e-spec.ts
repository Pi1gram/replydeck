import { FeedbackAction, MemoryScope } from "@prisma/client";
import { LearningService } from "../src/learning/learning.service";
import {
  bootstrap,
  createSecondUser,
  DEMO_USER_ID,
  resetDb,
  TestHandle
} from "./setup";

describe("Learning (e2e)", () => {
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

  it("APPROVED → writes SENDER-scope APPROVED_REPLY MemoryItem with truncated snippet", async () => {
    const card = await handle.prisma.emailCard.findUniqueOrThrow({
      where: { id: "card_001" }
    });

    await handle.http
      .post("/email-cards/card_001/approve")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    const items = await handle.prisma.memoryItem.findMany({
      where: { userId: DEMO_USER_ID, sourceType: "APPROVED_REPLY" }
    });
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.scope).toBe(MemoryScope.SENDER);
    expect(item.senderEmail).toBe(card.fromEmail);
    expect(item.content).toContain(card.fromEmail);
    expect(item.content.length).toBeLessThanOrEqual(400);
    // Snippet truncates at ~120 chars when the draft is longer.
    if (card.draftReply.length > 120) {
      expect(item.content).toContain("…");
    }
  });

  it("EDITED → writes USER-scope EDITED_REPLY MemoryItem with change summary", async () => {
    const newText =
      "Hi Jordan,\n\nThanks for the quick note — I'll review the pilot invite copy tomorrow morning with a clearer head and circle back with specific edits.\n\nAlex";

    await handle.http
      .patch("/email-cards/card_004/reply")
      .set("x-user-id", DEMO_USER_ID)
      .send({ draftReply: newText })
      .expect(200);

    const items = await handle.prisma.memoryItem.findMany({
      where: { userId: DEMO_USER_ID, sourceType: "EDITED_REPLY" }
    });
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.scope).toBe(MemoryScope.USER);
    expect(item.senderEmail).toBeNull();
    expect(item.content.toLowerCase()).toContain("user");
    expect(item.content.length).toBeLessThanOrEqual(400);
  });

  it("REJECTED → writes SENDER-scope REJECTED_REPLY MemoryItem", async () => {
    const card = await handle.prisma.emailCard.findUniqueOrThrow({
      where: { id: "card_002" }
    });

    await handle.http
      .post("/email-cards/card_002/reject")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    const items = await handle.prisma.memoryItem.findMany({
      where: { userId: DEMO_USER_ID, sourceType: "REJECTED_REPLY" }
    });
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.scope).toBe(MemoryScope.SENDER);
    expect(item.senderEmail).toBe(card.fromEmail);
    expect(item.content.toLowerCase()).toContain("avoid");
    expect(item.content.length).toBeLessThanOrEqual(400);
  });

  it("REGENERATED → does NOT write a MemoryItem", async () => {
    await handle.http
      .post("/email-cards/card_001/regenerate")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    const items = await handle.prisma.memoryItem.findMany({
      where: { userId: DEMO_USER_ID }
    });
    expect(items).toHaveLength(0);
  });

  it("SAVED_LATER → does NOT write a MemoryItem", async () => {
    await handle.http
      .post("/email-cards/card_003/later")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    const items = await handle.prisma.memoryItem.findMany({
      where: { userId: DEMO_USER_ID }
    });
    expect(items).toHaveLength(0);
  });

  it("caps SENDER-scope at 20 most-recent per (user, sender)", async () => {
    const learning = handle.app.get(LearningService);
    const card = await handle.prisma.emailCard.findUniqueOrThrow({
      where: { id: "card_001" }
    });

    for (let i = 0; i < 21; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await learning.recordFeedback({
        userId: DEMO_USER_ID,
        emailCardId: card.id,
        action: FeedbackAction.APPROVED,
        beforeText: null,
        afterText: null
      });
    }

    const items = await handle.prisma.memoryItem.findMany({
      where: {
        userId: DEMO_USER_ID,
        scope: MemoryScope.SENDER,
        senderEmail: card.fromEmail
      },
      orderBy: { createdAt: "asc" }
    });
    expect(items).toHaveLength(20);
  });

  it("cross-user isolation: user A's actions don't leak into user B's memory", async () => {
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
      .post("/email-cards/card_001/approve")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);
    await handle.http
      .post(`/email-cards/${otherCard.id}/approve`)
      .set("x-user-id", other.id)
      .expect(200);

    const demoItems = await handle.prisma.memoryItem.findMany({
      where: { userId: DEMO_USER_ID }
    });
    const otherItems = await handle.prisma.memoryItem.findMany({
      where: { userId: other.id }
    });

    expect(demoItems).toHaveLength(1);
    expect(otherItems).toHaveLength(1);
    demoItems.forEach((item) => expect(item.userId).toBe(DEMO_USER_ID));
    otherItems.forEach((item) => expect(item.userId).toBe(other.id));
  });

  it("LearningService failure does not break the originating action", async () => {
    const learning = handle.app.get(LearningService);
    const spy = jest
      .spyOn(learning, "recordFeedback")
      .mockRejectedValueOnce(new Error("simulated learning failure"));

    const res = await handle.http
      .post("/email-cards/card_001/approve")
      .set("x-user-id", DEMO_USER_ID)
      .expect(200);

    expect(res.body.status).toBe("sent");
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
