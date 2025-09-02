# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local-first document search and indexing system with an MCP server that provides hybrid semantic+keyword search across local files (including PDFs) and Confluence pages. The system chunks documents, creates embeddings, stores them in SQLite with vector search capabilities, and exposes search functionality through the Model Context Protocol.

## Development Commands

```bash
# Setup
make setup                   # Install dependencies and setup .env
pnpm i                       # Install dependencies only
cp .env.example .env         # Set up environment variables

# Data ingestion
pnpm dev:ingest files        # Index local files
pnpm dev:ingest confluence   # Index Confluence pages
pnpm dev:ingest watch        # Watch for file changes and re-index

# MCP Server
pnpm dev:mcp                 # Start MCP server in development
pnpm build                   # Build TypeScript
pnpm start:mcp               # Start built MCP server

# Quality Assurance
pnpm test                    # Run tests in watch mode
pnpm test:run                # Run tests once
pnpm test:ui                 # Run tests with UI
pnpm test:coverage           # Run tests with coverage
pnpm lint                    # Run ESLint
pnpm lint:fix                # Run ESLint with auto-fix
pnpm format                  # Format code with Prettier
pnpm typecheck               # Run TypeScript type checking

# Make commands (alternative workflow)
make help                    # Show all available make commands
make check-all              # Run linting, type checking, and tests
make dev                    # Start MCP development server
```

## Architecture

### Core Components

- **MCP Server** (`src/server/mcp.ts`): Exposes `doc-search` tool and `docchunk://` resources via Model Context Protocol
- **Ingestion Pipeline** (`src/ingest/`): Processes files and Confluence pages into searchable chunks
- **Search Engine** (`src/ingest/search.ts`): Hybrid search combining FTS (keyword) and vector similarity
- **Database Schema** (`src/ingest/db.ts`): SQLite with sqlite-vec extension for vector storage

### Data Flow

1. **Ingestion**: Files (including PDFs)/Confluence → Content extraction → Chunking → Embedding generation → SQLite storage
2. **Search**: Query → Hybrid search (keyword + vector) → Ranked results → MCP response
3. **Retrieval**: Resource URIs (`docchunk://{id}`) → Full chunk content with metadata

### Key Files

- `src/ingest/indexer.ts`: Core indexing operations (upsert documents, embed chunks)
- `src/ingest/sources/`: File system (including PDF) and Confluence content ingestion
- `src/ingest/chunker.ts`: Text chunking strategies for code, documentation, and PDFs
- `src/ingest/embeddings.ts`: Embedding generation (OpenAI/TEI support)
- `src/shared/config.ts`: Environment-based configuration

## Configuration

Environment variables in `.env`:

- **Embeddings**: `EMBEDDINGS_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_EMBED_MODEL`
- **Confluence**: `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`, `CONFLUENCE_SPACES`
- **Files**: `FILE_ROOTS`, `FILE_INCLUDE_GLOBS`, `FILE_EXCLUDE_GLOBS`
- **Database**: `DB_PATH` (defaults to `./data/index.db`)

## Database Structure

- `documents`: Source metadata (URI, hash, mtime, repo, path, title, language, extra_json for PDF metadata)
- `chunks`: Text chunks with line numbers and token counts
- `vec_chunks`: Vector embeddings linked to chunks
- `chunks_fts`: Full-text search index
- `meta`: Key-value metadata storage

## Search Modes

- `auto`: Combines keyword and vector search (default)
- `keyword`: FTS-only using SQLite BM25
- `vector`: Semantic search using embeddings
- Filters: source type, repository, path prefix

## Development Notes

- Uses sqlite-vec for vector operations and FTS5 for keyword search
- Chunks are embedded in batches of 64 with rate limiting
- File watching triggers full re-scan (simple but reliable)
- Confluence syncing tracks last modification time per space
- Document deduplication based on content hash

### PDF Support

- **Parser**: Uses `pdf-parse` library for text extraction from PDF files
- **Dynamic Loading**: PDF parsing library loaded only when processing PDFs to avoid conflicts
- **Text Processing**: Custom `chunkPdf()` function normalizes whitespace and line breaks from PDF extraction
- **Metadata Storage**: PDF-specific metadata (page count, document info) stored in `extra_json` field
- **Error Handling**: Gracefully handles empty PDFs, parsing errors, and corrupted files
- **File Types**: PDFs are treated as document files and use document-style chunking
- **Integration**: Seamlessly integrated into existing file ingestion pipeline

## Quality Assurance

The project includes comprehensive tooling for code quality:

- **Testing**: Vitest for unit and integration tests with UI and coverage support
- **Linting**: ESLint with TypeScript, import, and Prettier integration
- **Formatting**: Prettier for consistent code style
- **Type Safety**: Strict TypeScript configuration with full type checking
- **Automation**: Makefile with common development workflows

### Testing Strategy

- Unit tests for core functionality (indexing, search, chunking, PDF processing)
- Integration tests for database operations and MCP server
- Mock implementations for external dependencies (OpenAI, Confluence, PDF parsing)
- Test coverage reporting and UI for development
- Comprehensive PDF ingestion tests with mocked PDF parsing
