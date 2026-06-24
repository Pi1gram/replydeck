import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProvider
} from "./embedding-provider.interface";

/**
 * Real embeddings via the OpenAI embeddings API (text-embedding-3-small),
 * requesting reduced `dimensions` so vectors match EMBEDDING_DIMENSIONS and
 * stay cheap to store/compare. Uses fetch directly — no SDK dependency.
 *
 * text-embedding-3-small is ~$0.02 / 1M tokens; a user's whole memory set plus
 * one query embedding per draft is fractions of a cent. See the cost section of
 * docs/KNOWLEDGE_BASE_RESEARCH.md.
 */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai:text-embedding-3-small";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(
    private readonly apiKey: string,
    private readonly model = "text-embedding-3-small"
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `OpenAI embeddings failed: ${res.status} ${res.statusText} ${body}`
      );
    }
    const json = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };
    // Sort by index to guarantee input-order alignment.
    return json.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

export { EMBEDDING_DIMENSIONS };
