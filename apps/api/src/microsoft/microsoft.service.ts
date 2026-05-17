import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  ConnectedEmailAccount,
  EmailProvider,
  Prisma,
  RiskLevel
} from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../common/prisma.service";
import { CryptoService } from "../common/crypto.service";
import {
  GraphClient,
  GraphHttpError,
  GraphMessage
} from "./graph-client";
import { MicrosoftConfig } from "./microsoft.config";

export const ATTACHMENT_RISK_REASON =
  "This email includes attachments and requires manual review.";

export const PLACEHOLDER_SUMMARY = "AI summary pending — Phase 4.";
export const PLACEHOLDER_SENDER_INTENT = "Pending classification.";
export const PLACEHOLDER_DRAFT =
  "AI draft pending — Phase 4 will generate this reply.";
export const PLACEHOLDER_RISK_REASON = "Default risk pending classification.";

export interface OutlookMessage {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject: string;
  bodyPreview: string;
  receivedAt: string;
  hasAttachments: boolean;
  fromName: string;
  fromEmail: string;
}

export interface OAuthStartParams {
  url: string;
  state: string;
  codeVerifier: string;
}

@Injectable()
export class MicrosoftService {
  private readonly logger = new Logger(MicrosoftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly graph: GraphClient,
    private readonly config: MicrosoftConfig
  ) {}

  /**
   * Start the OAuth dance — returns the authorize URL plus state + verifier
   * for the controller to drop in a short-lived HttpOnly cookie.
   */
  async startOAuth(userId: string): Promise<OAuthStartParams> {
    this.requireConfig();
    const state = base64url(randomBytes(32));
    const codeVerifier = base64url(randomBytes(64));
    const codeChallenge = base64url(
      createHash("sha256").update(codeVerifier).digest()
    );

    const url = new URL(this.config.authorizeUrl());
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", this.config.scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: "outlook.oauth.start",
        metadata: { state }
      }
    });

    return { url: url.toString(), state, codeVerifier };
  }

  /**
   * Exchange the authorization code for tokens, fetch the user's email
   * address from Graph, and persist the connection encrypted-at-rest.
   */
  async handleOAuthCallback(args: {
    userId: string;
    code: string;
    codeVerifier: string;
  }): Promise<ConnectedEmailAccount> {
    this.requireConfig();
    const tokens = await this.graph.exchangeCodeForTokens({
      tenantId: this.config.tenantId,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri,
      code: args.code,
      codeVerifier: args.codeVerifier
    });

    if (!tokens.refresh_token) {
      throw new BadRequestException(
        "No refresh_token returned. Ensure 'offline_access' scope is requested."
      );
    }

    let me;
    try {
      me = await this.graph.getMe(tokens.access_token);
    } catch (err) {
      this.logger.warn(`getMe failed during OAuth callback: ${String(err)}`);
      throw new BadRequestException("Failed to read /me from Microsoft Graph");
    }

    const email = me.mail || me.userPrincipalName || "unknown@unknown";
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const scopes = tokens.scope
      ? tokens.scope.split(" ").filter(Boolean)
      : this.config.scopes;

    const account = await this.prisma.connectedEmailAccount.upsert({
      where: {
        userId_provider: {
          userId: args.userId,
          provider: EmailProvider.OUTLOOK
        }
      },
      create: {
        userId: args.userId,
        provider: EmailProvider.OUTLOOK,
        providerUserId: me.id,
        email,
        encryptedAccessToken: this.crypto.encrypt(tokens.access_token),
        encryptedRefreshToken: this.crypto.encrypt(tokens.refresh_token),
        scopes,
        expiresAt
      },
      update: {
        providerUserId: me.id,
        email,
        encryptedAccessToken: this.crypto.encrypt(tokens.access_token),
        encryptedRefreshToken: this.crypto.encrypt(tokens.refresh_token),
        scopes,
        expiresAt
      }
    });

    await this.prisma.auditLog.create({
      data: {
        userId: args.userId,
        action: "outlook.connected",
        metadata: {
          email,
          providerUserId: me.id,
          scopes
        }
      }
    });

    return account;
  }

  /**
   * Force-refresh the access token for a specific connected account.
   * Used by the public method below. Exposed so callers can pre-refresh
   * before a long-running batch.
   */
  async refreshAccessToken(accountId: string): Promise<ConnectedEmailAccount> {
    this.requireConfig();
    const account = await this.prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    });
    if (!account) {
      throw new NotFoundException(`ConnectedEmailAccount ${accountId} not found`);
    }
    return this.refreshTokens(account);
  }

  /**
   * Get a still-valid access token for the user, refreshing if it expired
   * or is within 60 seconds of expiry.
   */
  async getValidAccessToken(userId: string): Promise<{
    accessToken: string;
    account: ConnectedEmailAccount;
  }> {
    const account = await this.requireConnectedAccount(userId);
    const skewMs = 60_000;
    const needsRefresh =
      !account.expiresAt ||
      account.expiresAt.getTime() - Date.now() < skewMs;
    const fresh = needsRefresh ? await this.refreshTokens(account) : account;
    return {
      accessToken: this.crypto.decrypt(fresh.encryptedAccessToken),
      account: fresh
    };
  }

  async getRecentMessages(
    userId: string,
    top = 10
  ): Promise<OutlookMessage[]> {
    const { accessToken } = await this.getValidAccessToken(userId);
    const messages = await this.graph.listRecentMessages(accessToken, top);
    return messages.map(toOutlookMessage);
  }

  async getMessageThread(
    userId: string,
    messageId: string
  ): Promise<OutlookMessage[]> {
    const { accessToken } = await this.getValidAccessToken(userId);
    const head = await this.graph.getMessage(accessToken, messageId);
    if (!head.conversationId) {
      return [toOutlookMessage(head)];
    }
    const thread = await this.graph.listMessagesByConversation(
      accessToken,
      head.conversationId
    );
    return thread.map(toOutlookMessage);
  }

  async sendReply(
    userId: string,
    messageId: string,
    body: string
  ): Promise<void> {
    if (!body || body.trim().length === 0) {
      throw new BadRequestException("Cannot send an empty reply");
    }
    const { accessToken } = await this.getValidAccessToken(userId);
    await this.graph.sendReply({ accessToken, messageId, body });
  }

  async hasConnectedAccount(userId: string): Promise<boolean> {
    const acct = await this.prisma.connectedEmailAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: EmailProvider.OUTLOOK
        }
      }
    });
    return !!acct;
  }

  async getConnectedAccount(
    userId: string
  ): Promise<ConnectedEmailAccount | null> {
    return this.prisma.connectedEmailAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: EmailProvider.OUTLOOK
        }
      }
    });
  }

  async disconnect(userId: string): Promise<void> {
    const acct = await this.getConnectedAccount(userId);
    if (!acct) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.connectedEmailAccount.delete({ where: { id: acct.id } });
      await tx.auditLog.create({
        data: {
          userId,
          action: "outlook.disconnected",
          metadata: { email: acct.email }
        }
      });
    });
  }

  /**
   * Pull recent Outlook messages and create EmailCard rows for any we
   * haven't seen yet. Returns the IDs of cards created during this sync.
   *
   * Phase 3: AI placeholder values are used for summary / draftReply /
   * confidence. Phase 4 will replace these.
   */
  async syncRecentInboxToCards(
    userId: string,
    top = 10
  ): Promise<{ created: string[]; skipped: number }> {
    const messages = await this.getRecentMessages(userId, top);
    const created: string[] = [];
    let skipped = 0;

    for (const msg of messages) {
      const existing = await this.prisma.emailCard.findUnique({
        where: {
          userId_provider_providerMessageId: {
            userId,
            provider: EmailProvider.OUTLOOK,
            providerMessageId: msg.id
          }
        }
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const isHigh = msg.hasAttachments;
      const card = await this.prisma.$transaction(async (tx) => {
        const made = await tx.emailCard.create({
          data: {
            userId,
            provider: EmailProvider.OUTLOOK,
            providerMessageId: msg.id,
            internetMessageId: msg.internetMessageId ?? null,
            fromName: msg.fromName,
            fromEmail: msg.fromEmail,
            subject: msg.subject,
            receivedAt: new Date(msg.receivedAt),
            summary: msg.bodyPreview || PLACEHOLDER_SUMMARY,
            senderIntent: PLACEHOLDER_SENDER_INTENT,
            contextUsed: [] as Prisma.InputJsonValue,
            draftReply: PLACEHOLDER_DRAFT,
            confidenceScore: 0,
            riskLevel: isHigh ? RiskLevel.HIGH : RiskLevel.LOW,
            riskReason: isHigh
              ? ATTACHMENT_RISK_REASON
              : PLACEHOLDER_RISK_REASON,
            hasAttachments: msg.hasAttachments
          }
        });
        await tx.auditLog.create({
          data: {
            userId,
            emailCardId: made.id,
            action: "card.created",
            metadata: {
              source: "outlook.sync",
              providerMessageId: msg.id,
              hasAttachments: msg.hasAttachments
            }
          }
        });
        return made;
      });
      created.push(card.id);
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: "outlook.sync",
        metadata: {
          fetched: messages.length,
          created: created.length,
          skipped
        }
      }
    });

    return { created, skipped };
  }

  private async requireConnectedAccount(
    userId: string
  ): Promise<ConnectedEmailAccount> {
    const acct = await this.getConnectedAccount(userId);
    if (!acct) {
      throw new UnauthorizedException(
        "No connected Outlook account. Run /auth/microsoft/start first."
      );
    }
    return acct;
  }

  private async refreshTokens(
    account: ConnectedEmailAccount
  ): Promise<ConnectedEmailAccount> {
    this.requireConfig();
    const refreshToken = this.crypto.decrypt(account.encryptedRefreshToken);
    let tokens;
    try {
      tokens = await this.graph.refreshTokens({
        tenantId: this.config.tenantId,
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        refreshToken
      });
    } catch (err) {
      if (err instanceof GraphHttpError && err.status >= 400 && err.status < 500) {
        // Refresh token has been revoked or expired — drop the account so
        // the user is forced to reconnect.
        this.logger.warn(
          `Refresh failed for account ${account.id} (status ${err.status}); deleting`
        );
        await this.prisma.connectedEmailAccount
          .delete({ where: { id: account.id } })
          .catch(() => undefined);
        await this.prisma.auditLog.create({
          data: {
            userId: account.userId,
            action: "outlook.token.refresh.failed",
            metadata: { status: err.status }
          }
        });
      }
      throw err;
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const updated = await this.prisma.connectedEmailAccount.update({
      where: { id: account.id },
      data: {
        encryptedAccessToken: this.crypto.encrypt(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token
          ? this.crypto.encrypt(tokens.refresh_token)
          : account.encryptedRefreshToken,
        expiresAt
      }
    });
    await this.prisma.auditLog.create({
      data: {
        userId: account.userId,
        action: "outlook.token.refreshed",
        metadata: { expiresAt: expiresAt.toISOString() }
      }
    });
    return updated;
  }

  private requireConfig(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new BadRequestException(
        "Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET."
      );
    }
    if (!this.config.redirectUri) {
      throw new BadRequestException("MICROSOFT_REDIRECT_URI not set");
    }
  }
}

function toOutlookMessage(m: GraphMessage): OutlookMessage {
  const fromName = m.from?.emailAddress?.name ?? "Unknown sender";
  const fromEmail = m.from?.emailAddress?.address ?? "unknown@unknown";
  return {
    id: m.id,
    conversationId: m.conversationId,
    internetMessageId: m.internetMessageId,
    subject: m.subject ?? "(no subject)",
    bodyPreview: m.bodyPreview ?? "",
    receivedAt: m.receivedDateTime ?? new Date().toISOString(),
    hasAttachments: m.hasAttachments ?? false,
    fromName,
    fromEmail
  };
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
