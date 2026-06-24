import { Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload
} from "../common/current-user.decorator";
import { MicrosoftService } from "./microsoft.service";

@Controller("outlook")
export class MicrosoftController {
  constructor(private readonly service: MicrosoftService) {}

  /**
   * Pull recent inbox messages and create EmailCard rows for any not yet seen.
   * Idempotent — re-running over the same window only creates new rows.
   */
  /**
   * Connection + scope health. `needsReconnect: true` means the user granted
   * access before a scope we now require (e.g. calendar) — prompt them to
   * reconnect.
   */
  @Get("status")
  status(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getConnectionStatus(user.id);
  }

  @Post("sync")
  @HttpCode(200)
  async sync(
    @CurrentUser() user: CurrentUserPayload,
    @Query("top") topRaw?: string
  ) {
    const top = topRaw ? Math.max(1, Math.min(50, Number(topRaw) || 10)) : 10;
    return this.service.syncRecentInboxToCards(user.id, top);
  }

  /**
   * Dev passthrough for inspecting what Graph returns. Does NOT persist
   * anything. Phase 4 may remove this once the queue is fully API-driven.
   */
  @Get("messages/recent")
  recent(
    @CurrentUser() user: CurrentUserPayload,
    @Query("top") topRaw?: string
  ) {
    const top = topRaw ? Math.max(1, Math.min(50, Number(topRaw) || 10)) : 10;
    return this.service.getRecentMessages(user.id, top);
  }

  /**
   * Dev / ops endpoint: delete the user's existing Graph push subscription
   * (if any) and immediately create a fresh one.
   *
   * Use this to (re)activate real-time webhook delivery without going through
   * the full OAuth reconnect flow — handy after a tunnel URL change or when
   * the subscription has expired.
   *
   * POST /outlook/resubscribe
   * Response 200: { ok: true, subscriptionId: "..." }
   * Response 200: { ok: false, error: "..." }  (non-fatal failure)
   */
  @Post("resubscribe")
  @HttpCode(200)
  async resubscribe(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ ok: true; subscriptionId: string } | { ok: false; error: string }> {
    try {
      const result = await this.service.resubscribeForUser(user.id);
      return { ok: true, subscriptionId: result.subscriptionId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error };
    }
  }
}
