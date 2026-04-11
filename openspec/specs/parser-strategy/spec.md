## ADDED Requirements

### Requirement: DocumentParser strategy interface

The system SHALL define a `DocumentParser` interface with a `parse` method that accepts a file path, file buffer, and file extension, and returns parsed text content with metadata.

#### Scenario: Interface contract

- **WHEN** any `DocumentParser` implementation's `parse` method is called with a valid file
- **THEN** it returns an object containing `text` (string), `metadata` (record with format-specific info), and `contentType` (string indicating the output format, e.g., 'markdown', 'text')

### Requirement: Built-in parser implementation

The system SHALL provide a `BuiltinParser` implementation of `DocumentParser` that wraps the existing parsing logic (pdf-parse, mammoth, xlsx, jszip, epub2, audio/video parsers).

#### Scenario: Built-in parser handles PDF

- **WHEN** `BuiltinParser.parse()` is called with a `.pdf` file
- **THEN** it uses `pdf-parse` to extract text and returns the result in the `DocumentParser` return format

#### Scenario: Built-in parser handles DOCX

- **WHEN** `BuiltinParser.parse()` is called with a `.docx` file
- **THEN** it uses `mammoth` to extract text and returns the result in the `DocumentParser` return format

### Requirement: Parser selection via configuration

The system SHALL select the `DocumentParser` implementation based on the `DOCUMENT_PARSER` environment variable.

#### Scenario: Default parser selection

- **WHEN** `DOCUMENT_PARSER` is not set
- **THEN** the system uses the `BuiltinParser` implementation

#### Scenario: Explicit builtin selection

- **WHEN** `DOCUMENT_PARSER=builtin`
- **THEN** the system uses the `BuiltinParser` implementation

#### Scenario: Docling selection

- **WHEN** `DOCUMENT_PARSER=docling`
- **THEN** the system uses the `DoclingParser` implementation

### Requirement: Parser factory function

The system SHALL provide a `getDocumentParser()` factory function that returns the configured `DocumentParser` instance.

#### Scenario: Factory returns correct implementation

- **WHEN** `getDocumentParser()` is called
- **THEN** it reads `DOCUMENT_PARSER` from config and returns the matching implementation

### Requirement: Parser integration in ingestion pipeline

The system SHALL use the configured `DocumentParser` in the file ingestion pipeline for content extraction, replacing direct parser library calls.

#### Scenario: Ingestion uses configured parser

- **WHEN** a file is being ingested and the parser strategy is set
- **THEN** the ingestion pipeline calls `parser.parse()` instead of directly calling format-specific libraries
