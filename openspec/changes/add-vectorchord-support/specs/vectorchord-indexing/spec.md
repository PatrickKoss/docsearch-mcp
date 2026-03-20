## ADDED Requirements

### Requirement: VectorChord adapter extends PostgreSQL adapter

The system SHALL provide a `VectorChordAdapter` class that extends `PostgresAdapter` and implements the `DatabaseAdapter` interface. The adapter MUST use the `vchord` PostgreSQL extension and the `vchordrq` index type for vector similarity search.

#### Scenario: VectorChord adapter creates correct schema

- **WHEN** the `VectorChordAdapter.init()` method is called
- **THEN** the adapter SHALL execute `CREATE EXTENSION IF NOT EXISTS vchord CASCADE` to enable both vchord and pgvector extensions, and create the same tables as `PostgresAdapter` (documents, chunks, chunk_embeddings, meta)

#### Scenario: VectorChord adapter creates vchordrq index

- **WHEN** embeddings are inserted and `ensureVectorIndex()` is triggered
- **THEN** the adapter SHALL create an index using `CREATE INDEX ... USING vchordrq (embedding vector_cosine_ops)` with the configured options (residual_quantization, lists, spherical_centroids, build_threads)

#### Scenario: VectorChord adapter inherits all data operations

- **WHEN** any document, chunk, metadata, or search operation is invoked on the adapter
- **THEN** the adapter SHALL delegate to the parent `PostgresAdapter` implementation without modification, since VectorChord uses pgvector-compatible SQL syntax

### Requirement: VectorChord configuration via environment variables

The system SHALL support VectorChord-specific configuration through environment variables with sensible defaults.

#### Scenario: Default configuration values

- **WHEN** no VectorChord-specific environment variables are set and `DB_TYPE=vectorchord`
- **THEN** the adapter SHALL use defaults: residual_quantization=true, lists=100, spherical_centroids=true, build_threads=4, probes=10

#### Scenario: Custom configuration values

- **WHEN** environment variables `VECTORCHORD_RESIDUAL_QUANTIZATION`, `VECTORCHORD_LISTS`, `VECTORCHORD_SPHERICAL_CENTROIDS`, `VECTORCHORD_BUILD_THREADS`, `VECTORCHORD_PROBES` are set
- **THEN** the adapter SHALL use the provided values for index creation and search operations

### Requirement: VectorChord search probes configuration

The system SHALL set `vchordrq.probes` before vector search queries to control recall precision.

#### Scenario: Probes set during vector search

- **WHEN** a vector search is executed on the VectorChord adapter
- **THEN** the adapter SHALL execute `SET LOCAL vchordrq.probes` with the configured probes value before the search query

### Requirement: Factory supports vectorchord DB type

The `createDatabaseAdapter` factory function SHALL support `'vectorchord'` as a valid `DB_TYPE` value.

#### Scenario: Factory creates VectorChord adapter

- **WHEN** `DB_TYPE` is set to `'vectorchord'`
- **THEN** the factory SHALL create and return a `VectorChordAdapter` instance configured with the PostgreSQL connection string and VectorChord-specific options

#### Scenario: Existing DB types unchanged

- **WHEN** `DB_TYPE` is set to `'sqlite'` or `'postgresql'`
- **THEN** the factory SHALL continue to return `SqliteAdapter` or `PostgresAdapter` respectively, with no behavior changes

### Requirement: Config validation for vectorchord type

The config module SHALL recognize `'vectorchord'` as a valid database type.

#### Scenario: Config validates vectorchord DB type

- **WHEN** `DB_TYPE=vectorchord` is set in environment
- **THEN** the `validateDatabaseType` function SHALL return `'vectorchord'` as a valid type

#### Scenario: VectorChord config fields present in AppConfig

- **WHEN** the config is initialized
- **THEN** `AppConfig` SHALL include fields for `VECTORCHORD_RESIDUAL_QUANTIZATION`, `VECTORCHORD_LISTS`, `VECTORCHORD_SPHERICAL_CENTROIDS`, `VECTORCHORD_BUILD_THREADS`, and `VECTORCHORD_PROBES` with their default values
