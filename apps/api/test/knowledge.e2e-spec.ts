import { ForbiddenException } from "@nestjs/common";
import { KnowledgeService } from "../src/knowledge/knowledge.service";
import {
  MicrosoftService,
  SentMessage
} from "../src/microsoft/microsoft.service";
import {
  bootstrap,
  createSecondUser,
  DEMO_USER_ID,
  resetDb,
  TestHandle
} from "./setup";

const FIXTURE: SentMessage[] = [
  {
    id: "s1",
    subject: "Re: pilot",
    bodyPreview: "Hi Jordan,\n\nThanks for the note. I'll review tomorrow.\n\nAlex",
    sentAt: "2026-06-01T09:00:00.000Z",
    recipients: ["jordan@acme.com"]
  },
  {
    id: "s2",
    subject: "Re: invoice",
    bodyPreview: "Hi Jordan,\n\nGot it, thanks!\n\nAlex",
    sentAt: "2026-06-10T09:00:00.000Z",
    recipients: ["jordan@acme.com", "billing@acme.com"]
  },
  {
    id: "s3",
    subject: "Dinner",
    bodyPreview: "Hey!\n\nyeah gonna grab a beer? cheers!",
    sentAt: "2026-06-12T09:00:00.000Z",
    recipients: ["mate@gmail.com"]
  }
];

describe("Knowledge / sent-mail learning (e2e)", () => {
  let handle: TestHandle;
  let knowledge: KnowledgeService;

  beforeAll(async () => {
    handle = await bootstrap();
    knowledge = handle.app.get(KnowledgeService);
    jest
      .spyOn(handle.app.get(MicrosoftService), "getSentMessages")
      .mockResolvedValue(FIXTURE);
  });

  afterAll(async () => {
    await handle.app.close();
  });

  beforeEach(async () => {
    await resetDb(handle.prisma);
  });

  it("rejects learning without consent (403)", async () => {
    await expect(
      knowledge.learnFromSentMail(DEMO_USER_ID)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("consent → learn populates ToneProfile, SenderProfiles, and topic memory", async () => {
    await knowledge.setConsent(DEMO_USER_ID, true);
    const result = await knowledge.learnFromSentMail(DEMO_USER_ID);

    expect(result.learned).toBe(true);
    expect(result.sampleSize).toBe(3);
    expect(result.recipientsLearned).toBe(3);

    const tone = await handle.prisma.toneProfile.findUniqueOrThrow({
      where: { userId: DEMO_USER_ID }
    });
    expect(tone.preferredGreetings).toContain("Hi");
    expect(tone.learnedSampleSize).toBe(3);
    expect(tone.learnedFromSentAt).not.toBeNull();

    // Most-frequent correspondent learned with a count and recency.
    const jordan = await handle.prisma.senderProfile.findUniqueOrThrow({
      where: {
        userId_senderEmail: {
          userId: DEMO_USER_ID,
          senderEmail: "jordan@acme.com"
        }
      }
    });
    expect(jordan.messageCount).toBe(2);
    expect(jordan.senderDomain).toBe("acme.com");
    expect(jordan.lastContactedAt?.toISOString()).toBe(
      "2026-06-10T09:00:00.000Z"
    );

    const memory = await handle.prisma.memoryItem.findMany({
      where: { userId: DEMO_USER_ID, sourceType: "SENT_EMAIL" }
    });
    expect(memory.length).toBeGreaterThan(0);
    memory.forEach((m) => expect(m.content.length).toBeLessThanOrEqual(400));
  });

  it("never persists raw email body text (abstraction guarantee)", async () => {
    const secret = "PROJECT-NIGHTFALL-2027";
    jest
      .spyOn(handle.app.get(MicrosoftService), "getSentMessages")
      .mockResolvedValueOnce([
        {
          id: "x1",
          subject: "secret",
          bodyPreview: `Hi,\n\n${secret} is confidential.\n\nthanks`,
          sentAt: "2026-06-01T09:00:00.000Z",
          recipients: ["x@y.com"]
        }
      ]);
    await knowledge.setConsent(DEMO_USER_ID, true);
    await knowledge.learnFromSentMail(DEMO_USER_ID);

    const memory = await handle.prisma.memoryItem.findMany({
      where: { userId: DEMO_USER_ID }
    });
    memory.forEach((m) => expect(m.content).not.toContain(secret));
  });

  it("is idempotent — re-running does not duplicate topic memory", async () => {
    await knowledge.setConsent(DEMO_USER_ID, true);
    await knowledge.learnFromSentMail(DEMO_USER_ID);
    const first = await handle.prisma.memoryItem.count({
      where: { userId: DEMO_USER_ID, sourceType: "SENT_EMAIL" }
    });
    await knowledge.learnFromSentMail(DEMO_USER_ID);
    const second = await handle.prisma.memoryItem.count({
      where: { userId: DEMO_USER_ID, sourceType: "SENT_EMAIL" }
    });
    expect(second).toBe(first);
  });

  it("cross-user isolation: learned profiles never leak across tenants", async () => {
    const other = await createSecondUser(handle.prisma);
    await knowledge.setConsent(DEMO_USER_ID, true);
    await knowledge.learnFromSentMail(DEMO_USER_ID);

    const otherSenders = await handle.prisma.senderProfile.findMany({
      where: { userId: other.id }
    });
    const otherMemory = await handle.prisma.memoryItem.findMany({
      where: { userId: other.id }
    });
    expect(otherSenders).toHaveLength(0);
    expect(otherMemory).toHaveLength(0);
  });
});
