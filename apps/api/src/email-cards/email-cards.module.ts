import { Module } from "@nestjs/common";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { EmailCardsController } from "./email-cards.controller";
import { EmailCardsService } from "./email-cards.service";

@Module({
  imports: [MicrosoftModule],
  controllers: [EmailCardsController],
  providers: [EmailCardsService],
  exports: [EmailCardsService]
})
export class EmailCardsModule {}
