# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local-first document search and indexing system with both a CLI tool and MCP server that provides hybrid semantic+keyword search across local files (including PDFs) and Confluence pages. The system chunks documents, creates embeddings, stores them in SQLite with vector search capabilities, and exposes search functionality through both a command-line interface and the Model Context Protocol.

## Development Commands

```bash
# Setup
make setup                   # Install dependencies and setup .env
make install                 # Install dependencies only
pnpm i                       # Install dependencies only (alternative)
cp .env.example .env         # Set up environment variables

# Development Servers
make dev                     # Start MCP development server
make dev-cli                 # Start CLI in development mode
pnpm dev:cli                 # Start CLI in development mode (alternative)
pnpm dev:mcp                 # Start MCP server in development (alternative)

# Build Commands
make build                   # Build the project
make clean                   # Clean all generated files (node_modules, data, dist)
make clean-dist              # Clean build directory only
pnpm build                   # Build TypeScript (alternative)

# Production
make start                   # Start production MCP server
make start-cli               # Start CLI in production mode
pnpm start:mcp               # Start built MCP server (alternative)
pnpm start:cli               # Run built CLI (alternative)

# Quality Assurance
make test                    # Run tests
make test-run                # Run tests once
make test-ui                 # Run tests with UI
make test-coverage           # Run tests with coverage
make test-unit               # Run unit tests only
make test-integration        # Run integration tests (requires Docker)
make lint                    # Run linter, formatter, and typecheck (source only)
make lint-fix                # Run linter with auto-fix
make format                  # Format code with Prettier
make format-check            # Check code formatting
make typecheck               # Run TypeScript type checking (all files)
make typecheck-src           # Run TypeScript type checking (source only)
make check-all               # Run all quality checks (lint, typecheck, unit tests)

# Data Management
make ingest-files            # Ingest local files
make ingest-files-incremental # Ingest local files with incremental indexing
make ingest-confluence       # Ingest Confluence pages
make ingest-all              # Ingest all sources (files and confluence)
make ingest-all-incremental  # Ingest all sources with incremental indexing
make watch                   # Watch for file changes and re-index
make watch-incremental       # Watch for file changes with incremental re-indexing
make search QUERY="text"     # Search documents
make search-json QUERY="text" # Search documents with JSON output
make clean-data              # Clean data directory

# Incremental Indexing (Performance Optimized)
make incremental-files       # Alias for incremental file indexing
make incremental-all         # Alias for incremental indexing of all sources
make incremental-watch       # Alias for incremental file watching
make incremental-benchmark   # Compare full vs incremental indexing performance

# Alternative pnpm commands
pnpm test                    # Run tests in watch mode
pnpm test:run                # Run tests once
pnpm test:ui                 # Run tests with UI
pnpm test:coverage           # Run tests with coverage
pnpm lint                    # Run ESLint
pnpm lint:fix                # Run ESLint with auto-fix
pnpm format                  # Format code with Prettier
pnpm typecheck               # Run TypeScript type checking

# CLI Tool (direct pnpm usage)
pnpm dev:cli ingest files    # Index local files via CLI
pnpm dev:cli ingest confluence # Index Confluence pages via CLI
pnpm dev:cli ingest all --watch # Index all sources with file watching
pnpm dev:cli search "query"  # Search documents via CLI
pnpm dev:cli search "test" --output json # Search with JSON output

# Help
make help                    # Show all available make commands
```

## Architecture

### Core Components

- **CLI Tool** (`src/cli/`): Command-line interface with ports and adapters architecture
  - Domain layer with clean interfaces (`src/cli/domain/ports.ts`)
  - Configuration adapters supporting env files, CLI args, and env variables
  - Output format adapters (text, JSON, YAML)
  - Document service adapters bridging to ingestion system
- **MCP Server** (`src/server/mcp.ts`): Enhanced with ingestion tools and output formatting
  - `doc-search`: Search with optional output formatting
  - `doc-ingest`: Document ingestion from files or Confluence
  - `doc-ingest-status`: Index statistics and status
  - `docchunk://` resources for chunk retrieval
- **Ingestion Pipeline** (`src/ingest/`): Processes files and Confluence pages into searchable chunks
- **Search Engine** (`src/ingest/search.ts`): Hybrid search combining FTS (keyword) and vector similarity
- **Database Schema** (`src/ingest/db.ts`): SQLite with sqlite-vec extension for vector storage

### Data Flow

1. **Ingestion**: Files (including PDFs)/Confluence → Content extraction → Chunking → Embedding generation → SQLite storage
2. **Search**: Query → Hybrid search (keyword + vector) → Ranked results → MCP response
3. **Retrieval**: Resource URIs (`docchunk://{id}`) → Full chunk content with metadata

### Key Files

**CLI Implementation:**

- `src/cli/main.ts`: CLI application entry point with Commander.js
- `src/cli/domain/ports.ts`: Core interfaces and types for CLI functionality
- `src/cli/adapters/config/env-config-provider.ts`: Multi-source configuration management
- `src/cli/adapters/output/`: Output format adapters (text, JSON, YAML)
- `src/cli/adapters/document/document-service.ts`: Bridge between CLI and ingestion system

**MCP Server:**

- `src/server/mcp.ts`: Enhanced MCP server with ingestion capabilities
- `src/server/tools/ingest-tools.ts`: MCP tools for document ingestion and status

**Core System:**

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
