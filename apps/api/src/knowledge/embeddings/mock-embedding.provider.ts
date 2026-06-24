import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProvider
} from "./embedding-provider.interface";

/**
 * Deterministic, dependency-free embeddings via the hashing trick (feature
 * hashing). Same text always yields the same vector, and texts sharing words
 * yield similar vectors — so semantic-retrieval logic and its tests behave
 * meaningfully without any API key or network call.
 *
 * Not a real semantic model: it captures lexical overlap only. Production uses
 * a real provider (see OpenAiEmbeddingProvider).
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => featureHash(t, this.dimensions));
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

// djb2 — small, fast, deterministic across processes.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function featureHash(text: string, dim: number): number[] {
  const v = new Array<number>(dim).fill(0);
  for (const token of tokenize(text)) {
    const idx = hashString(token) % dim;
    const sign = hashString(`${token}#sign`) % 2 === 0 ? 1 : -1;
    v[idx] += sign;
  }
  // L2-normalise so cosine == dot and magnitudes are comparable.
  let mag = 0;
  for (const x of v) mag += x * x;
  mag = Math.sqrt(mag);
  if (mag === 0) return v;
  return v.map((x) => x / mag);
}
