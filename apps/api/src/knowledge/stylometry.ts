/**
 * Stylometry — pure functions that derive ABSTRACTED writing-style and
 * relationship signals from a user's sent mail.
 *
 * Privacy by construction: these functions take short body previews and
 * recipient addresses and return only aggregate features (counts, top-N
 * greetings/sign-offs, length buckets, a formality label). No raw email body
 * is ever returned or stored — the caller persists only what comes out of
 * here. This is the "abstracted profiles" privacy posture from the knowledge
 * base research (docs/KNOWLEDGE_BASE_RESEARCH.md).
 *
 * Everything here is deterministic and side-effect free so it can be unit
 * tested without a database, a network, or an LLM.
 */

export interface SentEmailSample {
  /** Graph's short plaintext preview — NOT the full body. */
  bodyPreview: string;
  subject: string;
  /** Lowercased recipient email addresses (To + Cc). */
  recipients: string[];
  /** ISO timestamp the message was sent. */
  sentAt: string;
}

export type FormalityLabel = "formal" | "business" | "friends";

export interface StyleFeatures {
  /** Human-readable bucket matching ToneProfile.averageReplyLength. */
  averageReplyLength: string;
  /** Most-used opening greetings, most frequent first (max 5). */
  preferredGreetings: string[];
  /** Most-used sign-offs, most frequent first (max 5). */
  preferredSignOffs: string[];
  /** Overall formality leaning across the sample. */
  formality: FormalityLabel;
  /** Number of samples that contributed to these features. */
  sampleSize: number;
}

export interface RecipientSignal {
  email: string;
  domain: string | null;
  messageCount: number;
  /** ISO timestamp of the most recent message to this recipient. */
  lastContactedAt: string;
  /** Formality leaning for messages addressed to this recipient. */
  formality: FormalityLabel;
  /** Length bucket for messages addressed to this recipient. */
  usualReplyLength: string;
}

// Greeting openers we recognise. Order matters: longer phrases first so
// "good morning" wins over a bare "good".
const GREETING_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Good morning", re: /^good morning\b/i },
  { label: "Good afternoon", re: /^good afternoon\b/i },
  { label: "Good evening", re: /^good evening\b/i },
  { label: "Dear", re: /^dear\b/i },
  { label: "Hello", re: /^hello\b/i },
  { label: "Hi", re: /^hi\b/i },
  { label: "Hey", re: /^hey\b/i },
  { label: "Morning", re: /^morning\b/i }
];

const SIGNOFF_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Kind regards", re: /\bkind regards\b/i },
  { label: "Best regards", re: /\bbest regards\b/i },
  { label: "Warm regards", re: /\bwarm regards\b/i },
  { label: "Best wishes", re: /\bbest wishes\b/i },
  { label: "Many thanks", re: /\bmany thanks\b/i },
  { label: "Thanks", re: /\bthanks\b/i },
  { label: "Thank you", re: /\bthank you\b/i },
  { label: "Regards", re: /\bregards\b/i },
  { label: "Cheers", re: /\bcheers\b/i },
  { label: "Sincerely", re: /\bsincerely\b/i },
  { label: "Talk soon", re: /\btalk soon\b/i },
  { label: "Speak soon", re: /\bspeak soon\b/i }
];

// Lexical formality signals. Casual markers pull toward "friends"; formal
// markers pull toward "formal"; the absence of either lands on "business".
const CASUAL_MARKERS = [
  /\bhey\b/i,
  /\bcheers\b/i,
  /\bthanks!\b/i,
  /\byeah\b/i,
  /\bgonna\b/i,
  /\bwanna\b/i,
  /\bnp\b/i,
  /\blol\b/i,
  /[!]{1,}/,
  /:\)|:\(|;\)|:d/i
];
const FORMAL_MARKERS = [
  /\bdear\b/i,
  /\bsincerely\b/i,
  /\bkind regards\b/i,
  /\bplease find\b/i,
  /\bi am writing to\b/i,
  /\bshould you\b/i,
  /\bregarding\b/i,
  /\bfurthermore\b/i,
  /\byours\b/i
];

const FIRST_NAME_GREETING_RE = /^(hi|hey|hello|dear)\s+[a-z]/i;

function firstNonEmptyLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return "";
}

function detectGreeting(bodyPreview: string): string | null {
  const first = firstNonEmptyLine(bodyPreview);
  if (!first) return null;
  for (const { label, re } of GREETING_PATTERNS) {
    if (re.test(first)) return label;
  }
  return null;
}

function detectSignOff(bodyPreview: string): string | null {
  // Sign-offs sit near the end. Body previews are short, so scan the whole
  // preview but prefer the last match (closest to the signature).
  let found: string | null = null;
  for (const { label, re } of SIGNOFF_PATTERNS) {
    if (re.test(bodyPreview)) {
      found = label;
    }
  }
  return found;
}

function scoreFormality(bodyPreview: string): number {
  let score = 0;
  for (const re of FORMAL_MARKERS) {
    if (re.test(bodyPreview)) score += 1;
  }
  for (const re of CASUAL_MARKERS) {
    if (re.test(bodyPreview)) score -= 1;
  }
  // A first-name-only greeting ("Hi Sam,") leans informal.
  if (FIRST_NAME_GREETING_RE.test(firstNonEmptyLine(bodyPreview))) {
    score -= 1;
  }
  return score;
}

function labelFromScore(totalScore: number, n: number): FormalityLabel {
  if (n === 0) return "business";
  const avg = totalScore / n;
  if (avg >= 0.75) return "formal";
  if (avg <= -0.75) return "friends";
  return "business";
}

function classifyLength(avgChars: number): string {
  if (avgChars <= 0) return "2-4 sentences";
  if (avgChars < 120) return "1-2 sentences";
  if (avgChars < 320) return "2-4 sentences";
  return "5+ sentences";
}

function topLabels(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    // Sort by frequency desc, then label asc for stable, deterministic output.
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label]) => label);
}

function bump(map: Map<string, number>, key: string | null): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * Aggregate the user's overall writing voice across all sampled sent mail.
 */
export function extractStyleFeatures(
  samples: SentEmailSample[]
): StyleFeatures {
  const greetings = new Map<string, number>();
  const signOffs = new Map<string, number>();
  let totalChars = 0;
  let formalityTotal = 0;

  for (const s of samples) {
    bump(greetings, detectGreeting(s.bodyPreview));
    bump(signOffs, detectSignOff(s.bodyPreview));
    totalChars += s.bodyPreview.trim().length;
    formalityTotal += scoreFormality(s.bodyPreview);
  }

  const n = samples.length;
  return {
    averageReplyLength: classifyLength(n > 0 ? totalChars / n : 0),
    preferredGreetings: topLabels(greetings, 5),
    preferredSignOffs: topLabels(signOffs, 5),
    formality: labelFromScore(formalityTotal, n),
    sampleSize: n
  };
}

/**
 * Per-recipient relationship signals: how often and how recently the user
 * writes to each correspondent, plus the formality/length they use with them.
 *
 * Returned sorted by messageCount desc (then email asc) so callers can cap to
 * the top-N correspondents deterministically.
 */
export function extractRecipientSignals(
  samples: SentEmailSample[]
): RecipientSignal[] {
  interface Acc {
    count: number;
    lastContactedAt: string;
    formalityTotal: number;
    charsTotal: number;
  }
  const byEmail = new Map<string, Acc>();

  for (const s of samples) {
    const formality = scoreFormality(s.bodyPreview);
    const chars = s.bodyPreview.trim().length;
    for (const email of new Set(s.recipients)) {
      const prev = byEmail.get(email);
      if (!prev) {
        byEmail.set(email, {
          count: 1,
          lastContactedAt: s.sentAt,
          formalityTotal: formality,
          charsTotal: chars
        });
      } else {
        prev.count += 1;
        prev.formalityTotal += formality;
        prev.charsTotal += chars;
        if (s.sentAt > prev.lastContactedAt) {
          prev.lastContactedAt = s.sentAt;
        }
      }
    }
  }

  return [...byEmail.entries()]
    .map(([email, acc]) => ({
      email,
      domain: domainOf(email),
      messageCount: acc.count,
      lastContactedAt: acc.lastContactedAt,
      formality: labelFromScore(acc.formalityTotal, acc.count),
      usualReplyLength: classifyLength(acc.charsTotal / acc.count)
    }))
    .sort((a, b) => (b.messageCount - a.messageCount) || a.email.localeCompare(b.email));
}
