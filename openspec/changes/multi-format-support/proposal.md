## Why

The system currently handles code files, plain-text docs, PDFs, and images, but many real-world document collections include office documents (DOCX, XLSX, PPTX), ebooks (EPUB), and audio/video files. Users who point FILE_ROOTS at a folder full of mixed media get zero value from these formats today. Adding broad format support turns docsearch-mcp into a genuine "index everything local" tool, similar to what sist2/libscan offers for its search UI.

## What Changes

- **New file parsers**: DOCX, XLSX, PPTX, EPUB, and common audio/video formats (MP3, WAV, FLAC, OGG, MP4, WEBM).
- **Office document extraction**: Text + metadata extraction from Microsoft Office Open XML formats using `mammoth` (DOCX) and `xlsx` (XLSX/PPTX cell/slide text).
- **EPUB extraction**: HTML-based chapter content extraction and metadata (title, author, language) via `epub2` or similar.
- **Audio/video transcription**: Configurable speech-to-text via OpenAI Whisper API (or compatible endpoint) to produce searchable transcripts. Audio metadata (duration, bitrate, artist, album) extracted via `music-metadata`.
- **New chunking strategies**: `chunkEpub()` for chapter-aware chunking, `chunkTranscript()` for timestamped audio/video transcripts, reuse of `chunkDoc()` for office documents.
- **Extended CLI and MCP output**: Search results include format-specific metadata (page counts for office docs, chapter info for EPUB, timestamps for audio/video).
- **README update**: Document all new formats, required env vars, and optional dependencies.
- **Comprehensive tests**: Unit tests for each parser and chunker, integration tests for the full ingest-search round-trip with fixture files.

## Capabilities

### New Capabilities

- `office-document-parsing`: Extract text and metadata from DOCX, XLSX, PPTX files and chunk them for indexing.
- `epub-parsing`: Extract chapter content and metadata from EPUB files with chapter-aware chunking.
- `audio-video-transcription`: Transcribe audio/video files via Whisper API, extract media metadata, and chunk timestamped transcripts for indexing.
- `format-aware-search-output`: Enrich search results with format-specific metadata (timestamps, chapters, page counts) in CLI, JSON, YAML, and MCP outputs.

### Modified Capabilities

<!-- No existing spec-level requirements are changing. The new formats plug into the existing ingestion pipeline. -->

## Impact

- **Dependencies**: New npm packages: `mammoth`, `xlsx`, `epub2` (or `epubjs`), `music-metadata`. Optional: OpenAI Whisper API access for audio/video.
- **Config**: New env vars: `ENABLE_AUDIO_TRANSCRIPTION`, `WHISPER_API_KEY`, `WHISPER_BASE_URL`, `WHISPER_MODEL`.
- **File extensions**: `CODE_EXT`, `DOC_EXT`, `IMAGE_EXT` sets in `files.ts` extended; new `OFFICE_EXT`, `EPUB_EXT`, `AUDIO_EXT`, `VIDEO_EXT` sets added.
- **Database**: No schema changes. Office/EPUB docs use existing `documents` + `chunks` tables. Audio/video transcripts stored as chunks with timestamp metadata in `extra_json`.
- **CLI/MCP**: Output formatters updated to render new metadata fields. No breaking API changes.
- **Tests**: New fixture files for each format. Unit tests for parsers/chunkers. Integration tests for full pipeline.
