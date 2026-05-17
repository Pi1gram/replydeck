import { Module } from "@nestjs/common";
import { FeedbackEventsController } from "./feedback-events.controller";
import { FeedbackEventsService } from "./feedback-events.service";

@Module({
  controllers: [FeedbackEventsController],
  providers: [FeedbackEventsService]
})
export class FeedbackEventsModule {}
