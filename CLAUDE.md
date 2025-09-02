# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local-first document search and indexing system with an MCP server that provides hybrid semantic+keyword search across local files and Confluence pages. The system chunks documents, creates embeddings, stores them in SQLite with vector search capabilities, and exposes search functionality through the Model Context Protocol.

## Development Commands

```bash
# Setup
pnpm i                       # Install dependencies
cp .env.example .env         # Set up environment variables

# Data ingestion
pnpm dev:ingest files        # Index local files
pnpm dev:ingest confluence   # Index Confluence pages
pnpm dev:ingest watch        # Watch for file changes and re-index

# MCP Server
pnpm dev:mcp                 # Start MCP server in development
pnpm build                   # Build TypeScript
pnpm start:mcp               # Start built MCP server
```

## Architecture

### Core Components

- **MCP Server** (`src/server/mcp.ts`): Exposes `doc-search` tool and `docchunk://` resources via Model Context Protocol
- **Ingestion Pipeline** (`src/ingest/`): Processes files and Confluence pages into searchable chunks
- **Search Engine** (`src/ingest/search.ts`): Hybrid search combining FTS (keyword) and vector similarity
- **Database Schema** (`src/ingest/db.ts`): SQLite with sqlite-vec extension for vector storage

### Data Flow

1. **Ingestion**: Files/Confluence → Content extraction → Chunking → Embedding generation → SQLite storage
2. **Search**: Query → Hybrid search (keyword + vector) → Ranked results → MCP response
3. **Retrieval**: Resource URIs (`docchunk://{id}`) → Full chunk content with metadata

### Key Files

- `src/ingest/indexer.ts`: Core indexing operations (upsert documents, embed chunks)
- `src/ingest/sources/`: File system and Confluence content ingestion
- `src/ingest/chunker.ts`: Text chunking strategies for code vs documentation
- `src/ingest/embeddings.ts`: Embedding generation (OpenAI/TEI support)
- `src/shared/config.ts`: Environment-based configuration

## Configuration

Environment variables in `.env`:

- **Embeddings**: `EMBEDDINGS_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_EMBED_MODEL`
- **Confluence**: `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`, `CONFLUENCE_SPACES`
- **Files**: `FILE_ROOTS`, `FILE_INCLUDE_GLOBS`, `FILE_EXCLUDE_GLOBS`
- **Database**: `DB_PATH` (defaults to `./data/index.db`)

## Database Structure

- `documents`: Source metadata (URI, hash, mtime, repo, path, title)
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
