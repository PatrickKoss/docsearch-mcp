## 1. Database Schema & Adapter Interface

- [x] 1.1 Add `CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash)` to schema initialization in `src/ingest/db.ts`
- [x] 1.2 Add `getDocumentByHash(hash: string)` method to `DatabaseAdapter` interface in `src/ingest/adapters/types.ts`, returning `{ id: number; hash: string; uri: string } | null`
- [x] 1.3 Add `updateDocumentUri(id: number, uri: string, path: string, title: string, mtime: number)` method to `DatabaseAdapter` interface in `src/ingest/adapters/types.ts`
- [x] 1.4 Add `deleteDocumentsByUris(uris: string[])` method to `DatabaseAdapter` interface for stale document cleanup

## 2. SQLite Adapter Implementation

- [x] 2.1 Implement `getDocumentByHash` in `src/ingest/adapters/sqlite.ts` with a prepared statement selecting by hash (limit 1)
- [x] 2.2 Implement `updateDocumentUri` in `src/ingest/adapters/sqlite.ts` to update uri, path, title, and mtime fields
- [x] 2.3 Implement `deleteDocumentsByUris` in `src/ingest/adapters/sqlite.ts`

## 3. PostgreSQL Adapter Implementation

- [x] 3.1 Add hash index to PostgreSQL schema initialization in `src/ingest/adapters/postgresql.ts`
- [x] 3.2 Implement `getDocumentByHash` in `src/ingest/adapters/postgresql.ts`
- [x] 3.3 Implement `updateDocumentUri` in `src/ingest/adapters/postgresql.ts`
- [x] 3.4 Implement `deleteDocumentsByUris` in `src/ingest/adapters/postgresql.ts`

## 4. Incremental Indexer Move Detection

- [x] 4.1 Update `IncrementalIndexer.indexFileIncremental` to perform hash-based lookup when URI lookup returns no match
- [x] 4.2 When hash match found, call `updateDocumentUri` to update the document's metadata in-place
- [x] 4.3 When hash match found, rename the stored content key in meta table from old URI to new URI
- [x] 4.4 Return `IncrementalIndexResult` with zero chunk changes when a move is detected

## 5. Stale Document Cleanup

- [x] 5.1 After file ingestion in `src/ingest/sources/files.ts`, collect all ingested URIs and delete stale documents that match the file root prefix but are not in the ingested set
- [x] 5.2 After file ingestion in `src/ingest/sources/files-incremental.ts`, apply the same stale cleanup logic

## 6. Tests

- [x] 6.1 Add unit tests for `getDocumentByHash` in SQLite adapter (match found, no match)
- [x] 6.2 Add unit tests for `updateDocumentUri` in SQLite adapter
- [x] 6.3 Add unit test for move detection flow in `IncrementalIndexer`: file moved, hash matches, URI updated, no reindexing
- [x] 6.4 Add unit test for intentional duplicates: same content at two paths indexed independently
- [x] 6.5 Add unit test for stale document cleanup after ingestion
- [x] 6.6 Add unit test for content key rename in meta table on move detection
