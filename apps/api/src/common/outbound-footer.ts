/**
 * The "Sent with ReplyDeck AI" outbound footer (Guy memo, May 2026).
 *
 * Appended to every reply we send through any email provider. Kept short
 * and unobtrusive — per the memo, *not* a marketing banner. Recipients
 * who are curious can follow the link.
 *
 * Disable via REPLYDECK_FOOTER_DISABLED=true for tests, internal sends, or
 * if a user later opts out.
 */

const FOOTER_TEXT = "— Sent with ReplyDeck AI";

export function appendReplyDeckFooter(
  body: string,
  opts: { disabled?: boolean } = {}
): string {
  if (opts.disabled) return body;
  if (process.env.REPLYDECK_FOOTER_DISABLED === "true") return body;

  const trimmed = body.replace(/\s+$/, "");
  if (trimmed.length === 0) return body;
  // Idempotency — if the user (or a prior pass) already wrote the footer,
  // don't double-append.
  if (trimmed.includes(FOOTER_TEXT)) return body;

  return `${trimmed}\n\n${FOOTER_TEXT}`;
}
