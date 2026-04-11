## ADDED Requirements

### Requirement: Legacy Office format conversion via OnlyOffice

The system SHALL convert legacy Office files (DOC, XLS, PPT) to their modern equivalents (DOCX, XLSX, PPTX) using the OnlyOffice Conversion API before processing them through existing parsers. The conversion SHALL be transparent to the rest of the ingestion pipeline.

#### Scenario: Successful DOC to DOCX conversion

- **WHEN** a `.doc` file is discovered during file ingestion and `ONLYOFFICE_URL` is configured
- **THEN** the system converts it to DOCX via the OnlyOffice API, parses the converted file with the existing DOCX parser, and indexes the content with `lang: "doc"` and conversion metadata in `extra_json`

#### Scenario: Successful XLS to XLSX conversion

- **WHEN** a `.xls` file is discovered during file ingestion and `ONLYOFFICE_URL` is configured
- **THEN** the system converts it to XLSX via the OnlyOffice API, parses the converted file with the existing XLSX parser, and indexes the content with `lang: "xls"` and conversion metadata in `extra_json`

#### Scenario: Successful PPT to PPTX conversion

- **WHEN** a `.ppt` file is discovered during file ingestion and `ONLYOFFICE_URL` is configured
- **THEN** the system converts it to PPTX via the OnlyOffice API, parses the converted file with the existing PPTX parser, and indexes the content with `lang: "ppt"` and conversion metadata in `extra_json`

### Requirement: Ephemeral file serving for conversion

The system SHALL temporarily serve the source file over HTTP on `127.0.0.1` using a random port so the OnlyOffice server can fetch it. The server SHALL be shut down immediately after the conversion completes or fails.

#### Scenario: File served and cleaned up

- **WHEN** a legacy Office file is being converted
- **THEN** an HTTP server starts on `127.0.0.1` with a random port, serves the file at a path containing a random token, and shuts down after the OnlyOffice API responds

#### Scenario: Server cleanup on conversion failure

- **WHEN** the OnlyOffice API returns an error or times out
- **THEN** the ephemeral HTTP server is shut down and the temp converted file (if any) is deleted

### Requirement: OnlyOffice configuration

The system SHALL support the following configuration for OnlyOffice integration:

- `ONLYOFFICE_URL`: Base URL of the OnlyOffice Document Server (required to enable legacy format support)
- `ONLYOFFICE_JWT_SECRET`: JWT signing secret for authenticated requests (optional)
- `ONLYOFFICE_TIMEOUT`: Conversion timeout in milliseconds (optional, default: 30000)

#### Scenario: OnlyOffice not configured

- **WHEN** `ONLYOFFICE_URL` is not set and a legacy Office file is encountered
- **THEN** the system logs a warning that the file is skipped because OnlyOffice is not configured, and continues processing other files

#### Scenario: OnlyOffice configured with JWT

- **WHEN** `ONLYOFFICE_URL` and `ONLYOFFICE_JWT_SECRET` are both set
- **THEN** conversion requests SHALL include a JWT token signed with the secret using HMAC-SHA256

#### Scenario: OnlyOffice configured without JWT

- **WHEN** `ONLYOFFICE_URL` is set but `ONLYOFFICE_JWT_SECRET` is not
- **THEN** conversion requests SHALL be sent without a token field

### Requirement: Conversion error handling

The system SHALL handle conversion errors gracefully without stopping the ingestion pipeline.

#### Scenario: OnlyOffice server unreachable

- **WHEN** the OnlyOffice server at `ONLYOFFICE_URL` cannot be reached
- **THEN** the system logs an error with the file path and server URL, skips the file, and continues

#### Scenario: Conversion returns an error code

- **WHEN** the OnlyOffice API responds with an error (e.g., -3 conversion error, -4 download error)
- **THEN** the system logs the error code and file path, skips the file, and continues

#### Scenario: Conversion times out

- **WHEN** the conversion does not complete within `ONLYOFFICE_TIMEOUT` milliseconds
- **THEN** the system logs a timeout warning, cleans up resources, skips the file, and continues

### Requirement: Temporary file management

The system SHALL write converted files to the OS temp directory and clean them up after parsing completes.

#### Scenario: Temp file cleanup after successful parse

- **WHEN** a legacy file is successfully converted and parsed
- **THEN** the temporary converted file is deleted from the temp directory

#### Scenario: Temp file cleanup after parse failure

- **WHEN** parsing the converted file fails
- **THEN** the temporary converted file is still deleted from the temp directory
