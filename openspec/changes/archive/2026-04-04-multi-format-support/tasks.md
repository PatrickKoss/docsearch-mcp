## 1. Dependencies and Configuration

- [x] 1.1 Add npm dependencies: `mammoth`, `xlsx`, `epub2`, `music-metadata`
- [x] 1.2 Add config variables to `src/shared/config.ts`: `ENABLE_AUDIO_TRANSCRIPTION`, `WHISPER_API_KEY`, `WHISPER_BASE_URL`, `WHISPER_MODEL`
- [x] 1.3 Update `.env.example` with new config variables and comments (BLOCKED by hook - user must update manually)
- [x] 1.4 Add new file extension sets (`OFFICE_EXT`, `EPUB_EXT`, `AUDIO_EXT`, `VIDEO_EXT`) to `src/ingest/sources/files.ts`

## 2. Office Document Parsing

- [x] 2.1 Create `src/ingest/parsers/office.ts` with `parseDocx()`, `parseXlsx()`, `parsePptx()` functions using dynamic imports
- [x] 2.2 Implement DOCX text extraction with mammoth (text output, metadata extraction)
- [x] 2.3 Implement XLSX text extraction with xlsx (sheet iteration, row cap at 10k, sheet cap at 100)
- [x] 2.4 Implement PPTX text extraction (slide text with slide number prefixes)
- [x] 2.5 Wire office parsers into `files.ts` ingestion flow with proper routing by extension
- [x] 2.6 Wire office parsers into `files-incremental.ts` ingestion flow

## 3. EPUB Parsing

- [x] 3.1 Create `src/ingest/parsers/epub.ts` with `parseEpub()` function using dynamic import of epub2
- [x] 3.2 Implement chapter HTML-to-text conversion (reuse Turndown or simple HTML stripping)
- [x] 3.3 Implement `chunkEpub()` in `src/ingest/chunker.ts` with chapter-boundary-aware chunking
- [x] 3.4 Extract and store EPUB metadata (title, author, language, chapter count) in extra_json
- [x] 3.5 Wire EPUB parser into `files.ts` and `files-incremental.ts` ingestion flows

## 4. Audio/Video Transcription

- [x] 4.1 Create `src/ingest/parsers/audio-video.ts` with metadata extraction using music-metadata (dynamic import)
- [x] 4.2 Implement Whisper API transcription client in `src/ingest/parsers/whisper.ts` with retry logic and file size check (25MB limit)
- [x] 4.3 Implement `chunkTranscript()` in `src/ingest/chunker.ts` with timestamp-aware chunking
- [x] 4.4 Wire audio/video parser into `files.ts` ingestion flow (metadata-only when transcription disabled, full transcript when enabled)
- [x] 4.5 Wire audio/video parser into `files-incremental.ts` ingestion flow

## 5. Format-Aware Search Output

- [x] 5.1 Update `src/cli/adapters/output/text-formatter.ts` to display format metadata (timestamps, chapters, sheet names)
- [x] 5.2 Update `src/cli/adapters/output/json-formatter.ts` to include extra_json metadata in output
- [x] 5.3 Update `src/cli/adapters/output/yaml-formatter.ts` to include extra_json metadata in output
- [x] 5.4 Update `src/server/mcp.ts` search tool response to include format-specific metadata

## 6. Unit Tests

- [x] 6.1 Create test fixtures: minimal DOCX, XLSX, PPTX files (or mock the library calls)
- [x] 6.2 Write unit tests for `parseDocx()` (success, empty doc, corrupted file)
- [x] 6.3 Write unit tests for `parseXlsx()` (success, multiple sheets, exceeds limits)
- [x] 6.4 Write unit tests for `parsePptx()` (success, no text, slides)
- [x] 6.5 Create test fixtures or mocks for EPUB parsing
- [x] 6.6 Write unit tests for `parseEpub()` (success, metadata, corrupted, no chapters)
- [x] 6.7 Write unit tests for `chunkEpub()` (short chapters, long chapters, empty chapters)
- [x] 6.8 Write unit tests for audio/video metadata extraction (MP3 with ID3 tags, video with minimal metadata)
- [x] 6.9 Write unit tests for Whisper transcription client (success, API failure, file too large)
- [x] 6.10 Write unit tests for `chunkTranscript()` (short transcript, long transcript, timestamp preservation)
- [x] 6.11 Write unit tests for updated output formatters (text, JSON, YAML with new format metadata)

## 7. Integration Tests

- [x] 7.1 Write integration test: ingest DOCX file and search for its content
- [x] 7.2 Write integration test: ingest XLSX file and search for cell content
- [x] 7.3 Write integration test: ingest EPUB file and search across chapters
- [x] 7.4 Write integration test: ingest audio file with transcription mock and search transcript
- [x] 7.5 Write integration test: mixed format ingestion (code + docs + office + epub + audio) and cross-format search
- [x] 7.6 Write integration test: incremental indexing with new file formats (add, modify, delete)

## 8. Documentation and Cleanup

- [x] 8.1 Update README.md with new format support section, configuration variables, and examples
- [x] 8.2 Update CLAUDE.md with new file types, parsers, and architecture notes
- [x] 8.3 Run `make check-all` and fix any lint, type, or test failures
