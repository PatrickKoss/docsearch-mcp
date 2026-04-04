## Context

docsearch-mcp currently supports code files, plain-text documentation, PDFs, and images. The ingestion pipeline in `src/ingest/sources/files.ts` classifies files by extension into `CODE_EXT`, `DOC_EXT`, and `IMAGE_EXT` sets, then routes them to the appropriate chunker (`chunkCode`, `chunkDoc`, `chunkPdf`). Each file becomes a `documents` row with associated `chunks` rows. Embeddings are generated in batches via OpenAI or TEI.

The system needs to support office documents (DOCX, XLSX, PPTX), ebooks (EPUB), and audio/video files. These formats require new parsing libraries and, for audio/video, an external transcription API.

## Goals / Non-Goals

**Goals:**

- Extract searchable text from DOCX, XLSX, PPTX, EPUB, and audio/video files
- Preserve format-specific metadata (chapters, timestamps, slide numbers, sheet names)
- Plug into the existing ingestion pipeline with no schema changes
- Make all new parsers optional (graceful skip if a file can't be parsed)
- Expose format metadata in search results across CLI, JSON, YAML, and MCP outputs
- Comprehensive test coverage for all new parsers and chunkers

**Non-Goals:**

- Building a GUI/web UI for search results (future work)
- OCR for scanned PDFs or images within office documents
- Real-time streaming transcription
- Supporting legacy binary formats (DOC, XLS, PPT, RTF)
- Thumbnail/preview generation for any format

## Decisions

### 1. Office document parsing libraries

**Decision**: Use `mammoth` for DOCX, `xlsx` (SheetJS) for XLSX and PPTX.

**Rationale**: `mammoth` produces clean text/HTML from DOCX without needing LibreOffice. `xlsx` is the most mature Node.js library for spreadsheet formats and also handles PPTX (which is XML-based). Both are pure JavaScript with no native dependencies, keeping the install simple.

**Alternatives considered**:

- `libreoffice --headless` conversion: Heavy dependency, slow, hard to install in containers.
- `docx4js`/`officegen`: Less mature, fewer downloads, worse error handling.
- `textract`: Wraps native tools, introduces system dependencies.

### 2. EPUB parsing

**Decision**: Use `epub2` for EPUB content extraction.

**Rationale**: `epub2` provides a simple async API to iterate chapters and extract HTML content. We convert chapter HTML to plain text using the same Turndown approach already used for Confluence. This gives chapter-aware chunking naturally.

**Alternatives considered**:

- `epubjs`: Browser-focused, heavy, not ideal for Node.js server-side extraction.
- Manual ZIP + XML parsing: More work for marginal benefit.

### 3. Audio/video transcription architecture

**Decision**: Use OpenAI Whisper API (or compatible endpoint) for transcription, `music-metadata` for media metadata extraction.

**Rationale**: Whisper API is widely available, supports many audio formats natively, and the project already has OpenAI integration patterns. `music-metadata` is a pure JS library that extracts duration, bitrate, artist, album, etc. without native dependencies.

The transcription is gated behind `ENABLE_AUDIO_TRANSCRIPTION` (default: false) since it requires API access and costs money. When disabled, audio/video files are indexed with metadata only (duration, format, etc.) but no transcript content.

**Alternatives considered**:

- Local Whisper (whisper.cpp): Requires model download, GPU for speed, complex setup.
- `ffmpeg` + external STT: Extra system dependency, more moving parts.

### 4. Chunking strategy

**Decision**: Reuse `chunkDoc()` for office documents (after text extraction). New `chunkEpub()` for chapter-aware chunking. New `chunkTranscript()` for timestamped audio transcripts.

**Rationale**: Office document text is structurally similar to plain-text docs after extraction. EPUB benefits from chapter boundaries as natural chunk points. Audio transcripts need timestamp preservation so users can locate the original audio segment.

### 5. File type classification

**Decision**: Add new extension sets (`OFFICE_EXT`, `EPUB_EXT`, `AUDIO_EXT`, `VIDEO_EXT`) alongside existing ones in `files.ts`. Route to appropriate parsers in the existing `upsertFiles` flow.

**Rationale**: Follows the established pattern. Each set maps to a parser function, keeping the routing logic simple and extensible.

### 6. Dynamic imports for heavy dependencies

**Decision**: Dynamically import `mammoth`, `xlsx`, `epub2`, and `music-metadata` only when processing their respective file types, following the existing pattern used for `pdf-parse`.

**Rationale**: Keeps startup fast and avoids loading unused libraries. Users who only index code files don't pay for EPUB parsing overhead.

### 7. No database schema changes

**Decision**: Store all format-specific metadata in the existing `extra_json` column on the `documents` table. Transcript timestamps go into chunk metadata.

**Rationale**: The schema already supports arbitrary metadata via `extra_json`. Adding columns for every format would bloat the schema and require migrations.

## Risks / Trade-offs

- **[Whisper API cost]** Audio transcription uses paid API calls. Mitigation: Feature is opt-in via `ENABLE_AUDIO_TRANSCRIPTION`, disabled by default. Users must explicitly enable it.
- **[Large audio files]** Whisper API has a 25MB file size limit. Mitigation: Skip files over the limit with a warning log. Future work could add chunked upload or ffmpeg pre-processing.
- **[XLSX data volume]** Large spreadsheets can produce enormous text output. Mitigation: Cap extraction at first 100 sheets and 10,000 rows per sheet, log a warning when truncated.
- **[PPTX fidelity]** Extracting text from PPTX via SheetJS may miss embedded images/charts. Mitigation: Acceptable for MVP since we're after searchable text, not visual fidelity.
- **[epub2 maintenance]** The `epub2` package has lower activity. Mitigation: The API surface we need is small (iterate chapters, get HTML). Easy to swap if needed.
- **[Test fixtures]** Need real format files for testing. Mitigation: Create minimal fixture files programmatically in test setup where possible, include small binary fixtures in the repo for formats that can't be easily generated.
