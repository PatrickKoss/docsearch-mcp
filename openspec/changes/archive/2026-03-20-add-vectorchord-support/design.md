## Context

The project has a well-designed `DatabaseAdapter` interface with two implementations: `SqliteAdapter` (using sqlite-vec) and `PostgresAdapter` (using pgvector with IVFFlat indexing). The adapter pattern, factory, and configuration are already in place. VectorChord is a PostgreSQL extension that is fully pgvector-compatible (same `vector` data type, same `<=>` cosine operator) but offers a superior index type `vchordrq` using RaBitQ compression. Since the SQL for data operations is identical, the main difference is in extension setup and index creation/configuration.

The current `PostgresAdapter` uses:

- `CREATE EXTENSION IF NOT EXISTS vector` for pgvector
- `CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops)` for vector indexing
- `<=>` operator for cosine distance queries

VectorChord uses:

- `CREATE EXTENSION IF NOT EXISTS vchord CASCADE` (which auto-creates the vector extension)
- `CREATE INDEX ... USING vchordrq (embedding vector_cosine_ops) WITH (options = $$...$$)` for vector indexing
- Same `<=>` operator for cosine distance queries (fully compatible)

## Goals / Non-Goals

**Goals:**

- Add VectorChord as an optional vector index backend for PostgreSQL, selectable via configuration
- Expose key VectorChord tuning parameters (residual quantization, lists, build threads, spherical centroids, probes) as environment variables
- Maintain full backward compatibility: `DB_TYPE=postgresql` continues to use pgvector/IVFFlat unchanged
- Provide comprehensive integration tests with testcontainers using the `tensorchord/vchord-suite` Docker image
- Provide unit tests for the VectorChord-specific logic (config parsing, index SQL generation)

**Non-Goals:**

- Replacing pgvector as the default PostgreSQL vector backend
- Supporting VectorChord-specific data types (rabitq4, rabitq8, halfvec) in this change
- Multi-vector (maxsim) search support
- Connection pooling or multi-client PostgreSQL support
- Benchmarking VectorChord vs pgvector performance (left to users)

## Decisions

### 1. Subclass PostgresAdapter rather than create a separate adapter

**Decision**: Create `VectorChordAdapter extends PostgresAdapter` that overrides only `ensureSchema()` and `ensureVectorIndex()`.

**Rationale**: All data operations (insert, query, search) use identical SQL. The only differences are the extension name and index type. Inheritance avoids duplicating ~400 lines of identical code. The override surface is small (2 methods) and well-defined.

**Alternative considered**: Standalone adapter implementing `DatabaseAdapter` from scratch. Rejected because it would duplicate all document/chunk/metadata operations identically.

### 2. Add `vectorchord` as a new DB_TYPE value

**Decision**: Add `'vectorchord'` to the `DatabaseType` union in `config.ts` and `factory.ts`. When `DB_TYPE=vectorchord`, the factory creates a `VectorChordAdapter` which extends `PostgresAdapter`.

**Rationale**: Clean separation at the config level. Users explicitly opt in. The factory pattern already supports this cleanly.

**Alternative considered**: Adding a `POSTGRES_VECTOR_INDEX_TYPE` config to the existing `postgresql` DB_TYPE. Rejected because it creates ambiguity and couples VectorChord config into the base adapter.

### 3. VectorChord configuration via environment variables

**Decision**: Expose these env vars with sensible defaults:

- `VECTORCHORD_RESIDUAL_QUANTIZATION` (boolean, default: `true`) - improves accuracy
- `VECTORCHORD_LISTS` (number, default: `100`) - number of IVF partitions
- `VECTORCHORD_SPHERICAL_CENTROIDS` (boolean, default: `true`) - recommended for cosine similarity
- `VECTORCHORD_BUILD_THREADS` (number, default: `4`) - parallelism for index building
- `VECTORCHORD_PROBES` (number, default: `10`) - search-time probe count for recall/speed tradeoff

**Rationale**: These are the most impactful tuning knobs. Defaults are chosen for good recall with cosine similarity (our search mode). Advanced users can tune for their dataset size.

### 4. Set vchordrq.probes at query time

**Decision**: Before each vector search, execute `SET LOCAL vchordrq.probes = N` within the query to control search precision.

**Rationale**: VectorChord's recall is directly controlled by the probes parameter. Setting it per-query (via `SET LOCAL`) avoids global session state issues and lets us tune it via config.

### 5. Integration tests use `tensorchord/vchord-suite` Docker image

**Decision**: Use `tensorchord/vchord-suite:pg17-latest` which bundles PostgreSQL + pgvector + VectorChord in one image.

**Rationale**: Single image simplifies testcontainers setup. The `vchord-suite` image is the officially recommended all-in-one image from TensorChord.

## Risks / Trade-offs

**[Risk] VectorChord Docker image availability** → The `tensorchord/vchord-suite` image may change tags or become unavailable. Mitigation: Pin to a specific version tag in tests, document the requirement.

**[Risk] VectorChord extension not installed in user's PostgreSQL** → Users who set `DB_TYPE=vectorchord` but don't have the extension will get a clear error at `init()` time from `CREATE EXTENSION IF NOT EXISTS vchord`. Mitigation: Good error message suggesting they install the extension or use the Docker image.

**[Risk] Index build time on large datasets** → `vchordrq` index creation can be slow for very large datasets (though faster than IVFFlat). Mitigation: Index creation is lazy (same pattern as current adapter), only triggered after embeddings exist.

**[Trade-off] Inheritance coupling** → `VectorChordAdapter` is coupled to `PostgresAdapter` internals. If `PostgresAdapter` changes significantly, the subclass may break. Mitigation: The override surface is small (2 protected methods) and well-tested.
