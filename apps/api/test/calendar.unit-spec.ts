import { detectMeetingIntent } from "../src/microsoft/calendar/meeting-intent";
import { summarizeAvailability } from "../src/microsoft/calendar/availability";

describe("detectMeetingIntent", () => {
  it("flags scheduling language", () => {
    expect(detectMeetingIntent("Quick call?", "Are you free Tuesday?")).toBe(
      true
    );
    expect(detectMeetingIntent("Coffee", "want to grab a coffee next week?")).toBe(
      true
    );
    expect(detectMeetingIntent("Re: project", "Can we schedule a meeting?")).toBe(
      true
    );
    expect(detectMeetingIntent("Zoom", "I'll send a zoom link")).toBe(true);
  });

  it("ignores non-scheduling email", () => {
    expect(
      detectMeetingIntent("Invoice #42", "Please find the invoice attached.")
    ).toBe(false);
    expect(detectMeetingIntent("FYI", "Sharing the report for your records.")).toBe(
      false
    );
  });
});

describe("summarizeAvailability", () => {
  const now = new Date("2026-06-24T08:00:00.000Z"); // Wednesday

  it("labels days with no events as free", () => {
    const out = summarizeAvailability([], { now, days: 3 });
    expect(out).toContain("Next 3 days (UTC):");
    expect(out).toContain("Wed 24 Jun: free");
    expect(out.match(/free/g)?.length).toBe(3);
  });

  it("summarises busy blocks per day in UTC", () => {
    const out = summarizeAvailability(
      [
        { start: "2026-06-24T09:00:00Z", end: "2026-06-24T10:30:00Z" },
        { start: "2026-06-24T14:00:00Z", end: "2026-06-24T15:00:00Z" },
        { start: "2026-06-25T11:00:00Z", end: "2026-06-25T12:00:00Z" }
      ],
      { now, days: 2 }
    );
    expect(out).toContain("Wed 24 Jun: busy 09:00-10:30, 14:00-15:00");
    expect(out).toContain("Thu 25 Jun: busy 11:00-12:00");
  });

  it("treats naive-UTC (Z-suffixed) inputs correctly and clamps to the window", () => {
    const out = summarizeAvailability(
      [{ start: "2026-06-24T23:00:00Z", end: "2026-06-25T01:00:00Z" }],
      { now, days: 2 }
    );
    // Spills across midnight: clamped on each day.
    expect(out).toContain("Wed 24 Jun: busy 23:00-00:00");
    expect(out).toContain("Thu 25 Jun: busy 00:00-01:00");
  });

  it("clamps the day count to a sane maximum", () => {
    const out = summarizeAvailability([], { now, days: 99 });
    expect(out).toContain("Next 14 days (UTC):");
  });
});
