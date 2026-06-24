import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmbeddingProvider } from "./embedding-provider.interface";
import {
  EmbeddingService,
  EMBEDDING_PROVIDER_TOKEN
} from "./embedding.service";
import { MockEmbeddingProvider } from "./mock-embedding.provider";
import { OpenAiEmbeddingProvider } from "./openai-embedding.provider";

const logger = new Logger("EmbeddingsModule");

/**
 * Picks the embedding provider from env, mirroring aiProviderFactory:
 *   EMBEDDING_PROVIDER=openai + OPENAI_API_KEY  -> real provider
 *   otherwise (default)                          -> deterministic mock
 */
export function embeddingProviderFactory(
  config: ConfigService
): EmbeddingProvider {
  const choice = (config.get<string>("EMBEDDING_PROVIDER") ?? "").toLowerCase();
  const apiKey =
    config.get<string>("EMBEDDING_API_KEY") ??
    config.get<string>("OPENAI_API_KEY") ??
    "";

  if (choice === "openai" && apiKey) {
    logger.log("Using OpenAI embedding provider");
    return new OpenAiEmbeddingProvider(apiKey);
  }
  if (choice === "openai" && !apiKey) {
    logger.warn(
      "EMBEDDING_PROVIDER=openai but no OPENAI_API_KEY/EMBEDDING_API_KEY — falling back to mock"
    );
  }
  return new MockEmbeddingProvider();
}

@Module({
  providers: [
    {
      provide: EMBEDDING_PROVIDER_TOKEN,
      inject: [ConfigService],
      useFactory: embeddingProviderFactory
    },
    EmbeddingService
  ],
  exports: [EmbeddingService]
})
export class EmbeddingsModule {}
