## ADDED Requirements

### Requirement: Format metadata in search results

The system SHALL include format-specific metadata in search results when available. For office documents: page/sheet/slide count. For EPUB: chapter info. For audio/video: duration, timestamps, artist/album.

#### Scenario: Search result from DOCX

- **WHEN** a search result matches a chunk from a DOCX file
- **THEN** the result includes `lang: "docx"` and any available document metadata from `extra_json`

#### Scenario: Search result from audio transcript

- **WHEN** a search result matches a chunk from an audio file transcript
- **THEN** the result includes the time range (start/end timestamps) for that chunk, plus media metadata (duration, artist, album)

#### Scenario: Search result from EPUB

- **WHEN** a search result matches a chunk from an EPUB file
- **THEN** the result includes the chapter name/number for that chunk

### Requirement: CLI text output format for new types

The system SHALL display format-specific metadata in CLI text output. Audio/video results SHALL show timestamps in `HH:MM:SS` format. EPUB results SHALL show the chapter name.

#### Scenario: Audio result in CLI text output

- **WHEN** a search result from an audio transcript is displayed in text format
- **THEN** the output includes a line like `Timestamp: 00:02:30 - 00:03:15` and media info like `Duration: 00:45:00`

#### Scenario: EPUB result in CLI text output

- **WHEN** a search result from an EPUB is displayed in text format
- **THEN** the output includes a line like `Chapter: Chapter 3 - The Beginning`

### Requirement: JSON/YAML output includes format metadata

The system SHALL include format-specific metadata fields in JSON and YAML search output under an `extra` or `metadata` key.

#### Scenario: JSON output for office document result

- **WHEN** search results are requested in JSON format and include an XLSX result
- **THEN** the JSON includes `extra_json` fields such as `sheetCount` and `rowCount`

#### Scenario: YAML output for audio result

- **WHEN** search results are requested in YAML format and include an audio result
- **THEN** the YAML includes metadata fields like `duration`, `artist`, `album`, and chunk-level `startTime`/`endTime`

### Requirement: MCP tool output includes format metadata

The system SHALL include format-specific metadata in MCP `doc-search` tool responses. The metadata SHALL be included in the result content alongside the snippet.

#### Scenario: MCP search returning audio transcript result

- **WHEN** the MCP `doc-search` tool returns a result from a transcribed audio file
- **THEN** the response includes timestamp and media metadata in the result content

#### Scenario: MCP search returning EPUB result

- **WHEN** the MCP `doc-search` tool returns a result from an EPUB file
- **THEN** the response includes chapter information in the result content
