/**
 * Turn raw busy calendar intervals into a compact, model-friendly free/busy
 * summary. Pure and deterministic (takes `now` as an argument so it can be
 * unit-tested). All times are treated as UTC.
 *
 * Privacy: only busy time ranges are summarised here — never event subjects,
 * attendees, or locations.
 */

export interface BusyInterval {
  /** ISO start (UTC). */
  start: string;
  /** ISO end (UTC). */
  end: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
const DAY_MS = 24 * 60 * 60 * 1000;

function hhmm(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * @param busy   busy intervals from the calendar
 * @param opts.now   reference instant (the window starts at this day, UTC)
 * @param opts.days  number of days to summarise (clamped 1..14)
 */
export function summarizeAvailability(
  busy: BusyInterval[],
  opts: { now: Date; days: number }
): string {
  const days = Math.max(1, Math.min(14, opts.days));
  const base = Date.UTC(
    opts.now.getUTCFullYear(),
    opts.now.getUTCMonth(),
    opts.now.getUTCDate()
  );

  const parsed = busy
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end))
    .sort((a, b) => a.start - b.start);

  const lines: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const dayStart = base + i * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const blocks = parsed.filter(
      (b) => b.start < dayEnd && b.end > dayStart
    );
    if (blocks.length === 0) {
      lines.push(`- ${dayLabel(dayStart)}: free`);
    } else {
      const ranges = blocks
        .map((b) => `${hhmm(Math.max(b.start, dayStart))}-${hhmm(Math.min(b.end, dayEnd))}`)
        .join(", ");
      lines.push(`- ${dayLabel(dayStart)}: busy ${ranges}`);
    }
  }

  return `Next ${days} days (UTC):\n${lines.join("\n")}`;
}
