/**
 * Embedding provider abstraction — mirrors the AiProvider pattern so dev/test
 * run on a free deterministic mock and production swaps in a real provider via
 * env, with no call-site changes.
 *
 * All providers MUST emit vectors of `dimensions` length so app-side cosine
 * ranking can compare them. Changing the dimension requires re-embedding
 * stored items.
 */
export const EMBEDDING_DIMENSIONS = 256;

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  /** Embed a batch of texts. Returns one vector per input, in order. */
  embed(texts: string[]): Promise<number[][]>;
}
