import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Logger,
  Optional,
  Post,
  Query,
  Res,
  forwardRef
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { Response } from "express";
import { Public } from "../common/public.decorator";
import { PrismaService } from "../common/prisma.service";
import { GraphSubscriptionsService } from "./graph-subscriptions.service";
import { GRAPH_SYNC_QUEUE } from "./graph-queues";
import { MicrosoftService } from "./microsoft.service";

/**
 * Microsoft Graph push-notification receiver.
 *
 * Two response modes, both on the same POST:
 *
 *  1. VALIDATION HANDSHAKE — when Graph first creates a subscription it
 *     POSTs once with `?validationToken=...`. We MUST echo that token
 *     back as text/plain with HTTP 200 within 10 seconds. No DB work,
 *     no auth — Graph never sends an Authorization header here.
 *
 *  2. CHANGE NOTIFICATION — the live payload. The body looks like:
 *       { "value": [
 *         { "subscriptionId": "...", "clientState": "...",
 *           "resource": "...", "changeType": "created", ... }
 *       ] }
 *     We verify `clientState` matches the row we stored at create-time
 *     (spoof-prevention) and enqueue a per-user `graph-sync` BullMQ
 *     job. Graph expects a 202 within ~30s; we return immediately and
 *     let the worker do the slow Graph + AI work.
 *
 * This endpoint is @Public() — Graph cannot send `x-user-id`. Auth comes
 * from the clientState secret check, not the dev guard.
 */

interface GraphChangeNotification {
  subscriptionId?: string;
  subscriptionExpirationDateTime?: string;
  changeType?: string;
  resource?: string;
  resourceData?: { id?: string; "@odata.id"?: string; "@odata.type"?: string };
  clientState?: string;
  tenantId?: string;
}

interface GraphNotificationBody {
  value?: GraphChangeNotification[];
}

@Controller("webhooks/microsoft-graph")
export class GraphWebhooksController {
  private readonly logger = new Logger(GraphWebhooksController.name);

  constructor(
    private readonly subscriptions: GraphSubscriptionsService,
    private readonly prisma: PrismaService,
    // MicrosoftService — injected via forwardRef to avoid circular DI between
    // GraphWebhooksController → MicrosoftService → GraphSubscriptionsService
    // → MicrosoftService. Used as a fire-and-forget fallback when the BullMQ
    // queue is absent (no Redis in dev).
    @Inject(forwardRef(() => MicrosoftService))
    private readonly microsoft: MicrosoftService,
    // Optional — if Redis/BullMQ wasn't configured the queue provider may be
    // absent. We fall back to a direct syncRecentInboxToCards call so a
    // missing Redis in dev still processes Graph callbacks (fire-and-forget).
    @Optional()
    @InjectQueue(GRAPH_SYNC_QUEUE)
    private readonly graphSyncQueue?: Queue
  ) {}

  @Public()
  @Post()
  async handleNotification(
    @Res() res: Response,
    @Query("validationToken") validationToken?: string,
    @Body() body?: GraphNotificationBody
  ): Promise<void> {
    // 1) Validation handshake — Graph just wants the token echoed.
    if (typeof validationToken === "string" && validationToken.length > 0) {
      res.status(200).type("text/plain").send(validationToken);
      return;
    }

    const notifications = body?.value ?? [];
    if (notifications.length === 0) {
      // Graph occasionally pings with empty bodies; ack and move on.
      res.status(202).send();
      return;
    }

    // 2) Real notification. Verify each clientState before doing
    //    anything DB-side. Dedupe user ids so one batch of N
    //    notifications enqueues one sync per user, not N.
    const userIdsToSync = new Set<string>();
    for (const n of notifications) {
      if (!n.subscriptionId) continue;
      const row = await this.subscriptions.findBySubscriptionId(
        n.subscriptionId
      );
      if (!row) {
        this.logger.warn(
          `Notification for unknown subscriptionId=${n.subscriptionId}; ignoring`
        );
        continue;
      }
      if (
        typeof n.clientState !== "string" ||
        !safeEquals(row.clientState, n.clientState)
      ) {
        // clientState mismatch — this is either a spoofed webhook or a
        // stale subscription we forgot to delete. Refuse the whole
        // batch to be safe; logging will tell us which.
        this.logger.error(
          `clientState mismatch for subscription ${n.subscriptionId}`
        );
        await this.prisma.auditLog
          .create({
            data: {
              userId: row.userId,
              action: "graph_subscription.client_state_mismatch",
              metadata: { subscriptionId: n.subscriptionId }
            }
          })
          .catch(() => undefined);
        throw new BadRequestException("clientState mismatch");
      }
      userIdsToSync.add(row.userId);
    }

    for (const userId of userIdsToSync) {
      if (this.graphSyncQueue) {
        await this.graphSyncQueue.add(
          "graph-sync",
          { userId },
          {
            // jobId scopes dedup to a short window: if 3 notifications
            // for the same user arrive within a second we still only
            // sync once. The 5-second resolution is plenty for the
            // typical "5 emails arrive at once" burst case.
            jobId: `graph-sync:${userId}:${Math.floor(Date.now() / 5000)}`,
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 }
          }
        );
      } else {
        // No Redis / BullMQ queue available. Fire-and-forget a direct sync
        // so Graph callbacks still trigger inbox processing in dev (or on a
        // Fly instance without Redis). We return 202 immediately without
        // awaiting — Graph needs a fast response and the sync can take
        // several seconds due to AI drafting.
        this.logger.warn(
          `graph-sync queue not available — falling back to inline sync for user ${userId}. ` +
            `Set REDIS_URL and restart to enable the BullMQ worker path.`
        );
        void this.microsoft
          .syncRecentInboxToCards(userId, 10)
          .catch((e: unknown) =>
            this.logger.warn(
              `Inline graph-sync failed for user ${userId}: ${
                e instanceof Error ? e.message : String(e)
              }`
            )
          );
      }
    }

    res.status(202).send();
  }
}

/** Constant-time string compare to thwart timing attacks on clientState. */
function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
