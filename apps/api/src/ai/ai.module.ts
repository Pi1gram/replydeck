import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaModule } from "../common/prisma.module";
import { EmbeddingsModule } from "../knowledge/embeddings/embeddings.module";
import { AiContextLoader } from "./ai-context-loader.service";
import { AiService, AI_PROVIDER_TOKEN, aiProviderFactory } from "./ai.service";
import { MockProvider } from "./providers/mock.provider";

@Module({
  imports: [PrismaModule, EmbeddingsModule],
  providers: [
    MockProvider,
    {
      provide: AI_PROVIDER_TOKEN,
      inject: [ConfigService, MockProvider],
      useFactory: aiProviderFactory
    },
    AiService,
    AiContextLoader
  ],
  exports: [AiService, AiContextLoader]
})
export class AiModule {}
