import {
  cosineSimilarity,
  rankBySimilarity
} from "../src/knowledge/embeddings/cosine";
import { MockEmbeddingProvider } from "../src/knowledge/embeddings/mock-embedding.provider";
import { EMBEDDING_DIMENSIONS } from "../src/knowledge/embeddings/embedding-provider.interface";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 for empty, zero, or mismatched-length vectors", () => {
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe("rankBySimilarity", () => {
  const items = [
    { id: "a", embedding: [1, 0] },
    { id: "b", embedding: [0, 1] },
    { id: "c", embedding: [0.9, 0.1] }
  ];

  it("orders by similarity to the query, most similar first", () => {
    const ranked = rankBySimilarity([1, 0], items, 3);
    expect(ranked.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("respects the k limit", () => {
    expect(rankBySimilarity([1, 0], items, 1)).toHaveLength(1);
  });

  it("drops items whose embedding dimension does not match the query", () => {
    const mixed = [
      { id: "ok", embedding: [1, 0] },
      { id: "bad", embedding: [] },
      { id: "bad2", embedding: [1, 0, 0] }
    ];
    const ranked = rankBySimilarity([1, 0], mixed, 5);
    expect(ranked.map((r) => r.id)).toEqual(["ok"]);
  });

  it("returns nothing for an empty query vector", () => {
    expect(rankBySimilarity([], items, 3)).toEqual([]);
  });
});

describe("MockEmbeddingProvider", () => {
  const provider = new MockEmbeddingProvider();

  it("is deterministic and emits the configured dimension", async () => {
    const [a] = await provider.embed(["hello there friend"]);
    const [b] = await provider.embed(["hello there friend"]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("scores texts sharing words as more similar than unrelated ones", async () => {
    const [q, related, unrelated] = await provider.embed([
      "quarterly budget report for the finance team",
      "the finance team budget report is attached",
      "let us grab coffee and watch the football"
    ]);
    expect(cosineSimilarity(q, related)).toBeGreaterThan(
      cosineSimilarity(q, unrelated)
    );
  });

  it("returns a zero-length-safe vector for empty text", async () => {
    const [v] = await provider.embed([""]);
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(v.every((x) => x === 0)).toBe(true);
  });
});
