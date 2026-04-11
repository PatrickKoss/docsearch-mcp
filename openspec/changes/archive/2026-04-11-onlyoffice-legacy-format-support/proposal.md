## Why

The system currently supports modern Office formats (DOCX, XLSX, PPTX) but not their legacy counterparts (DOC, XLS, PPT). Many organizations still have large archives of legacy Office files. By integrating the OnlyOffice Conversion API, the system can convert these legacy formats to modern ones on-the-fly and then process them through existing parsers, unlocking search across previously unsupported document types.

## What Changes

- Add a conversion layer that sends legacy Office files (DOC, XLS, PPT) to a configurable OnlyOffice Document Server's Conversion API, receives converted modern-format files, and feeds them into the existing parsers
- Add a lightweight local HTTP server to temporarily serve source files to the OnlyOffice converter (the API pulls files via URL)
- Extend file type detection to recognize `.doc`, `.xls`, `.ppt` extensions and route them through the conversion pipeline
- Add configuration for OnlyOffice server URL, JWT secret (optional), and conversion timeout
- Update default file include globs to cover legacy Office extensions

## Capabilities

### New Capabilities

- `onlyoffice-conversion`: Convert legacy Office formats (DOC, XLS, PPT) to modern formats (DOCX, XLSX, PPTX) via the OnlyOffice Conversion API, then process through existing parsers

### Modified Capabilities

- `office-document-parsing`: Extend file type classification to recognize legacy Office extensions and route them through the conversion pipeline before parsing

## Impact

- **New dependencies**: None (uses Node.js built-in `http` module for temp file serving, `fetch` for API calls)
- **Configuration**: New env vars `ONLYOFFICE_URL`, `ONLYOFFICE_JWT_SECRET` (optional), `ONLYOFFICE_TIMEOUT` (optional)
- **Infrastructure**: Requires a running OnlyOffice Document Server (available as Docker image `onlyoffice/documentserver`)
- **Affected code**: `src/ingest/parsers/office.ts`, `src/ingest/sources/files.ts`, `src/ingest/sources/files-incremental.ts`, `src/shared/config.ts`
- **Graceful degradation**: If OnlyOffice server is not configured or unreachable, legacy files are skipped with a warning
