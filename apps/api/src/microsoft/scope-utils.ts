/**
 * Scope diffing for "does this connection need to reconnect?". Microsoft echoes
 * granted scopes either as short names ("Mail.Read") or full resource URIs
 * ("https://graph.microsoft.com/Mail.Read"), so we match case-insensitively by
 * suffix/substring. Pure + unit-testable.
 */

// The delegated Graph resource scopes ReplyDeck needs. openid/profile/email/
// offline_access are auth scopes, not resource scopes, and aren't checked here.
export const RESOURCE_SCOPES = [
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Calendars.Read"
];

export function missingScopes(
  granted: string[],
  required: string[] = RESOURCE_SCOPES
): string[] {
  const have = granted.map((s) => s.toLowerCase());
  return required.filter((req) => {
    const r = req.toLowerCase();
    return !have.some((g) => g === r || g.endsWith(`/${r}`) || g.includes(r));
  });
}
