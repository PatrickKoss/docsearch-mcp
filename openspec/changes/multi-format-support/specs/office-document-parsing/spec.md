## ADDED Requirements

### Requirement: DOCX text extraction

The system SHALL extract plain text content from DOCX files using the `mammoth` library. The extracted text SHALL preserve paragraph structure and headings. The system SHALL store document metadata (title, author, word count) in `extra_json`.

#### Scenario: Successful DOCX ingestion

- **WHEN** a DOCX file is present in a configured FILE_ROOT
- **THEN** the system extracts text content, chunks it using `chunkDoc()`, generates embeddings, and stores the document with `lang: "docx"` and metadata in `extra_json`

#### Scenario: Empty DOCX file

- **WHEN** a DOCX file contains no text content
- **THEN** the system creates a document record with zero chunks and logs a warning

#### Scenario: Corrupted DOCX file

- **WHEN** a DOCX file cannot be parsed by mammoth
- **THEN** the system logs an error, skips the file, and continues processing remaining files

### Requirement: XLSX text extraction

The system SHALL extract cell text content from XLSX files using the `xlsx` library. The system SHALL concatenate cell values per sheet, prefixing each sheet's content with the sheet name. The system SHALL cap extraction at 100 sheets and 10,000 rows per sheet.

#### Scenario: Successful XLSX ingestion

- **WHEN** an XLSX file is present in a configured FILE_ROOT
- **THEN** the system extracts text from all sheets (up to limits), chunks it using `chunkDoc()`, and stores the document with `lang: "xlsx"` and sheet metadata in `extra_json`

#### Scenario: XLSX with multiple sheets

- **WHEN** an XLSX file contains multiple sheets
- **THEN** each sheet's content is prefixed with `"Sheet: <name>\n"` before chunking

#### Scenario: XLSX exceeds extraction limits

- **WHEN** an XLSX file has more than 100 sheets or a sheet has more than 10,000 rows
- **THEN** the system truncates at the limit, logs a warning with the file path, and continues

### Requirement: PPTX text extraction

The system SHALL extract text content from PPTX files. The system SHALL extract text from each slide and prefix with the slide number.

#### Scenario: Successful PPTX ingestion

- **WHEN** a PPTX file is present in a configured FILE_ROOT
- **THEN** the system extracts slide text, chunks it using `chunkDoc()`, and stores the document with `lang: "pptx"` and slide count in `extra_json`

#### Scenario: PPTX with no text content

- **WHEN** a PPTX file contains only images/charts with no extractable text
- **THEN** the system creates a document record with zero chunks and logs a warning

### Requirement: Dynamic loading of office parsing libraries

The system SHALL dynamically import `mammoth` and `xlsx` only when processing their respective file types, following the existing pattern used for `pdf-parse`.

#### Scenario: No office files to process

- **WHEN** a file ingestion run encounters no DOCX, XLSX, or PPTX files
- **THEN** the `mammoth` and `xlsx` libraries are never loaded

### Requirement: Office file type classification

The system SHALL recognize DOCX (`.docx`), XLSX (`.xlsx`), and PPTX (`.pptx`) file extensions and route them to the appropriate parser.

#### Scenario: Mixed file types in FILE_ROOT

- **WHEN** a FILE_ROOT contains code, docs, PDFs, and office files
- **THEN** each file type is routed to its correct parser (code chunker, doc chunker, PDF parser, office parser)
