## Context

The docsearch-mcp ingestion pipeline currently uses format-specific libraries for document parsing: `pdf-parse` for PDFs, `mammoth` for DOCX, `xlsx`/`jszip` for XLSX/PPTX, `epub2` for EPUBs, and OnlyOffice for legacy office formats. Each parser is called directly from the file ingestion functions in `src/ingest/sources/files.ts` and `files-incremental.ts`.

This works well for simple text extraction but has limitations: no OCR for scanned PDFs, poor table structure preservation, and no layout understanding. Docling (IBM's open-source project) provides ML-powered document parsing with OCR, layout analysis, and table extraction via `docling-serve`, a REST API server.

The codebase already uses strategy/provider patterns successfully: the embeddings system (`src/ingest/embeddings.ts`) uses an `Embedder` interface with `OpenAIEmbedder`/`TEIEmbedder` implementations selected via config, and the database layer uses a `DatabaseAdapter` interface with a factory function.

## Goals / Non-Goals

**Goals:**

- Introduce a `DocumentParser` strategy interface abstracting document parsing
- Implement a Docling adapter that calls `docling-serve` for document conversion
- Wrap existing built-in parsers behind the same interface
- Allow users to select the parsing strategy via `DOCUMENT_PARSER` env var
- Maintain full backward compatibility (built-in parsers remain the default)

**Non-Goals:**

- Bundling or installing Docling/Python directly — users run `docling-serve` as a Docker container
- Replacing the chunking layer — Docling returns text/markdown, existing chunkers handle the rest
- Supporting Docling's async/batch processing modes — synchronous per-file conversion is sufficient
- Adding a hybrid/fallback mode (use Docling for some formats, built-in for others) — this could be a future enhancement but is out of scope

## Decisions

### 1. Strategy interface design

**Decision**: Create a `DocumentParser` interface with a single `parse(filePath, buffer, ext)` method that returns parsed text + metadata. A factory function selects the implementation based on config.

**Rationale**: Mirrors the proven `Embedder` pattern. Simple, testable, no over-abstraction.

**Alternative considered**: Per-format strategy (separate PDF strategy, DOCX strategy, etc.) — rejected because Docling handles all formats through one API, making per-format strategies unnecessary complexity.

### 2. Docling integration via docling-serve REST API

**Decision**: Integrate with `docling-serve` via HTTP file upload to `POST /v1/convert/file`. Request markdown output format.

**Rationale**: `docling-serve` is the official way to use Docling from non-Python languages. Docker deployment is straightforward. The REST API accepts file uploads and returns converted text.

**Alternative considered**: Spawning a Python subprocess — rejected due to startup overhead per file and Python environment management complexity.

### 3. Output format from Docling

**Decision**: Request Markdown output from Docling, then feed it through existing `chunkDoc()` chunking.

**Rationale**: Markdown preserves table structure and headings while being compatible with existing doc chunking. No need for a new chunker.

**Alternative considered**: JSON/DoclingDocument format — richer structure but would require a custom chunker; not worth the complexity for the initial integration.

### 4. Configuration approach

**Decision**: Two new env vars: `DOCUMENT_PARSER` (`builtin` | `docling`, default `builtin`) and `DOCLING_URL` (e.g., `http://localhost:5001`).

**Rationale**: Follows existing patterns (`EMBEDDINGS_PROVIDER`, `DB_TYPE`). Minimal config surface. `DOCLING_URL` only required when parser is set to `docling`.

### 5. Where the strategy is applied

**Decision**: The strategy is called in `files.ts` and `files-incremental.ts` at the point where file content is currently read and parsed. The parser returns text and metadata; the existing chunking/embedding pipeline is unchanged.

**Rationale**: Minimal changes to the ingestion flow. The parser is a drop-in replacement at the content extraction step.

## Risks / Trade-offs

- **[Performance]** Docling ML models are slower than simple text extraction → Mitigation: Users opt in knowingly; docling-serve supports GPU acceleration for production use.
- **[Availability]** Docling requires a running Docker container → Mitigation: Clear error messages when `DOCLING_URL` is configured but unreachable. Validation at startup.
- **[Format coverage gaps]** Docling may not support all formats the built-in parsers handle (e.g., audio/video) → Mitigation: For unsupported formats, fall back to built-in parsing even when Docling is selected. Document which formats Docling handles.
- **[Output quality differences]** Switching parsers may produce different chunk boundaries for the same document → Mitigation: Document that re-indexing is needed when changing parser strategy.
