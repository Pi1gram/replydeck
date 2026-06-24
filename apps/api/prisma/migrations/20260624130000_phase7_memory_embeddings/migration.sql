-- Phase 7.2 — semantic retrieval. Store an embedding vector + its source model
-- on each memory item. Ranked app-side over the per-user candidate set at
-- Early/Growth scale; a pgvector index is the documented Phase 3 swap.

ALTER TABLE "MemoryItem"
  ADD COLUMN "embedding" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::double precision[],
  ADD COLUMN "embeddingModel" TEXT;
