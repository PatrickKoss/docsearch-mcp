## Context

Documents are uniquely identified by URI (`file://{absolute_path}`). The `documents` table has a unique constraint on `uri`, and all lookups during ingestion use URI as the key. The content hash (SHA-256) is stored but only used to detect content changes, not to identify documents across path changes.

When a file moves from `/docs/api.md` to `/docs/api-reference.md`, the system creates a new document entry, generates new chunks and embeddings, and leaves the old entry orphaned. This wastes embedding API calls and pollutes search results with stale entries.

## Goals / Non-Goals

**Goals:**

- Detect when a file has been moved/renamed by matching content hash, and update the existing document's URI/path instead of creating a duplicate.
- Avoid regenerating embeddings for moved files since their content hasn't changed.
- Clean up stale document entries for files that no longer exist at their indexed paths.

**Non-Goals:**

- Detecting partial moves (file split into two, or two files merged into one).
- Handling content changes that happen simultaneously with a move (treated as delete + new file).
- Adding a separate content-addressable storage layer or changing the hash algorithm from SHA-256.

## Decisions

### 1. Hash-based lookup before URI-based lookup during ingestion

Add a `getDocumentByHash(hash: string)` method to the `DatabaseAdapter` interface. During incremental indexing, the flow becomes:

1. Compute content hash of the file being ingested.
2. Look up existing document by URI (current behavior).
3. If no match by URI, look up by content hash.
4. If a hash match is found with a different URI, update that document's URI and path metadata in-place.
5. If no match at all, create a new document (current behavior).

**Why over alternatives:** Adding a secondary lookup is minimal and non-breaking. An alternative was making `hash` the primary key, but that would break the data model for cases where the same content exists at multiple intentional locations (e.g., symlinks, template files).

### 2. Update URI in-place rather than delete-and-recreate

When a move is detected, update the document row's `uri`, `path`, `title`, and `mtime` fields. The existing chunks and embeddings remain untouched since the content hash matches.

**Why:** This preserves chunk IDs, embedding vectors, and FTS entries without any reprocessing.

### 3. Handle hash collisions (same content, multiple files)

If multiple documents match the same hash, pick the first match. The remaining copies are treated as new documents. This is a pragmatic choice since true duplicates are uncommon and the cost of indexing one extra copy is low.

### 4. Stale document cleanup during file ingestion

After processing all files in a file root, collect the set of URIs that were just ingested and delete any documents in the database whose URI starts with the file root prefix but wasn't in the ingested set. This handles files that were deleted or moved away.

**Why over alternatives:** This is simpler than tracking individual file deletions via filesystem events and works correctly for both full and incremental ingestion modes.

### 5. Update stored content key when URI changes

The incremental indexer stores file content in the `meta` table keyed by `content:{uri}`. When a document's URI is updated due to a move, the old content key must be renamed to match the new URI.

## Risks / Trade-offs

- **[Hash collision across different files]** Two genuinely different files with the same SHA-256 hash would be incorrectly treated as a move. Probability is astronomically low. No mitigation needed.
- **[Same content at multiple paths]** If a user intentionally has the same file at two paths, the first ingestion creates the document and the second would detect it as a "move". Mitigation: only match by hash when no document exists for the current URI, so both copies get indexed independently if ingested in the same batch.
- **[Performance of hash lookup]** Adding a secondary query per new file. Mitigation: add an index on `documents.hash` column. The lookup is only performed when URI lookup returns no match, so existing files with unchanged paths have zero overhead.
- **[Migration]** Adding an index on `hash` requires a schema migration. Mitigation: use `CREATE INDEX IF NOT EXISTS`, which is safe for existing databases.
