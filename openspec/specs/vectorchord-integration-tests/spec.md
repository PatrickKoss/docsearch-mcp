## ADDED Requirements

### Requirement: Integration tests with testcontainers

The system SHALL include integration tests for the `VectorChordAdapter` using testcontainers with the `tensorchord/vchord-suite` Docker image to validate all adapter operations against a real PostgreSQL+VectorChord instance.

#### Scenario: Container setup with VectorChord extension

- **WHEN** the integration test suite starts
- **THEN** a PostgreSQL container with VectorChord SHALL be started using `tensorchord/vchord-suite:pg17-latest` via testcontainers, and the `VectorChordAdapter` SHALL be initialized against it

#### Scenario: Document operations work with VectorChord

- **WHEN** document upsert, retrieval, and update operations are executed against the VectorChord adapter
- **THEN** all operations SHALL succeed and return correct results, matching the behavior of the PostgreSQL adapter

#### Scenario: Chunk operations work with VectorChord

- **WHEN** chunk insert, retrieval, update, and delete operations are executed
- **THEN** all operations SHALL succeed and chunks SHALL be correctly associated with their documents

#### Scenario: Embedding insertion creates vchordrq index

- **WHEN** embeddings are inserted into the VectorChord adapter
- **THEN** a `vchordrq` index SHALL be created on the `chunk_embeddings` table and the index SHALL be usable for search

#### Scenario: Vector search returns ranked results

- **WHEN** a vector search query is executed with test embeddings
- **THEN** results SHALL be returned ordered by cosine distance and SHALL contain correct document metadata

#### Scenario: Keyword search works with VectorChord backend

- **WHEN** a keyword search is executed against the VectorChord adapter
- **THEN** results SHALL be returned using PostgreSQL's tsvector/tsquery ranking, matching the PostgresAdapter behavior

#### Scenario: Filtered search works with VectorChord

- **WHEN** vector or keyword search is executed with source, repo, or pathPrefix filters
- **THEN** results SHALL be correctly filtered and only matching documents SHALL be returned

#### Scenario: Cleanup operations work with VectorChord

- **WHEN** document chunks and embeddings are cleaned up
- **THEN** all associated chunks, embeddings, and vector index entries SHALL be removed

### Requirement: Unit tests for VectorChord-specific logic

The system SHALL include unit tests for VectorChord adapter logic that does not require a running database.

#### Scenario: Index SQL generation with default config

- **WHEN** the VectorChord adapter generates index creation SQL with default configuration
- **THEN** the SQL SHALL include `USING vchordrq`, `vector_cosine_ops`, `residual_quantization = true`, `lists = [100]`, `spherical_centroids = true`, and `build_threads = 4`

#### Scenario: Index SQL generation with custom config

- **WHEN** the VectorChord adapter generates index creation SQL with custom configuration values
- **THEN** the SQL SHALL reflect the provided custom values for all configurable parameters

### Requirement: Adapter comparison tests

The system SHALL include tests that compare behavior between `PostgresAdapter` and `VectorChordAdapter` to ensure compatibility.

#### Scenario: Same operations produce equivalent results

- **WHEN** identical document, chunk, embedding, and search operations are executed against both `PostgresAdapter` and `VectorChordAdapter`
- **THEN** both adapters SHALL produce functionally equivalent results (document IDs, chunk content, search result ordering may differ in exact scores but SHALL return the same matched documents)
