## Context

The system currently parses DOCX (mammoth), XLSX (exceljs), and PPTX (jszip) directly. Legacy Office formats (DOC, XLS, PPT) use proprietary binary formats that lack reliable Node.js parsing libraries. The OnlyOffice Document Server provides a Conversion API that converts legacy formats to modern ones via HTTP.

The Conversion API works by pulling a source file from a URL you provide, converting it, and returning a URL to download the result. This means the local system must temporarily serve the source file over HTTP so the OnlyOffice server can fetch it.

## Goals / Non-Goals

**Goals:**

- Support DOC, XLS, PPT file ingestion by converting to DOCX, XLSX, PPTX via OnlyOffice
- Reuse existing parsers for the converted output (no new parsing code)
- Gracefully degrade when OnlyOffice is unavailable (skip with warning)
- Keep the conversion layer isolated and testable

**Non-Goals:**

- Supporting other OnlyOffice conversion pairs (e.g., PDF to DOCX)
- Running or managing the OnlyOffice Docker container from within the tool
- Supporting OnlyOffice Cloud API (self-hosted only)
- Converting files in bulk via batch API (process one at a time, matching existing patterns)

## Decisions

### 1. Conversion module as a separate parser adapter

**Decision**: Create `src/ingest/parsers/onlyoffice.ts` as a standalone module that handles the conversion lifecycle (serve file → call API → download result → return temp path).

**Rationale**: Keeps conversion concerns separate from parsing. The office parser already handles DOCX/XLSX/PPTX; the new module just produces those formats from legacy inputs. This follows the existing pattern where each parser is a separate module.

**Alternative considered**: Inline conversion logic into `office.ts`. Rejected because it would bloat the parser and mix two concerns (conversion vs. parsing).

### 2. Ephemeral HTTP server for file serving

**Decision**: Spin up a temporary `http.createServer` on a random port for each conversion, serving just the one file, then shut it down after the conversion completes.

**Rationale**: The OnlyOffice API requires fetching files via URL. A per-conversion ephemeral server is simple, avoids long-running background processes, and has no security exposure beyond the conversion window. Using Node's built-in `http` module means zero new dependencies.

**Alternative considered**: Long-running local file server. Rejected because it adds lifecycle management complexity and leaves a port open unnecessarily. Another alternative: using a shared temp HTTP server with a file registry. Overkill for sequential file processing.

### 3. JWT authentication via shared secret

**Decision**: Support optional JWT signing of conversion requests using `ONLYOFFICE_JWT_SECRET`. When set, sign the request payload with HMAC-SHA256. When not set, skip JWT (for dev/test setups with auth disabled).

**Rationale**: Production OnlyOffice servers typically require JWT. Making it optional simplifies local development. Node's `crypto` module handles HMAC-SHA256 without external dependencies.

**Alternative considered**: Requiring a full JWT library like `jsonwebtoken`. Rejected because the token structure is simple enough to construct manually.

### 4. Configuration approach

**Decision**: Three new environment variables:

- `ONLYOFFICE_URL`: Base URL of the Document Server (e.g., `http://localhost:8080`). When not set, legacy format support is disabled.
- `ONLYOFFICE_JWT_SECRET`: JWT signing secret (optional)
- `ONLYOFFICE_TIMEOUT`: Conversion timeout in ms (default: 30000)

**Rationale**: Follows the existing pattern of env-based configuration in `src/shared/config.ts`. Making the URL the feature gate (no URL = feature disabled) is simple and explicit.

### 5. File routing strategy

**Decision**: Add a `LEGACY_OFFICE_EXT` set (`.doc`, `.xls`, `.ppt`) alongside the existing `OFFICE_EXT` set. Legacy files go through conversion first, then route to the matching modern parser.

**Rationale**: Clean separation between file detection and processing. The conversion step is transparent to the rest of the pipeline.

## Risks / Trade-offs

- **[Network dependency]** Conversion requires a reachable OnlyOffice server → Mitigation: graceful skip with warning when server is down or unconfigured. Document Docker setup in README.
- **[Conversion latency]** Each legacy file adds HTTP round-trip overhead (serve + convert + download) → Mitigation: acceptable for indexing workloads which are already I/O-bound. Configurable timeout prevents hangs.
- **[Temp file cleanup]** Converted files written to temp dir could accumulate on crashes → Mitigation: use `os.tmpdir()` with unique filenames and clean up in a `finally` block.
- **[Port conflicts]** Ephemeral server on random port could theoretically conflict → Mitigation: let OS assign port (port 0), retry on EADDRINUSE.
- **[Security]** Temp HTTP server briefly exposes file on localhost → Mitigation: bind to `127.0.0.1` only, serve single file with random path token, shut down immediately after use.
