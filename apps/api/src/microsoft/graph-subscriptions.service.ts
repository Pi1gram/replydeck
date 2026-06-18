import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef
} from "@nestjs/common";
import { GraphSubscription } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../common/prisma.service";
import { MicrosoftService } from "./microsoft.service";

/**
 * Microsoft Graph change-notification subscriptions.
 *
 * Background:
 *  - POST /subscriptions creates a push subscription against
 *    /me/mailFolders('Inbox')/messages with changeType=created.
 *  - Graph will POST notifications to our `notificationUrl` whenever a
 *    matching change occurs.
 *  - On creation Graph performs a synchronous validation handshake — it
 *    POSTs once with `?validationToken=...` and expects the body echoed
 *    back as text/plain within 10 seconds. The webhook controller
 *    handles that side; this service just kicks off creation.
 *  - Mail subscriptions expire after ~3 days max. We renew under that
 *    limit on a 6-hour BullMQ cron (see subscription-renewer.processor).
 *  - `clientState` is a per-subscription secret that Graph echoes in
 *    every notification. The webhook MUST verify it matches before
 *    trusting the payload — otherwise an attacker who knows our webhook
 *    URL can spoof inbox events.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SUBSCRIPTION_RESOURCE = "/me/mailFolders('Inbox')/messages";
const SUBSCRIPTION_CHANGE_TYPE = "created";

// Mail subscriptions cap out at ~4230 minutes (~70.5 hours / 2.9 days)
// per Graph docs. Stay safely under that on renewal.
const RENEWAL_LIFETIME_HOURS = 70;

export interface CreatedSubscription {
  subscriptionId: string;
  expirationDateTime: Date;
}

interface GraphSubscriptionPayload {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  clientState: string;
  expirationDateTime: string;
  applicationId?: string;
  creatorId?: string;
}

class GraphSubscriptionHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = "GraphSubscriptionHttpError";
  }
}

@Injectable()
export class GraphSubscriptionsService {
  private readonly logger = new Logger(GraphSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MicrosoftService))
    private readonly microsoft: MicrosoftService
  ) {}

  /**
   * Create a Graph push subscription on the user's Inbox and persist
   * the row. Idempotent at the row level: if a row already exists for
   * the user we re-create it on Graph (the old one may be expired) and
   * overwrite the local record.
   */
  async createSubscriptionForUser(
    userId: string
  ): Promise<CreatedSubscription> {
    const baseUrl = this.requireWebhookBaseUrl();
    const { accessToken } = await this.microsoft.getValidAccessToken(userId);

    const clientState = randomBytes(32).toString("hex");
    const expirationDateTime = new Date(
      Date.now() + RENEWAL_LIFETIME_HOURS * 60 * 60 * 1000
    );

    const payload = {
      changeType: SUBSCRIPTION_CHANGE_TYPE,
      notificationUrl: `${stripTrailingSlash(baseUrl)}/webhooks/microsoft-graph`,
      resource: SUBSCRIPTION_RESOURCE,
      expirationDateTime: expirationDateTime.toISOString(),
      clientState
    };

    let created: GraphSubscriptionPayload;
    try {
      created = await this.graphRequest<GraphSubscriptionPayload>({
        method: "POST",
        path: "/subscriptions",
        accessToken,
        body: payload
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Graph subscription create failed for user ${userId}: ${msg}`
      );
      throw err;
    }

    // Replace any prior row for this user — we only want one active
    // subscription per (user, resource) at a time.
    await this.prisma.$transaction(async (tx) => {
      await tx.graphSubscription.deleteMany({ where: { userId } });
      await tx.graphSubscription.create({
        data: {
          userId,
          subscriptionId: created.id,
          resource: created.resource,
          expirationDateTime: new Date(created.expirationDateTime),
          clientState
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "graph_subscription.created",
          metadata: {
            subscriptionId: created.id,
            expirationDateTime: created.expirationDateTime,
            resource: created.resource
          }
        }
      });
    });

    return {
      subscriptionId: created.id,
      expirationDateTime: new Date(created.expirationDateTime)
    };
  }

  /**
   * Renew an existing subscription by PATCHing a new expirationDateTime.
   * Throws if the local row is missing or Graph rejects the request.
   */
  async renewSubscription(subscriptionId: string): Promise<GraphSubscription> {
    const row = await this.prisma.graphSubscription.findUnique({
      where: { subscriptionId }
    });
    if (!row) {
      throw new NotFoundException(
        `GraphSubscription ${subscriptionId} not found`
      );
    }

    const { accessToken } = await this.microsoft.getValidAccessToken(row.userId);
    const newExpiration = new Date(
      Date.now() + RENEWAL_LIFETIME_HOURS * 60 * 60 * 1000
    );

    await this.graphRequest<GraphSubscriptionPayload>({
      method: "PATCH",
      path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      accessToken,
      body: { expirationDateTime: newExpiration.toISOString() }
    });

    const updated = await this.prisma.graphSubscription.update({
      where: { subscriptionId },
      data: {
        expirationDateTime: newExpiration,
        renewedAt: new Date()
      }
    });
    await this.prisma.auditLog.create({
      data: {
        userId: row.userId,
        action: "graph_subscription.renewed",
        metadata: {
          subscriptionId,
          expirationDateTime: newExpiration.toISOString()
        }
      }
    });
    return updated;
  }

  /**
   * Delete a subscription on Graph and remove the local row. Best-effort:
   * a 404 from Graph (subscription already gone) is treated as success.
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    const row = await this.prisma.graphSubscription.findUnique({
      where: { subscriptionId }
    });
    if (!row) return;

    try {
      const { accessToken } = await this.microsoft.getValidAccessToken(row.userId);
      await this.graphRequest<void>({
        method: "DELETE",
        path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        accessToken
      });
    } catch (err) {
      if (
        err instanceof GraphSubscriptionHttpError &&
        (err.status === 404 || err.status === 410)
      ) {
        // Already gone upstream — fall through and clean up locally.
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Graph subscription delete failed for ${subscriptionId}: ${msg}`
        );
        throw err;
      }
    }

    await this.prisma.graphSubscription
      .delete({ where: { subscriptionId } })
      .catch(() => undefined);
    await this.prisma.auditLog.create({
      data: {
        userId: row.userId,
        action: "graph_subscription.deleted",
        metadata: { subscriptionId }
      }
    });
  }

  /**
   * Return all subscription rows whose expirationDateTime is within
   * `hours` of now. Used by the renewal cron to find rows that should
   * be PATCHed before Graph drops them.
   */
  async listExpiringWithin(hours: number): Promise<GraphSubscription[]> {
    const threshold = new Date(Date.now() + hours * 60 * 60 * 1000);
    return this.prisma.graphSubscription.findMany({
      where: { expirationDateTime: { lt: threshold } },
      orderBy: { expirationDateTime: "asc" }
    });
  }

  /** Look up the local row by Graph subscriptionId. */
  findBySubscriptionId(
    subscriptionId: string
  ): Promise<GraphSubscription | null> {
    return this.prisma.graphSubscription.findUnique({
      where: { subscriptionId }
    });
  }

  private requireWebhookBaseUrl(): string {
    const url = process.env.PUBLIC_WEBHOOK_BASE_URL;
    if (!url || url.trim().length === 0) {
      throw new BadRequestException(
        "PUBLIC_WEBHOOK_BASE_URL is not set — cannot create Graph subscription"
      );
    }
    return url.trim();
  }

  private async graphRequest<T>(args: {
    method: "POST" | "PATCH" | "DELETE";
    path: string;
    accessToken: string;
    body?: unknown;
  }): Promise<T> {
    const res = await fetch(`${GRAPH_BASE}${args.path}`, {
      method: args.method,
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: args.body ? JSON.stringify(args.body) : undefined
    });
    if (res.status === 204 || res.status === 202) {
      return undefined as T;
    }
    const text = await res.text();
    let json: unknown = undefined;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    if (!res.ok) {
      throw new GraphSubscriptionHttpError(
        res.status,
        json,
        `Graph ${args.method} ${args.path} failed: ${res.status} ${res.statusText}`
      );
    }
    return json as T;
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
