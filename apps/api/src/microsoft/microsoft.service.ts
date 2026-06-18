import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef
} from "@nestjs/common";
import {
  Category,
  ConnectedEmailAccount,
  EmailProvider,
  Prisma,
  RiskLevel,
  ToneId
} from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { AiContextLoader } from "../ai/ai-context-loader.service";
import { AiService } from "../ai/ai.service";
import type { AiDraftResult } from "../ai/ai.types";
import { decideAutoSend } from "../ai/auto-send-decision";
import { PROMPT_VERSION } from "../ai/prompts/system-prompt";
import { appendReplyDeckFooter } from "../common/outbound-footer";
import { PrismaService } from "../common/prisma.service";
import { CryptoService } from "../common/crypto.service";
import { EmailCardsService } from "../email-cards/email-cards.service";
import { PushDeliveryService } from "../push/push-delivery.service";
import {
  GraphClient,
  GraphHttpError,
  GraphMessage
} from "./graph-client";
import { GraphSubscriptionsService } from "./graph-subscriptions.service";
import { MicrosoftConfig } from "./microsoft.config";

export const ATTACHMENT_RISK_REASON =
  "This email includes attachments and requires manual review.";

// Fallback values used when an AI call fails mid-sync — the card still
// lands so the user can manually regenerate, but it's clearly flagged.
const FALLBACK_SUMMARY = "Couldn't auto-summarise this email — open to read.";
const FALLBACK_SENDER_INTENT = "Tap Regenerate to draft a reply.";
const FALLBACK_DRAFT =
  "(Couldn't draft a reply right now. Tap Regenerate to try again.)";
const FALLBACK_RISK_REASON =
  "Defaulting to manual review until a draft can be generated.";

// Back-compat exports — some downstream code (and tests) still imports
// the placeholder constants. New code should not rely on these.
export const PLACEHOLDER_SUMMARY = FALLBACK_SUMMARY;
export const PLACEHOLDER_SENDER_INTENT = FALLBACK_SENDER_INTENT;
export const PLACEHOLDER_DRAFT = FALLBACK_DRAFT;
export const PLACEHOLDER_RISK_REASON = FALLBACK_RISK_REASON;

const TONE_TO_PRISMA: Record<AiDraftResult["toneApplied"], ToneId> = {
  formal: ToneId.FORMAL,
  business: ToneId.BUSINESS,
  friends: ToneId.FRIENDS
};
const RISK_TO_PRISMA: Record<AiDraftResult["riskLevel"], RiskLevel> = {
  low: RiskLevel.LOW,
  medium: RiskLevel.MEDIUM,
  high: RiskLevel.HIGH
};
const CATEGORY_TO_PRISMA: Record<AiDraftResult["category"], Category> = {
  A: Category.A,
  B: Category.B,
  C: Category.C
};

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
    private readonly config: MicrosoftConfig,
    private readonly ai: AiService,
    private readonly aiContext: AiContextLoader,
    @Inject(forwardRef(() => EmailCardsService))
    private readonly emailCards: EmailCardsService,
    @Inject(forwardRef(() => GraphSubscriptionsService))
    private readonly graphSubscriptions: GraphSubscriptionsService,
    private readonly pushDelivery: PushDeliveryService
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

    // Best-effort: register a Graph push subscription for this user's
    // inbox so we can replace the manual poll with real-time pushes.
    // Failure here must NOT break the OAuth flow — sync will simply
    // continue to run on whatever cadence the client requests until
    // the user reconnects or a renewal pass fixes it.
    try {
      await this.graphSubscriptions.createSubscriptionForUser(args.userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Graph subscription create failed during OAuth callback for ${args.userId}: ${message}`
      );
      await this.prisma.auditLog
        .create({
          data: {
            userId: args.userId,
            action: "graph_subscription.create_failed",
            metadata: { error: message }
          }
        })
        .catch(() => undefined);
    }

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
    const finalBody = appendReplyDeckFooter(body);
    const { accessToken } = await this.getValidAccessToken(userId);
    await this.graph.sendReply({ accessToken, messageId, body: finalBody });
  }

  /**
   * Delete any existing Graph push subscription for the user and immediately
   * create a fresh one. Useful in dev to (re)activate webhooks without going
   * through the full OAuth reconnect flow.
   *
   * Returns the new subscriptionId on success or rethrows so the controller
   * can surface a 4xx/5xx to the caller.
   */
  async resubscribeForUser(
    userId: string
  ): Promise<{ subscriptionId: string }> {
    // Best-effort: delete any stale rows for this user before creating anew.
    // createSubscriptionForUser already does a deleteMany inside a transaction
    // but we also attempt a Graph-side DELETE for any existing subscriptionId
    // so we don't leave orphaned subscriptions upstream.
    const existing = await this.prisma.graphSubscription.findFirst({
      where: { userId }
    });
    if (existing) {
      try {
        await this.graphSubscriptions.deleteSubscription(
          existing.subscriptionId
        );
      } catch (err) {
        // Log and continue — Graph may have already expired the subscription.
        this.logger.warn(
          `resubscribe: deleteSubscription failed for ${existing.subscriptionId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    const created = await this.graphSubscriptions.createSubscriptionForUser(
      userId
    );
    return { subscriptionId: created.subscriptionId };
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
  ): Promise<{ created: string[]; skipped: number; autoSent: number }> {
    const messages = await this.getRecentMessages(userId, top);
    const created: string[] = [];
    let skipped = 0;
    let autoSent = 0;

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

      const draftFields = await this.draftFieldsForMessage(userId, msg);

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
            summary: draftFields.summary,
            senderIntent: draftFields.senderIntent,
            contextUsed: draftFields.contextUsed,
            draftReply: draftFields.draftReply,
            confidenceScore: draftFields.confidenceScore,
            riskLevel: draftFields.riskLevel,
            riskReason: draftFields.riskReason,
            category: draftFields.category,
            toneApplied: draftFields.toneApplied,
            aiPromptVersion: draftFields.aiPromptVersion,
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
              hasAttachments: msg.hasAttachments,
              aiOk: draftFields.aiOk,
              aiPromptVersion: draftFields.aiPromptVersion,
              confidence: draftFields.confidenceScore
            }
          }
        });
        return made;
      });
      created.push(card.id);

      // Phase 5 — try auto-send for this freshly-created card. Failure must
      // NEVER break the sync loop (a transient Graph error or a flipped
      // toggle should leave the card PENDING, not abort syncing the next
      // message). Re-processed/duplicate cards are skipped above so we
      // only hit this branch for new cards.
      let didAutoSend = false;
      if (draftFields.aiOk) {
        didAutoSend = await this.tryAutoSend(userId, card, draftFields);
        if (didAutoSend) autoSent += 1;
      }

      // Phase 6 — push notify the device. Auto-sent cards get the
      // AUTO_SENT_SUMMARY category so the device can refresh its widget
      // cache (the user already approved this draft implicitly). New
      // pending cards get NEW_CARD so the device pops the standard
      // "approve / edit / reject" notification.
      //
      // riskLevel is forwarded so the Expo provider can pick the right
      // iOS/Android notification category id (REPLY_CARD_HIGH vs
      // REPLY_CARD) and so the client can render a priority badge.
      const senderName = msg.fromName || msg.fromEmail || "unknown sender";
      const pushRiskLevel = draftFields.riskLevel.toLowerCase();
      // Put the AI-drafted reply in the notification body so the user can read
      // it (and Send/Regenerate) straight from the lock screen. The subject
      // moves to the iOS subtitle line for context.
      const draftPreview =
        card.draftReply.length > 350
          ? `${card.draftReply.slice(0, 349)}…`
          : card.draftReply;
      await this.pushDelivery
        .sendToUser(userId, {
          cardId: card.id,
          title: didAutoSend
            ? `Auto-sent reply to ${senderName}`
            : `New from ${senderName}`,
          subtitle: card.subject,
          body: didAutoSend ? card.subject : draftPreview,
          category: didAutoSend ? "AUTO_SENT_SUMMARY" : "NEW_CARD",
          riskLevel: pushRiskLevel
        })
        .catch((err) =>
          this.logger.warn(
            `push send failed for card ${card.id}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        );
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: "outlook.sync",
        metadata: {
          fetched: messages.length,
          created: created.length,
          skipped,
          autoSent
        }
      }
    });

    return { created, skipped, autoSent };
  }

  /**
   * Phase 5 — wraps the auto-send decision + (if eligible) the actual send
   * in a single try/catch. Returns true iff the card was auto-sent.
   *
   * Any failure here is logged and audited but never rethrown — the sync
   * loop continues. If a category-C eligible card fails to auto-send, the
   * user simply sees it PENDING in their queue and can approve manually.
   */
  private async tryAutoSend(
    userId: string,
    card: { id: string; fromEmail: string; hasAttachments: boolean },
    draft: {
      category: Category;
      riskLevel: RiskLevel;
      confidenceScore: number;
    }
  ): Promise<boolean> {
    try {
      const [toneRow, senderRow] = await Promise.all([
        this.prisma.toneProfile.findUnique({ where: { userId } }),
        this.prisma.senderProfile.findUnique({
          where: {
            userId_senderEmail: { userId, senderEmail: card.fromEmail }
          }
        })
      ]);

      const decision = decideAutoSend({
        ai: {
          category:
            draft.category === Category.A
              ? "A"
              : draft.category === Category.B
              ? "B"
              : "C",
          riskLevel:
            draft.riskLevel === RiskLevel.LOW
              ? "low"
              : draft.riskLevel === RiskLevel.MEDIUM
              ? "medium"
              : "high",
          confidenceScore: draft.confidenceScore
        },
        card: { hasAttachments: card.hasAttachments },
        user: { autoSendEnabled: toneRow?.autoSendEnabled ?? false },
        sender: senderRow
          ? {
              autoSendAllowed: senderRow.autoSendAllowed,
              autoSendDenied: senderRow.autoSendDenied,
              pinAlwaysReview: senderRow.pinAlwaysReview
            }
          : null
      });

      if (!decision.autoSend) {
        // Not eligible — leave the card PENDING. No audit needed; the
        // decision is implicit in the absence of a card.auto_sent row.
        return false;
      }

      await this.emailCards.autoSendCard(userId, card.id, {
        gateId: decision.gateId,
        reason: decision.reason
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Auto-send failed for card ${card.id}: ${message}. Card remains PENDING.`
      );
      await this.prisma.auditLog
        .create({
          data: {
            userId,
            emailCardId: card.id,
            action: "auto_send.failure",
            metadata: {
              stage: "sync",
              error: message
            }
          }
        })
        .catch(() => undefined);
      return false;
    }
  }

  /**
   * Run the AI for one freshly-synced message. Falls back to high-risk
   * placeholders if the AI call fails so a single AI hiccup doesn't fail
   * the whole sync run — the user will see a "tap regenerate to retry"
   * card rather than losing the email entirely.
   */
  private async draftFieldsForMessage(
    userId: string,
    msg: OutlookMessage
  ): Promise<{
    summary: string;
    senderIntent: string;
    contextUsed: Prisma.InputJsonValue;
    draftReply: string;
    confidenceScore: number;
    riskLevel: RiskLevel;
    riskReason: string;
    category: Category;
    toneApplied: ToneId | null;
    aiPromptVersion: string | null;
    aiOk: boolean;
  }> {
    try {
      const aiInput = await this.aiContext.loadContext({
        userId,
        currentEmail: {
          fromName: msg.fromName,
          fromEmail: msg.fromEmail,
          subject: msg.subject,
          receivedAt: msg.receivedAt,
          bodyPreview: msg.bodyPreview ?? "",
          hasAttachments: msg.hasAttachments
        }
      });
      const ai = await this.ai.generateDraft(aiInput);
      return {
        summary: ai.summary,
        senderIntent: ai.senderIntent,
        contextUsed: ai.contextUsed.slice(0, 4) as Prisma.InputJsonValue,
        draftReply: ai.draftReply,
        confidenceScore: ai.confidenceScore,
        riskLevel: RISK_TO_PRISMA[ai.riskLevel],
        riskReason: ai.riskReason,
        category: CATEGORY_TO_PRISMA[ai.category],
        toneApplied: TONE_TO_PRISMA[ai.toneApplied],
        aiPromptVersion: PROMPT_VERSION,
        aiOk: true
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `AI draft failed for message ${msg.id} during sync: ${message}. Falling back.`
      );
      return {
        summary: msg.bodyPreview || FALLBACK_SUMMARY,
        senderIntent: FALLBACK_SENDER_INTENT,
        contextUsed: [] as Prisma.InputJsonValue,
        draftReply: FALLBACK_DRAFT,
        confidenceScore: 0,
        riskLevel: RiskLevel.HIGH,
        riskReason: msg.hasAttachments
          ? ATTACHMENT_RISK_REASON
          : FALLBACK_RISK_REASON,
        category: Category.A,
        toneApplied: null,
        aiPromptVersion: null,
        aiOk: false
      };
    }
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
