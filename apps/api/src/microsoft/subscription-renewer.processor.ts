import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../common/prisma.service";
import { GraphSubscriptionsService } from "./graph-subscriptions.service";
import { SUBSCRIPTION_RENEWAL_QUEUE } from "./graph-queues";

/**
 * BullMQ worker for the subscription-renewal cron.
 *
 * Runs every 6 hours (configured via repeat options when the queue is
 * registered in microsoft.module.ts). On each tick:
 *
 *  1. List all GraphSubscription rows expiring within the next 24 hours.
 *  2. For each, PATCH a new expirationDateTime via the Graph service.
 *  3. On failure, retry once. If the retry also fails, delete the
 *     subscription locally + upstream and write an audit event so the
 *     user knows that real-time push is offline until they reconnect.
 *
 * Note: this Processor only runs if BullMQ has a live Redis connection.
 * When REDIS_URL is unset the queue registration logs a warning and the
 * processor is never instantiated.
 */
@Processor(SUBSCRIPTION_RENEWAL_QUEUE)
export class SubscriptionRenewerProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionRenewerProcessor.name);

  constructor(
    private readonly subscriptions: GraphSubscriptionsService,
    private readonly prisma: PrismaService
  ) {
    super();
  }

  async process(_job: Job): Promise<{ renewed: number; failed: number }> {
    const dueSoon = await this.subscriptions.listExpiringWithin(24);
    if (dueSoon.length === 0) {
      return { renewed: 0, failed: 0 };
    }
    this.logger.log(`Renewing ${dueSoon.length} Graph subscription(s)`);

    let renewed = 0;
    let failed = 0;

    for (const row of dueSoon) {
      const ok = await this.tryRenew(row.subscriptionId, row.userId);
      if (ok) {
        renewed += 1;
      } else {
        failed += 1;
      }
    }

    return { renewed, failed };
  }

  private async tryRenew(
    subscriptionId: string,
    userId: string
  ): Promise<boolean> {
    // Attempt 1
    try {
      await this.subscriptions.renewSubscription(subscriptionId);
      return true;
    } catch (err) {
      this.logger.warn(
        `Renewal attempt 1 failed for ${subscriptionId}: ${describeErr(err)}`
      );
    }

    // Attempt 2 (single retry)
    try {
      await this.subscriptions.renewSubscription(subscriptionId);
      return true;
    } catch (err) {
      const msg = describeErr(err);
      this.logger.error(
        `Renewal attempt 2 failed for ${subscriptionId}: ${msg}. Deleting.`
      );
      await this.prisma.auditLog
        .create({
          data: {
            userId,
            action: "graph_subscription.renewal_failed",
            metadata: { subscriptionId, error: msg }
          }
        })
        .catch(() => undefined);
      // Tear the subscription down so the user reconnects rather than
      // sitting in a half-broken state where push is silently dead.
      await this.subscriptions
        .deleteSubscription(subscriptionId)
        .catch((delErr) =>
          this.logger.warn(
            `Tear-down after failed renewal also failed for ${subscriptionId}: ${describeErr(delErr)}`
          )
        );
      return false;
    }
  }
}

function describeErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
