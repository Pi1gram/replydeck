import { selectMemoryItems } from "../src/ai/ai-context-loader.service";

type Cand = {
  id: string;
  scope: "USER" | "SENDER" | "THREAD" | "COMPANY";
  content: string;
  embedding: number[];
};

const cand = (
  id: string,
  embedding: number[],
  scope: Cand["scope"] = "USER"
): Cand => ({ id, scope, content: `memory ${id}`, embedding });

describe("selectMemoryItems (hybrid retrieval)", () => {
  it("ranks semantically-similar memory first when a query vector is present", () => {
    const candidates = [
      cand("recent-irrelevant", [0, 1]),
      cand("old-relevant", [1, 0])
    ];
    const out = selectMemoryItems(candidates, [1, 0]);
    expect(out[0].content).toBe("memory old-relevant");
  });

  it("tops up with recency for not-yet-embedded items, no duplicates", () => {
    const candidates = [
      cand("fresh-no-vec", []), // newest, not embedded yet
      cand("relevant", [1, 0])
    ];
    const out = selectMemoryItems(candidates, [1, 0]);
    const contents = out.map((m) => m.content);
    expect(contents).toContain("memory relevant"); // semantic hit
    expect(contents).toContain("memory fresh-no-vec"); // recency top-up
    expect(new Set(contents).size).toBe(contents.length); // no dupes
  });

  it("falls back to pure recency order when no query vector is available", () => {
    const candidates = [
      cand("first", [1, 0]),
      cand("second", [0, 1])
    ];
    const out = selectMemoryItems(candidates, []);
    expect(out.map((m) => m.content)).toEqual([
      "memory first",
      "memory second"
    ]);
  });

  it("caps the returned set at the context limit (8)", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      cand(`m${i}`, [Math.random(), Math.random()])
    );
    expect(selectMemoryItems(candidates, [1, 0]).length).toBe(8);
  });
});
