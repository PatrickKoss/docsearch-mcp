## Why

The current PostgreSQL adapter uses pgvector with IVFFlat indexing, which has known limitations at scale: slow index builds, suboptimal recall on large datasets, and no support for advanced quantization. VectorChord is a drop-in pgvector-compatible PostgreSQL extension that uses RaBitQ compression and hierarchical K-means to deliver significantly faster indexing (100M vectors in ~20 minutes), lower storage costs, and better recall. Since VectorChord is wire-compatible with pgvector, we can add it as an optional enhancement to the existing PostgreSQL adapter without breaking changes.

## What Changes

- Add a new `VectorChordAdapter` that extends the PostgreSQL adapter with VectorChord-specific index types (`vchordrq`) and configuration options
- Introduce a `POSTGRES_VECTOR_INDEX_TYPE` config option (`ivfflat` | `hnsw` | `vchordrq`) to select the vector index strategy, defaulting to `ivfflat` for backward compatibility
- Add VectorChord-specific index configuration (residual quantization, clustering options) exposed via environment variables
- Add `vectorchord` as an optional DB_TYPE value that auto-selects the VectorChord index type on PostgreSQL
- Add unit tests for the VectorChord adapter logic (index creation, config handling)
- Add integration tests using testcontainers with the `tensorchord/vchord-suite` Docker image

## Capabilities

### New Capabilities

- `vectorchord-indexing`: VectorChord-based vector index management, including vchordrq index creation, configuration, and lifecycle within the PostgreSQL adapter
- `vectorchord-integration-tests`: Integration test suite using testcontainers to validate VectorChord adapter against a real PostgreSQL+VectorChord instance

### Modified Capabilities

## Impact

- **Code**: New adapter file `src/ingest/adapters/vectorchord.ts`, modifications to `factory.ts` and `config.ts`
- **Dependencies**: No new runtime npm dependencies (VectorChord uses pgvector wire format; `pg` and `pgvector/pg` already in use). Test dependency on `tensorchord/vchord-suite` Docker image
- **Config**: New env vars `POSTGRES_VECTOR_INDEX_TYPE`, optional VectorChord tuning params
- **APIs**: No changes to the `DatabaseAdapter` interface or any public API
- **Breaking changes**: None. Existing `DB_TYPE=postgresql` behavior is unchanged. VectorChord is opt-in
