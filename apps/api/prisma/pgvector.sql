CREATE EXTENSION IF NOT EXISTS vector;

-- Prisma stores embedding JSON for compatibility.
-- For production vector search, add a native vector column and sync it:
ALTER TABLE "DocumentChunk"
ADD COLUMN IF NOT EXISTS embedding_vector vector(768);

CREATE INDEX IF NOT EXISTS document_chunk_embedding_idx
ON "DocumentChunk"
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);
