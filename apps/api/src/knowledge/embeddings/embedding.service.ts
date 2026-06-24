import { Inject, Injectable, Logger } from "@nestjs/common";
import { EmbeddingProvider } from "./embedding-provider.interface";

export const EMBEDDING_PROVIDER_TOKEN = "EMBEDDING_PROVIDER";

/**
 * Thin orchestration over the active embedding provider. Exposes the model
 * name (stored alongside vectors so we can detect drift) and the vector
 * dimension, plus single/batch embed helpers.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER_TOKEN)
    private readonly provider: EmbeddingProvider
  ) {
    this.logger.log(
      `EmbeddingService initialised with provider=${provider.name}, dim=${provider.dimensions}`
    );
  }

  get model(): string {
    return this.provider.name;
  }

  get dimensions(): number {
    return this.provider.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.provider.embed([text]);
    return vec ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.provider.embed(texts);
  }
}
