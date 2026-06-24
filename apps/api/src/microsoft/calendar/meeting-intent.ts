/**
 * Cheap, deterministic detector for "this email is asking to meet / schedule".
 * Used to decide whether to spend a Graph calendar call + inject availability
 * into the draft. Pure and unit-testable.
 */

const MEETING_PATTERNS: RegExp[] = [
  /\bmeet(ing|\sup)?\b/i,
  /\bcatch[\s-]?up\b/i,
  /\b(phone|video|conference)?\s?call\b/i,
  /\bschedul(e|ing)\b/i,
  /\bre[\s-]?schedule\b/i,
  /\bcalendar\b/i,
  /\bdiary\b/i,
  /\bavailabilit(y|ies)\b/i,
  /\bare you (free|available)\b/i,
  /\bwhat time\b/i,
  /\bwhen (works|suits|are you)\b/i,
  /\bbook (a|some) time\b/i,
  /\bset up (a|some) time\b/i,
  /\bgrab (a )?(coffee|lunch|chat)\b/i,
  /\b(zoom|teams|google meet|hangout)\b/i,
  /\bhop on\b/i,
  /\bget together\b/i,
  /\bappointment\b/i,
  /\bslot\b/i
];

export function detectMeetingIntent(subject: string, body: string): boolean {
  const text = `${subject}\n${body}`.toLowerCase();
  return MEETING_PATTERNS.some((re) => re.test(text));
}
