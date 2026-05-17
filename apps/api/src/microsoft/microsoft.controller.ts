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
}
