import {
  DynamicModule,
  Logger,
  Module,
  OnModuleInit,
  Optional,
  forwardRef
} from "@nestjs/common";
import { BullModule, InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { AiModule } from "../ai/ai.module";
import { EmailCardsModule } from "../email-cards/email-cards.module";
import { PushModule } from "../push/push.module";
import { GraphClient } from "./graph-client";
import { GraphSubscriptionsService } from "./graph-subscriptions.service";
import { GraphSyncProcessor } from "./graph-sync.processor";
import { GraphWebhooksController } from "./graph-webhooks.controller";
import { MicrosoftConfig } from "./microsoft.config";
import { MicrosoftController } from "./microsoft.controller";
import { MicrosoftService } from "./microsoft.service";
import { SubscriptionRenewerProcessor } from "./subscription-renewer.processor";
import {
  GRAPH_SYNC_QUEUE,
  SUBSCRIPTION_RENEWAL_CRON_JOB_ID,
  SUBSCRIPTION_RENEWAL_QUEUE
} from "./graph-queues";

/**
 * Microsoft Graph module — OAuth, inbox sync, AND now push subscriptions.
 *
 * BullMQ wiring is conditional on REDIS_URL being set. In dev (or test)
 * without Redis we still load the rest of the module so OAuth + sync
 * continue to work; the webhook controller falls back to logging when
 * the sync queue is missing. See QUEUE_LOGGER below.
 */
const QUEUE_LOGGER = new Logger("MicrosoftModule.queues");

function isQueuesEnabled(): boolean {
  return (
    typeof process.env.REDIS_URL === "string" &&
    process.env.REDIS_URL.trim().length > 0
  );
}

@Module({
  imports: [
    AiModule,
    PushModule,
    forwardRef(() => EmailCardsModule),
    ...(isQueuesEnabled()
      ? [
          BullModule.registerQueue(
            { name: GRAPH_SYNC_QUEUE },
            { name: SUBSCRIPTION_RENEWAL_QUEUE }
          )
        ]
      : [])
  ],
  controllers: [MicrosoftController, GraphWebhooksController],
  providers: [
    MicrosoftService,
    GraphClient,
    MicrosoftConfig,
    GraphSubscriptionsService,
    ...(isQueuesEnabled()
      ? [GraphSyncProcessor, SubscriptionRenewerProcessor]
      : [])
  ],
  exports: [
    MicrosoftService,
    GraphClient,
    MicrosoftConfig,
    GraphSubscriptionsService
  ]
})
export class MicrosoftModule implements OnModuleInit {
  constructor(
    @Optional()
    @InjectQueue(SUBSCRIPTION_RENEWAL_QUEUE)
    private readonly renewalQueue?: Queue
  ) {}

  static forFeature(): DynamicModule {
    // Reserved for future test overrides.
    return { module: MicrosoftModule };
  }

  async onModuleInit(): Promise<void> {
    if (!isQueuesEnabled()) {
      QUEUE_LOGGER.warn(
        "REDIS_URL is not set — BullMQ queues skipped. Graph push notifications " +
          "will be received but not processed, and subscription renewal will not run. " +
          "Set REDIS_URL=redis://localhost:6379 to enable."
      );
      return;
    }
    if (!this.renewalQueue) {
      QUEUE_LOGGER.warn(
        "Renewal queue not bound despite REDIS_URL — skipping cron registration."
      );
      return;
    }
    try {
      // Re-add is idempotent for the same jobId — BullMQ overwrites the
      // existing repeatable entry rather than spawning a duplicate.
      await this.renewalQueue.add(
        "subscription-renewal-tick",
        {},
        {
          jobId: SUBSCRIPTION_RENEWAL_CRON_JOB_ID,
          repeat: { every: 6 * 60 * 60 * 1000 }, // 6 hours
          removeOnComplete: 50,
          removeOnFail: 50
        }
      );
      QUEUE_LOGGER.log(
        `Subscription renewal cron registered (every 6h, jobId=${SUBSCRIPTION_RENEWAL_CRON_JOB_ID}).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      QUEUE_LOGGER.warn(
        `Failed to register subscription renewal cron: ${msg}. ` +
          "Renewals will not run automatically until this is resolved."
      );
    }
  }
}
