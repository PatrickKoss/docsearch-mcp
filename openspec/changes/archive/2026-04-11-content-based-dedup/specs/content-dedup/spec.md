## ADDED Requirements

### Requirement: Detect file moves by content hash

The system SHALL detect when a file has been moved or renamed by comparing its content hash against existing documents in the database. When a document with the same hash but a different URI exists, the system SHALL treat this as a file move rather than a new file.

#### Scenario: File renamed in same directory

- **WHEN** a file at `docs/api.md` is renamed to `docs/api-reference.md` and both have identical content
- **THEN** the system SHALL update the existing document's URI from `file:///docs/api.md` to `file:///docs/api-reference.md` without reindexing chunks or regenerating embeddings

#### Scenario: File moved to different directory

- **WHEN** a file at `docs/guide.md` is moved to `archive/guide.md` with no content changes
- **THEN** the system SHALL update the existing document's URI and path metadata to reflect the new location, preserving all existing chunks and embeddings

#### Scenario: File content changed and moved simultaneously

- **WHEN** a file is moved to a new path AND its content has changed (different hash)
- **THEN** the system SHALL treat it as a new file and index it normally, since the hash will not match any existing document

### Requirement: Preserve chunks and embeddings on move

The system SHALL NOT delete or regenerate chunks, FTS entries, or vector embeddings when a file move is detected. Only the document metadata (URI, path, title, mtime) SHALL be updated.

#### Scenario: Embedding reuse after move

- **WHEN** a file move is detected via content hash match
- **THEN** the existing chunk records and their associated vector embeddings SHALL remain unchanged in the database

#### Scenario: No embedding API calls on move

- **WHEN** a file is moved and detected via hash match
- **THEN** zero embedding API calls SHALL be made for that document

### Requirement: Hash-based document lookup

The system SHALL provide a `getDocumentByHash` method on the `DatabaseAdapter` interface that returns an existing document matching a given content hash, or null if no match exists.

#### Scenario: Lookup returns matching document

- **WHEN** a document with hash `abc123` exists in the database
- **THEN** `getDocumentByHash("abc123")` SHALL return the document's id, hash, and uri

#### Scenario: Lookup returns null for no match

- **WHEN** no document with hash `xyz789` exists in the database
- **THEN** `getDocumentByHash("xyz789")` SHALL return null

### Requirement: Database index on content hash

The system SHALL maintain an index on the `documents.hash` column to ensure efficient hash-based lookups.

#### Scenario: Index creation on schema initialization

- **WHEN** the database schema is initialized or migrated
- **THEN** an index on `documents.hash` SHALL exist (created via `CREATE INDEX IF NOT EXISTS`)

### Requirement: Update document URI on move detection

The system SHALL provide an `updateDocumentUri` method on the `DatabaseAdapter` interface that updates a document's URI, path, title, and mtime fields.

#### Scenario: URI update preserves document identity

- **WHEN** `updateDocumentUri` is called with a document ID and new metadata
- **THEN** the document row SHALL be updated in-place, preserving the same `id` and all associated chunks

### Requirement: Handle duplicate content across intentional copies

The system SHALL only perform hash-based move detection when no document exists for the current URI. If a document already exists at the current URI, the system SHALL use the existing URI-based logic regardless of hash matches elsewhere.

#### Scenario: Same file at two paths

- **WHEN** `docs/template.md` and `examples/template.md` have identical content and both paths are ingested
- **THEN** each SHALL be indexed as a separate document, since each URI lookup finds its own existing entry

### Requirement: Update stored content key on URI change

When a document's URI is updated due to move detection, the system SHALL rename the stored content entry in the meta table from the old URI key to the new URI key.

#### Scenario: Content key renamed after move

- **WHEN** a document is moved from URI `file:///old/path.md` to `file:///new/path.md`
- **THEN** the meta table entry `content:file:///old/path.md` SHALL be renamed to `content:file:///new/path.md`

### Requirement: Stale document cleanup

After processing all files in a file root, the system SHALL remove documents from the database whose URIs match the file root prefix but were not present in the current ingestion batch.

#### Scenario: Deleted file is cleaned up

- **WHEN** a file `docs/old.md` existed in a previous ingestion but no longer exists on disk
- **THEN** the document entry and all associated chunks and embeddings for `file:///docs/old.md` SHALL be removed from the database

#### Scenario: Moved file does not leave orphan

- **WHEN** a file is moved from `docs/api.md` to `docs/api-reference.md` and move detection updates the URI
- **THEN** no orphaned document entry SHALL remain for the old path `file:///docs/api.md`
