## 1. Configuration Updates

- [x] 1.1 Add `'vectorchord'` to the `DatabaseType` union in `src/shared/config.ts` and update `validateDatabaseType()` to accept it
- [x] 1.2 Add VectorChord-specific config fields to `AppConfig` interface: `VECTORCHORD_RESIDUAL_QUANTIZATION` (boolean, default true), `VECTORCHORD_LISTS` (number, default 100), `VECTORCHORD_SPHERICAL_CENTROIDS` (boolean, default true), `VECTORCHORD_BUILD_THREADS` (number, default 4), `VECTORCHORD_PROBES` (number, default 10)
- [x] 1.3 Add VectorChord config initialization in `initializeConfig()` reading from environment variables
- [x] 1.4 Update `.env.example` with VectorChord configuration options and comments (MANUAL: hook blocks .env file access)

## 2. VectorChord Adapter Implementation

- [x] 2.1 Create `src/ingest/adapters/vectorchord.ts` with `VectorChordAdapter` class extending `PostgresAdapter`
- [x] 2.2 Define `VectorChordConfig` interface extending `PostgresConfig` with VectorChord-specific options (residualQuantization, lists, sphericalCentroids, buildThreads, probes)
- [x] 2.3 Override `ensureSchema()` to use `CREATE EXTENSION IF NOT EXISTS vchord CASCADE` instead of `CREATE EXTENSION IF NOT EXISTS vector`
- [x] 2.4 Override `ensureVectorIndex()` to create `vchordrq` index with configurable options (residual_quantization, lists, spherical_centroids, build_threads) using the `WITH (options = $$...$$)` syntax
- [x] 2.5 Override `vectorSearch()` to execute `SET LOCAL vchordrq.probes` before the search query, then delegate to the parent's search logic
- [x] 2.6 Add a method to generate the vchordrq index options SQL string from config values

## 3. Factory and Wiring

- [x] 3.1 Update `DatabaseType` union in `src/ingest/adapters/factory.ts` to include `'vectorchord'`
- [x] 3.2 Add `vectorchord` case to `createDatabaseAdapter()` factory function that creates `VectorChordAdapter` with merged PostgreSQL + VectorChord config from CONFIG
- [x] 3.3 Add `VectorChordConfig` to `DatabaseFactoryConfig` interface

## 4. Make PostgresAdapter Methods Overridable

- [x] 4.1 Change `ensureSchema()` from `private` to `protected` in `PostgresAdapter` so `VectorChordAdapter` can override it
- [x] 4.2 Change `ensureVectorIndex()` from `private` to `protected` in `PostgresAdapter` so `VectorChordAdapter` can override it
- [x] 4.3 Change `client` from `private` to `protected` in `PostgresAdapter` so subclass can access the database connection

## 5. Unit Tests

- [x] 5.1 Create `test/adapters/vectorchord.test.ts` with unit tests for VectorChord adapter construction and config handling
- [x] 5.2 Add tests for index SQL generation with default config values
- [x] 5.3 Add tests for index SQL generation with custom config values
- [x] 5.4 Add tests for config validation accepting `'vectorchord'` as a valid DB_TYPE
- [x] 5.5 Add tests for factory creating VectorChordAdapter when DB_TYPE=vectorchord

## 6. Integration Tests

- [x] 6.1 Create `test/integrations/vectorchord.test.ts` with testcontainers setup using `tensorchord/vchord-suite:pg17-latest` Docker image
- [x] 6.2 Add integration tests for document operations (upsert, retrieve, update)
- [x] 6.3 Add integration tests for chunk operations (insert, retrieve, update, delete)
- [x] 6.4 Add integration tests for embedding insertion and vchordrq index creation verification
- [x] 6.5 Add integration tests for vector search with ranked results
- [x] 6.6 Add integration tests for keyword search
- [x] 6.7 Add integration tests for filtered search (source, repo, pathPrefix)
- [x] 6.8 Add integration tests for cleanup operations (document chunks and embeddings)
- [x] 6.9 Add integration tests for metadata operations
- [x] 6.10 Add adapter comparison test verifying VectorChordAdapter and PostgresAdapter produce equivalent results for identical operations

## 7. Documentation and Finalization

- [x] 7.1 Update CLAUDE.md with VectorChord configuration section in the Configuration area
- [x] 7.2 Run `make lint` and fix any linting issues
- [x] 7.3 Run `make typecheck` and fix any type errors
- [x] 7.4 Run `make test-unit` and verify all unit tests pass
- [x] 7.5 Run `make test-integration` and verify all integration tests pass (requires Docker)
