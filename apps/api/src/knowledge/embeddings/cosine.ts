/**
 * Pure vector math for semantic retrieval. No deps, fully unit-testable.
 *
 * Embeddings are ranked app-side over a per-user candidate set (already
 * filtered by userId, ~tens of items at Early/Growth scale). This avoids
 * pgvector infrastructure until per-user item counts justify it — see
 * docs/KNOWLEDGE_BASE_RESEARCH.md (Phase 3 swaps this for a pgvector index).
 */

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity in [-1, 1]. Returns 0 if either vector is empty/zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  const denom = norm(a) * norm(b);
  if (denom === 0) return 0;
  return dot(a, b) / denom;
}

export interface Embeddable {
  embedding: number[];
}

/**
 * Rank items by cosine similarity to a query vector, most similar first.
 * Items without a usable embedding (empty or wrong-dimension) are dropped.
 * Stable: ties keep input order.
 */
export function rankBySimilarity<T extends Embeddable>(
  query: number[],
  items: T[],
  k: number
): Array<T & { score: number }> {
  if (query.length === 0) return [];
  return items
    .map((item, index) => ({
      item,
      index,
      score:
        item.embedding.length === query.length
          ? cosineSimilarity(query, item.embedding)
          : Number.NEGATIVE_INFINITY
    }))
    .filter((r) => r.score > Number.NEGATIVE_INFINITY)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, k)
    .map((r) => ({ ...r.item, score: r.score }));
}
