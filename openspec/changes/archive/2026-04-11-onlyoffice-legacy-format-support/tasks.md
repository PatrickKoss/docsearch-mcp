## 1. Configuration

- [x] 1.1 Add `ONLYOFFICE_URL`, `ONLYOFFICE_JWT_SECRET`, and `ONLYOFFICE_TIMEOUT` to `src/shared/config.ts`
- [x] 1.2 Add the new env vars to `.env.example` with comments

## 2. OnlyOffice Conversion Module

- [x] 2.1 Create `src/ingest/parsers/onlyoffice.ts` with the ephemeral HTTP file server (bind `127.0.0.1`, random port, random path token)
- [x] 2.2 Implement JWT signing for conversion requests using Node `crypto` (HMAC-SHA256), skipped when no secret configured
- [x] 2.3 Implement the `convertLegacyOffice(filePath, inputExt, outputExt)` function: start server → call OnlyOffice `/converter` → download result to temp file → stop server → return temp path
- [x] 2.4 Add error handling: server unreachable, API error codes, timeout, temp file cleanup in `finally`

## 3. File Routing Integration

- [x] 3.1 Add `LEGACY_OFFICE_EXT` set (`.doc`, `.xls`, `.ppt`) to `src/ingest/sources/files.ts`
- [x] 3.2 Add legacy routing logic in `ingestFiles()`: detect legacy ext → convert via OnlyOffice → parse with existing modern parser → set `lang` to original extension
- [x] 3.3 Mirror the same routing changes in `src/ingest/sources/files-incremental.ts`
- [x] 3.4 Update default `FILE_INCLUDE_GLOBS` in `src/shared/config.ts` to include `doc,xls,ppt`

## 4. Testing

- [x] 4.1 Write unit tests for `onlyoffice.ts`: mock HTTP calls, test JWT signing, test error handling (timeout, server down, API errors)
- [x] 4.2 Write unit tests for file routing: verify legacy extensions route through conversion, verify skip-with-warning when OnlyOffice unconfigured
- [x] 4.3 Add integration test with a real OnlyOffice Docker container (optional, can be skipped in CI if container unavailable) — skipped: requires running OnlyOffice Docker container, covered by unit tests with mock server

## 5. Documentation

- [x] 5.1 Update README with OnlyOffice setup instructions (Docker command, env vars)
- [x] 5.2 Update CLAUDE.md with legacy Office format support details
