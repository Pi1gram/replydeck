import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, forwardRef } from "@nestjs/common";
import type { Job } from "bullmq";
import { MicrosoftService } from "./microsoft.service";
import { GRAPH_SYNC_QUEUE } from "./graph-queues";

/**
 * BullMQ worker that turns a Graph push notification into an actual
 * inbox sync.
 *
 * The webhook controller enqueues one job per affected user with a
 * 5-second dedup window so a burst of N notifications collapses to one
 * sync run. This worker calls MicrosoftService.syncRecentInboxToCards
 * which walks the recent inbox, dedupes by providerMessageId, drafts
 * with AI, and (where applicable) auto-sends Category C replies.
 */
@Processor(GRAPH_SYNC_QUEUE)
export class GraphSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GraphSyncProcessor.name);

  constructor(
    @Inject(forwardRef(() => MicrosoftService))
    private readonly microsoft: MicrosoftService
  ) {
    super();
  }

  async process(
    job: Job<{ userId: string }>
  ): Promise<{ created: number; skipped: number; autoSent: number }> {
    const { userId } = job.data;
    if (!userId) {
      this.logger.warn("graph-sync job missing userId — skipping");
      return { created: 0, skipped: 0, autoSent: 0 };
    }
    try {
      const result = await this.microsoft.syncRecentInboxToCards(userId, 10);
      this.logger.log(
        `graph-sync user=${userId} created=${result.created.length} skipped=${result.skipped} autoSent=${result.autoSent}`
      );
      return {
        created: result.created.length,
        skipped: result.skipped,
        autoSent: result.autoSent
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`graph-sync user=${userId} failed: ${msg}`);
      throw err; // let BullMQ retry per queue config
    }
  }
}
