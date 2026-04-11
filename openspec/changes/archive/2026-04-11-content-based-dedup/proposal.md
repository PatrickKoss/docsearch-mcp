## Why

When a file is moved or renamed, the system treats it as a brand-new document because documents are keyed by URI (`file://{absolute_path}`). This causes full reindexing of content that hasn't changed, wasting embedding API calls, and leaves orphaned duplicate entries in the database under the old path.

## What Changes

- Introduce content-hash-based deduplication so that when a file is moved/renamed, the system detects matching content and reuses existing chunks and embeddings instead of reindexing from scratch.
- When a moved file is detected (same hash, different URI), update the document's URI and path metadata in-place rather than creating a new document.
- Clean up orphaned documents whose files no longer exist at the indexed path during ingestion.

## Capabilities

### New Capabilities

- `content-dedup`: Content-hash-based document deduplication that detects file moves/renames and avoids redundant reindexing by matching on content hash instead of file path.

### Modified Capabilities

## Impact

- **Database layer** (`src/ingest/db.ts`, `src/ingest/adapters/sqlite.ts`, `src/ingest/adapters/postgresql.ts`): Document lookup and upsert logic needs to support hash-based matching alongside URI-based matching.
- **Indexer** (`src/ingest/indexer.ts`, `src/ingest/incremental-indexer.ts`): Ingestion flow must check for existing documents by content hash before creating new entries.
- **File sources** (`src/ingest/sources/files.ts`, `src/ingest/sources/files-incremental.ts`): Stale document cleanup after ingestion to remove entries for paths that no longer exist.
- **Embeddings cost**: Moved/renamed files will no longer trigger embedding generation, reducing API usage.
