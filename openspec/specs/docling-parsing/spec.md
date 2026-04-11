## ADDED Requirements

### Requirement: Docling document conversion via REST API

The system SHALL convert documents by uploading files to a `docling-serve` REST endpoint and receiving parsed text in Markdown format.

#### Scenario: Successful PDF conversion with OCR

- **WHEN** a PDF file is submitted to the Docling parser
- **THEN** the system uploads the file to `POST {DOCLING_URL}/v1/convert/file`, receives Markdown output, and returns the extracted text with metadata

#### Scenario: Successful office document conversion

- **WHEN** a DOCX, XLSX, or PPTX file is submitted to the Docling parser
- **THEN** the system uploads the file to docling-serve and returns the extracted Markdown text with format metadata

### Requirement: Docling URL configuration

The system SHALL require a `DOCLING_URL` environment variable when `DOCUMENT_PARSER` is set to `docling`.

#### Scenario: Docling URL configured correctly

- **WHEN** `DOCUMENT_PARSER=docling` and `DOCLING_URL=http://localhost:5001`
- **THEN** the Docling parser connects to the specified endpoint for document conversion

#### Scenario: Docling URL missing

- **WHEN** `DOCUMENT_PARSER=docling` and `DOCLING_URL` is not set
- **THEN** the system SHALL throw a configuration error at startup with a message indicating that `DOCLING_URL` is required

### Requirement: Docling error handling

The system SHALL handle docling-serve errors gracefully without crashing the ingestion pipeline.

#### Scenario: Docling server unreachable

- **WHEN** a file is submitted for parsing and the docling-serve endpoint is unreachable
- **THEN** the system SHALL log a warning and skip the file, continuing with remaining files

#### Scenario: Docling conversion fails for a specific file

- **WHEN** docling-serve returns an error for a specific file
- **THEN** the system SHALL log a warning with the file path and error details, skip the file, and continue processing

### Requirement: Docling output fed to existing chunking pipeline

The system SHALL pass Docling's Markdown output through the existing `chunkDoc()` chunking strategy.

#### Scenario: Docling output is chunked as documentation

- **WHEN** Docling returns Markdown text for any document type
- **THEN** the system passes the text to `chunkDoc()` for chunking, preserving the existing chunk size and overlap settings

### Requirement: Unsupported format fallback

The system SHALL fall back to built-in parsing for file types that Docling does not support (audio, video, images, code files) even when `DOCUMENT_PARSER=docling`.

#### Scenario: Audio file with Docling parser selected

- **WHEN** `DOCUMENT_PARSER=docling` and an MP3 file is being ingested
- **THEN** the system uses the built-in audio parser and Whisper transcription, not Docling
