## ADDED Requirements

### Requirement: EPUB content extraction

The system SHALL extract chapter content from EPUB files. Each chapter's HTML SHALL be converted to plain text. The system SHALL store EPUB metadata (title, author, language, chapter count) in `extra_json`.

#### Scenario: Successful EPUB ingestion

- **WHEN** an EPUB file is present in a configured FILE_ROOT
- **THEN** the system extracts chapter content, chunks it using `chunkEpub()`, generates embeddings, and stores the document with `lang: "epub"` and metadata in `extra_json`

#### Scenario: EPUB with metadata

- **WHEN** an EPUB file contains title, author, and language metadata
- **THEN** the system stores all available metadata in `extra_json` and uses the EPUB title as the document title

### Requirement: Chapter-aware chunking

The system SHALL implement a `chunkEpub()` function that respects chapter boundaries. Chunks SHALL NOT span across chapters. Each chunk SHALL include the chapter title/number in its metadata.

#### Scenario: Short chapters

- **WHEN** a chapter's text is shorter than the maximum chunk size
- **THEN** the entire chapter becomes a single chunk

#### Scenario: Long chapters

- **WHEN** a chapter's text exceeds the maximum chunk size
- **THEN** the chapter is split into multiple chunks using paragraph boundaries, with overlap between chunks

#### Scenario: Empty chapters

- **WHEN** a chapter contains no extractable text
- **THEN** the chapter is skipped and no chunk is created for it

### Requirement: EPUB error handling

The system SHALL gracefully handle corrupted or invalid EPUB files.

#### Scenario: Corrupted EPUB file

- **WHEN** an EPUB file cannot be parsed
- **THEN** the system logs an error, skips the file, and continues processing remaining files

#### Scenario: EPUB with no chapters

- **WHEN** an EPUB file has metadata but no extractable chapter content
- **THEN** the system creates a document record with zero chunks and logs a warning

### Requirement: Dynamic loading of EPUB library

The system SHALL dynamically import the EPUB parsing library only when processing EPUB files.

#### Scenario: No EPUB files to process

- **WHEN** a file ingestion run encounters no EPUB files
- **THEN** the EPUB parsing library is never loaded

### Requirement: EPUB file type classification

The system SHALL recognize `.epub` file extensions and route them to the EPUB parser.

#### Scenario: EPUB file in FILE_ROOT

- **WHEN** a file with `.epub` extension is found during scanning
- **THEN** it is classified and routed to the EPUB parser
