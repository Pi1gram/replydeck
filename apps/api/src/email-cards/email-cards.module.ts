import { Module, forwardRef } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { LearningModule } from "../learning/learning.module";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { EmailCardsController } from "./email-cards.controller";
import { EmailCardsService } from "./email-cards.service";

@Module({
  imports: [forwardRef(() => MicrosoftModule), AiModule, LearningModule],
  controllers: [EmailCardsController],
  providers: [EmailCardsService],
  exports: [EmailCardsService]
})
export class EmailCardsModule {}
