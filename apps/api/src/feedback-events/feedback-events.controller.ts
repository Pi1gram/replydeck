import { Controller, Get, Query } from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload
} from "../common/current-user.decorator";
import { FeedbackEventsService } from "./feedback-events.service";

@Controller("feedback-events")
export class FeedbackEventsController {
  constructor(private readonly service: FeedbackEventsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query("limit") limit?: string
  ) {
    const parsed = limit ? Number.parseInt(limit, 10) : undefined;
    return this.service.list(
      user.id,
      Number.isFinite(parsed) ? parsed : undefined
    );
  }
}
