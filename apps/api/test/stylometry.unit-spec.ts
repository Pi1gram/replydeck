import {
  extractRecipientSignals,
  extractStyleFeatures,
  SentEmailSample
} from "../src/knowledge/stylometry";

function sample(overrides: Partial<SentEmailSample> = {}): SentEmailSample {
  return {
    bodyPreview: "Hi Sam,\n\nThanks for this. I'll take a look.\n\nAlex",
    subject: "Re: project",
    recipients: ["sam@acme.com"],
    sentAt: "2026-06-01T10:00:00.000Z",
    ...overrides
  };
}

describe("extractStyleFeatures", () => {
  it("returns business defaults for an empty sample", () => {
    const f = extractStyleFeatures([]);
    expect(f.sampleSize).toBe(0);
    expect(f.formality).toBe("business");
    expect(f.preferredGreetings).toEqual([]);
    expect(f.preferredSignOffs).toEqual([]);
    expect(f.averageReplyLength).toBe("2-4 sentences");
  });

  it("detects the most frequent greeting and sign-off, most-frequent first", () => {
    const samples = [
      sample({ bodyPreview: "Hi Sam,\n\nThanks for this.\n\nAlex" }),
      sample({ bodyPreview: "Hi Jo,\n\nGot it, thanks.\n\nAlex" }),
      sample({ bodyPreview: "Hello team,\n\nPlease see below. Regards, Alex" })
    ];
    const f = extractStyleFeatures(samples);
    expect(f.preferredGreetings[0]).toBe("Hi");
    expect(f.preferredGreetings).toContain("Hello");
    expect(f.preferredSignOffs[0]).toBe("Thanks");
  });

  it("classifies a formal corpus as formal", () => {
    const formal =
      "Dear Dr. Smith,\n\nI am writing to confirm the arrangements regarding the contract. Please find the details enclosed. Should you require anything further, do let me know.\n\nYours sincerely,\nAlex";
    const f = extractStyleFeatures([
      sample({ bodyPreview: formal }),
      sample({ bodyPreview: formal })
    ]);
    expect(f.formality).toBe("formal");
  });

  it("classifies a casual corpus as friends", () => {
    const casual = "Hey Sam!\n\nyeah sounds good, gonna grab coffee? Cheers!";
    const f = extractStyleFeatures([
      sample({ bodyPreview: casual }),
      sample({ bodyPreview: casual })
    ]);
    expect(f.formality).toBe("friends");
  });

  it("buckets long messages into 5+ sentences", () => {
    const long = "Dear team, ".concat("This is a detailed update. ".repeat(20));
    const f = extractStyleFeatures([sample({ bodyPreview: long })]);
    expect(f.averageReplyLength).toBe("5+ sentences");
  });

  it("caps greetings/sign-offs at 5 and is deterministic", () => {
    const bodies = [
      "Hi a,\n\nthanks",
      "Hello a,\n\nregards",
      "Hey a,\n\ncheers",
      "Dear a,\n\nsincerely",
      "Good morning a,\n\nbest wishes",
      "Good afternoon a,\n\nmany thanks"
    ];
    const f = extractStyleFeatures(bodies.map((b) => sample({ bodyPreview: b })));
    expect(f.preferredGreetings.length).toBeLessThanOrEqual(5);
    expect(f.preferredSignOffs.length).toBeLessThanOrEqual(5);
    // Deterministic across runs.
    const f2 = extractStyleFeatures(
      bodies.map((b) => sample({ bodyPreview: b }))
    );
    expect(f.preferredGreetings).toEqual(f2.preferredGreetings);
  });

  it("never returns raw body text in features (abstraction guarantee)", () => {
    const secret = "the launch code is 1234-SECRET";
    const f = extractStyleFeatures([
      sample({ bodyPreview: `Hi,\n\n${secret}\n\nthanks` })
    ]);
    const serialized = JSON.stringify(f);
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("1234");
  });
});

describe("extractRecipientSignals", () => {
  it("aggregates per recipient and sorts by message count desc", () => {
    const samples = [
      sample({ recipients: ["boss@acme.com"] }),
      sample({ recipients: ["boss@acme.com"] }),
      sample({ recipients: ["friend@gmail.com"] })
    ];
    const signals = extractRecipientSignals(samples);
    expect(signals[0].email).toBe("boss@acme.com");
    expect(signals[0].messageCount).toBe(2);
    expect(signals[0].domain).toBe("acme.com");
    expect(signals[1].email).toBe("friend@gmail.com");
  });

  it("tracks the most recent contact timestamp", () => {
    const signals = extractRecipientSignals([
      sample({ recipients: ["x@y.com"], sentAt: "2026-05-01T00:00:00.000Z" }),
      sample({ recipients: ["x@y.com"], sentAt: "2026-06-15T00:00:00.000Z" }),
      sample({ recipients: ["x@y.com"], sentAt: "2026-05-20T00:00:00.000Z" })
    ]);
    expect(signals[0].lastContactedAt).toBe("2026-06-15T00:00:00.000Z");
  });

  it("counts a message once per distinct recipient even if duplicated", () => {
    const signals = extractRecipientSignals([
      sample({ recipients: ["dup@y.com", "dup@y.com"] })
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0].messageCount).toBe(1);
  });

  it("derives per-recipient formality independently", () => {
    const signals = extractRecipientSignals([
      sample({
        recipients: ["boss@acme.com"],
        bodyPreview:
          "Dear Sir,\n\nI am writing to confirm regarding the matter. Yours sincerely, Alex"
      }),
      sample({
        recipients: ["mate@gmail.com"],
        bodyPreview: "Hey!\n\nyeah gonna grab a beer? cheers!"
      })
    ]);
    const boss = signals.find((s) => s.email === "boss@acme.com");
    const mate = signals.find((s) => s.email === "mate@gmail.com");
    expect(boss?.formality).toBe("formal");
    expect(mate?.formality).toBe("friends");
  });
});
