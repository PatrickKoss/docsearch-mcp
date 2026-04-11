## 1. Configuration

- [x] 1.1 Add `DOCUMENT_PARSER` (`builtin` | `docling`, default `builtin`) and `DOCLING_URL` (string) to `src/shared/config.ts`
- [x] 1.2 Add `DOCUMENT_PARSER` and `DOCLING_URL` to `.env.example` with comments
- [x] 1.3 Add config validation: error if `DOCUMENT_PARSER=docling` but `DOCLING_URL` is not set

## 2. Strategy Interface

- [x] 2.1 Create `src/ingest/parsers/types.ts` with `DocumentParser` interface (`parse(filePath, buffer, ext)` returning `{ text, metadata, contentType }`)
- [x] 2.2 Create `src/ingest/parsers/factory.ts` with `getDocumentParser()` factory function that reads config and returns the appropriate implementation

## 3. Built-in Parser Implementation

- [x] 3.1 Create `src/ingest/parsers/builtin.ts` implementing `DocumentParser` — wrap existing PDF, office, EPUB parsing logic behind the interface
- [x] 3.2 Ensure built-in parser returns consistent `{ text, metadata, contentType: 'text' }` for all formats

## 4. Docling Parser Implementation

- [x] 4.1 Create `src/ingest/parsers/docling.ts` implementing `DocumentParser` — HTTP client that uploads files to `POST {DOCLING_URL}/v1/convert/file`
- [x] 4.2 Parse Docling API response and extract Markdown text output
- [x] 4.3 Add error handling: log warning and skip file on connection errors or conversion failures
- [x] 4.4 Define the set of Docling-supported extensions (PDF, DOCX, PPTX, XLSX, HTML, images, EPUB) and fall back to built-in parser for unsupported formats (audio, video, code)

## 5. Ingestion Pipeline Integration

- [x] 5.1 Refactor `src/ingest/sources/files.ts` to use `DocumentParser.parse()` instead of direct parser calls for content extraction
- [x] 5.2 Refactor `src/ingest/sources/files-incremental.ts` similarly
- [x] 5.3 Route Docling Markdown output through `chunkDoc()` chunking strategy

## 6. Testing

- [x] 6.1 Add unit tests for `DoclingParser` with mocked HTTP responses (success, error, unreachable)
- [x] 6.2 Add unit tests for `BuiltinParser` ensuring it wraps existing parsers correctly
- [x] 6.3 Add unit tests for `getDocumentParser()` factory with different config values
- [x] 6.4 Add unit tests for unsupported format fallback behavior
- [x] 6.5 Verify existing tests still pass with default `builtin` config

## 7. Documentation

- [x] 7.1 Update CLAUDE.md with Docling configuration section and supported formats
- [x] 7.2 Update README with docling-serve Docker setup instructions
