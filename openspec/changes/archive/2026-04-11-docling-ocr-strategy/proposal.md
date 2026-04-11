## Why

The current document parsing pipeline uses separate libraries per format (`pdf-parse`, `mammoth`, `xlsx`, custom PPTX XML extraction). For PDFs especially, `pdf-parse` does basic text extraction but has no OCR capability for scanned documents and poor table/layout understanding. Docling (IBM's open-source document AI) provides superior parsing with OCR, layout analysis, table extraction, and formula recognition across many formats. By introducing a strategy pattern for document parsing, users can choose the best parser for their needs: the lightweight built-in parsers or Docling's ML-powered pipeline.

## What Changes

- Add a `DOCUMENT_PARSER` config option (`builtin` | `docling`) to select the parsing strategy
- Create a Docling parser adapter that calls `docling-serve` (REST API) for document conversion
- Introduce a `DocumentParser` strategy interface that both the built-in parsers and Docling adapter implement
- Route file parsing through the selected strategy in the ingestion pipeline
- Add `DOCLING_URL` config for the docling-serve endpoint
- Docling supports PDF, DOCX, PPTX, XLSX, HTML, images, EPUB, and more — when selected, it handles all supported formats through a single pipeline
- Built-in parsers remain the default; Docling is opt-in

## Capabilities

### New Capabilities

- `docling-parsing`: Integration with docling-serve REST API for ML-powered document parsing with OCR, layout analysis, and table extraction
- `parser-strategy`: Strategy pattern allowing users to select between built-in parsers and Docling via configuration

### Modified Capabilities

## Impact

- New dependency: `docling-serve` Docker container (external, not a Node.js dependency)
- Config changes: new `DOCUMENT_PARSER` and `DOCLING_URL` environment variables
- Affected code: `src/ingest/sources/files.ts`, `src/ingest/sources/files-incremental.ts`, `src/shared/config.ts`
- New code: `src/ingest/parsers/docling.ts`, `src/ingest/parsers/strategy.ts`
- No breaking changes — existing behavior unchanged with default config
