/**
 * Thin wrapper around Microsoft Graph HTTP endpoints we use in Phase 3.
 *
 * Always sends `Prefer: IdType="ImmutableId"` so message ids are stable across
 * folder moves — we store these as `EmailCard.providerMessageId`.
 *
 * Kept as a class (rather than a namespace of free functions) so e2e tests can
 * inject a stub via the Nest DI container.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface GraphMessageRecipient {
  emailAddress?: { name?: string; address?: string };
}

export interface GraphMessage {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  from?: GraphMessageRecipient;
  toRecipients?: GraphMessageRecipient[];
  ccRecipients?: GraphMessageRecipient[];
}

export interface GraphDateTimeTimeZone {
  dateTime: string;
  timeZone?: string;
}

export interface GraphEvent {
  id?: string;
  showAs?: string;
  isAllDay?: boolean;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
}

export interface GraphTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  id_token?: string;
}

export interface GraphMeResponse {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

export class GraphHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = "GraphHttpError";
  }
}

export class GraphClient {
  /**
   * Exchange an authorization code (PKCE) for tokens.
   */
  async exchangeCodeForTokens(args: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): Promise<GraphTokenResponse> {
    const url = `https://login.microsoftonline.com/${args.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.redirectUri,
      code_verifier: args.codeVerifier
    });
    return this.tokenRequest(url, body);
  }

  /**
   * Refresh an access token using a refresh token.
   */
  async refreshTokens(args: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<GraphTokenResponse> {
    const url = `https://login.microsoftonline.com/${args.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      grant_type: "refresh_token",
      refresh_token: args.refreshToken
    });
    return this.tokenRequest(url, body);
  }

  async getMe(accessToken: string): Promise<GraphMeResponse> {
    return this.graphGet<GraphMeResponse>("/me", accessToken);
  }

  async listRecentMessages(
    accessToken: string,
    top: number
  ): Promise<GraphMessage[]> {
    const safeTop = Math.max(1, Math.min(50, top));
    const path =
      `/me/messages?$top=${safeTop}` +
      `&$orderby=receivedDateTime%20desc` +
      `&$select=id,conversationId,internetMessageId,subject,bodyPreview,receivedDateTime,hasAttachments,from,toRecipients`;
    const res = await this.graphGet<{ value: GraphMessage[] }>(
      path,
      accessToken
    );
    return res.value ?? [];
  }

  /**
   * Read the user's most-recent SENT messages (the SentItems well-known
   * folder). Used by Phase 7 to learn the user's writing voice. We only
   * select bodyPreview (not the full body) so we never pull more content than
   * the abstracted-learning pipeline needs.
   *
   * Requires the existing Mail.Read scope — SentItems is covered by it; no
   * new consent prompt is needed.
   */
  async listSentMessages(
    accessToken: string,
    top: number
  ): Promise<GraphMessage[]> {
    const safeTop = Math.max(1, Math.min(200, top));
    const path =
      `/me/mailFolders/sentitems/messages?$top=${safeTop}` +
      `&$orderby=sentDateTime%20desc` +
      `&$select=id,conversationId,internetMessageId,subject,bodyPreview,sentDateTime,hasAttachments,from,toRecipients,ccRecipients`;
    const res = await this.graphGet<{ value: GraphMessage[] }>(
      path,
      accessToken
    );
    return res.value ?? [];
  }

  async listMessagesByConversation(
    accessToken: string,
    conversationId: string
  ): Promise<GraphMessage[]> {
    const filter = encodeURIComponent(`conversationId eq '${conversationId}'`);
    const path =
      `/me/messages?$filter=${filter}` +
      `&$orderby=receivedDateTime%20asc` +
      `&$select=id,conversationId,internetMessageId,subject,bodyPreview,receivedDateTime,hasAttachments,from,toRecipients`;
    const res = await this.graphGet<{ value: GraphMessage[] }>(
      path,
      accessToken
    );
    return res.value ?? [];
  }

  /**
   * Read the user's events between two instants (the calendar VIEW endpoint,
   * which expands recurring series). Requests UTC so callers can treat all
   * returned dateTimes as UTC. Only availability-relevant fields are selected —
   * no subject, attendees, or body. Requires the Calendars.Read scope.
   */
  async getCalendarView(
    accessToken: string,
    startIso: string,
    endIso: string
  ): Promise<GraphEvent[]> {
    const path =
      `/me/calendarView?startDateTime=${encodeURIComponent(startIso)}` +
      `&endDateTime=${encodeURIComponent(endIso)}` +
      `&$select=start,end,showAs,isAllDay` +
      `&$orderby=start/dateTime&$top=100`;
    const res = await this.graphGet<{ value: GraphEvent[] }>(
      path,
      accessToken,
      'outlook.timezone="UTC"'
    );
    return res.value ?? [];
  }

  async getMessage(
    accessToken: string,
    messageId: string
  ): Promise<GraphMessage> {
    return this.graphGet<GraphMessage>(
      `/me/messages/${encodeURIComponent(messageId)}`,
      accessToken
    );
  }

  /**
   * Reply to a message using Graph's createReply + send pattern would let us
   * customize headers, but `/reply` is the simplest path and Outlook handles
   * threading automatically.
   */
  async sendReply(args: {
    accessToken: string;
    messageId: string;
    body: string;
  }): Promise<void> {
    const path = `/me/messages/${encodeURIComponent(args.messageId)}/reply`;
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
        Prefer: 'IdType="ImmutableId"'
      },
      body: JSON.stringify({
        comment: args.body
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new GraphHttpError(
        res.status,
        text,
        `Graph reply failed: ${res.status} ${res.statusText}`
      );
    }
  }

  private async graphGet<T>(
    path: string,
    accessToken: string,
    extraPrefer?: string
  ): Promise<T> {
    const prefer = extraPrefer
      ? `IdType="ImmutableId", ${extraPrefer}`
      : 'IdType="ImmutableId"';
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        Prefer: prefer
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new GraphHttpError(
        res.status,
        text,
        `Graph GET ${path} failed: ${res.status} ${res.statusText}`
      );
    }
    return (await res.json()) as T;
  }

  private async tokenRequest(
    url: string,
    body: URLSearchParams
  ): Promise<GraphTokenResponse> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const json = (await res.json()) as
      | GraphTokenResponse
      | { error: string; error_description?: string };
    if (!res.ok || "error" in json) {
      throw new GraphHttpError(
        res.status,
        json,
        `OAuth token endpoint failed: ${
          "error" in json ? json.error_description ?? json.error : res.statusText
        }`
      );
    }
    return json;
  }
}
