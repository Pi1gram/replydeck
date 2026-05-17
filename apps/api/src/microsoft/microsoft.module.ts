import { Module } from "@nestjs/common";
import { GraphClient } from "./graph-client";
import { MicrosoftConfig } from "./microsoft.config";
import { MicrosoftController } from "./microsoft.controller";
import { MicrosoftService } from "./microsoft.service";

@Module({
  controllers: [MicrosoftController],
  providers: [MicrosoftService, GraphClient, MicrosoftConfig],
  exports: [MicrosoftService, GraphClient, MicrosoftConfig]
})
export class MicrosoftModule {}
