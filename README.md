# docsearch-mcp

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.17-purple.svg)](https://modelcontextprotocol.io/)

A local-first document search and indexing system that provides hybrid semantic + keyword search across local files (including PDFs) and Confluence pages through the Model Context Protocol (MCP). Perfect for AI assistants like Claude Code/Desktop to access your documentation, codebase, and research materials.

## ✨ Features

- **🔍 Hybrid Search**: Combines full-text search (FTS) with vector similarity for optimal results
- **📁 Multi-Source**: Index local files (code, docs, PDFs) and Confluence spaces
- **📄 PDF Support**: Extract and search text from PDF documents with metadata preservation
- **🗄️ Database Flexibility**: Support for SQLite (local-first) and PostgreSQL (scalable)
- **🤖 MCP Integration**: Seamless integration with Claude Code and other MCP-compatible tools
- **⚡ Real-time Updates**: File watching with automatic re-indexing
- **🎯 Smart Chunking**: Intelligent text chunking for code, documentation, and PDFs
- **🔒 Secure**: API keys and sensitive data stay on your machine

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm/pnpm/yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/docsearch-mcp.git
cd docsearch-mcp

# Quick setup with Make
make setup

# Or manual setup
pnpm install
cp .env.example .env
# Edit .env with your API keys and configuration
```

### Basic Usage

```bash
# Using Make (recommended)
make ingest-files              # Index your local files
make ingest-confluence         # Index Confluence pages (optional)
make dev                       # Start development MCP server
make start                     # Build and start production server

# Or using npm scripts directly
pnpm dev:ingest files
pnpm dev:ingest confluence
pnpm dev:mcp
pnpm build && pnpm start:mcp
```

## ⚙️ Configuration

Create a `.env` file from `.env.example` and configure:

### Embeddings (Required)

```env
EMBEDDINGS_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
OPENAI_EMBED_MODEL=text-embedding-3-small
```

### File Indexing

```env
FILE_ROOTS=.
FILE_INCLUDE_GLOBS=**/*.{ts,js,py,md,txt,pdf}
FILE_EXCLUDE_GLOBS=**/node_modules/**,**/dist/**
```

### Database Configuration

```env
# Use SQLite (default, local-first)
DB_TYPE=sqlite
DB_PATH=./data/index.db

# OR use PostgreSQL (for scalability)
DB_TYPE=postgresql
POSTGRES_CONNECTION_STRING=postgresql://user:password@localhost:5432/docsearch
```

### Confluence (Optional)

```env
CONFLUENCE_BASE_URL=https://yourcompany.atlassian.net
CONFLUENCE_EMAIL=your@email.com
CONFLUENCE_API_TOKEN=your_confluence_token
CONFLUENCE_SPACES=SPACE1,SPACE2
```

### Supported File Types

The system automatically detects and processes different file types:

- **Code files**: `.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, `.cpp`, `.c`, `.rb`, `.php`, `.kt`, `.swift`
- **Documentation**: `.md`, `.mdx`, `.txt`, `.rst`, `.adoc`, `.yaml`, `.yml`, `.json`
- **PDFs**: `.pdf` files are automatically parsed with text extraction and metadata preservation

PDF files are processed with:

- Text extraction using advanced parsing
- Metadata preservation (page count, document info)
- Smart text normalization and chunking
- Error handling for corrupted or encrypted files

## 📖 Usage

### MCP Integration

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "docsearch": {
      "command": "node",
      "args": ["path/to/docsearch-mcp/dist/server/mcp.js"]
    }
  }
}
```

### Search Modes

- **Auto** (default): Hybrid keyword + semantic search
- **Keyword**: Full-text search only
- **Vector**: Semantic search only

### Make Commands

Run `make help` to see all available commands:

```bash
# Development Commands
make install                    # Install dependencies
make dev                        # Start development server for MCP
make dev-ingest                 # Start development ingestion
make setup                      # Setup project for development

# Build Commands
make build                      # Build the project
make clean                      # Clean all generated files

# Quality Assurance
make lint                       # Run linter
make lint-fix                   # Run linter with auto-fix
make format                     # Format code with Prettier
make typecheck                  # Run TypeScript type checking
make test                       # Run tests
make test-run                   # Run tests once
make test-unit                  # Run unit tests only
make test-integration           # Run integration tests (requires Docker)
make check-all                  # Run all quality checks

# Production Commands
make start                      # Start production MCP server
make start-ingest               # Start production ingestion

# Data Management
make ingest-files               # Ingest local files
make ingest-confluence          # Ingest Confluence pages
make watch                      # Watch for file changes and re-index
make clean-data                 # Clean data directory
```

### NPM Scripts (Alternative)

```bash
# Ingestion
pnpm dev:ingest files           # Index local files
pnpm dev:ingest confluence      # Index Confluence pages
pnpm dev:ingest watch           # Watch for file changes

# Server
pnpm dev:mcp                    # Development server
pnpm start:mcp                  # Production server

# Quality
pnpm lint                       # Run linter
pnpm test                       # Run tests
pnpm test:unit                  # Run unit tests only
pnpm test:integration           # Run integration tests (requires Docker)
pnpm build                      # Build project
```

## 🏗️ Architecture

```text
┌─────────────────┐    ┌─────────────────┐
│   Local Files   │    │   Confluence    │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          ▼                      ▼
    ┌─────────────────────────────────┐
    │        Ingestion Engine         │
    │   • Content extraction         │
    │   • Smart chunking             │
    │   • Embedding generation       │
    └─────────────┬───────────────────┘
                  │
                  ▼
    ┌─────────────────────────────────┐
    │      Database Layer             │
    │   SQLite (sqlite-vec) OR        │
    │   PostgreSQL (pgvector)         │
    │   • Document metadata          │
    │   • Text chunks                │
    │   • Vector embeddings          │
    │   • Full-text search index     │
    └─────────────┬───────────────────┘
                  │
                  ▼
    ┌─────────────────────────────────┐
    │         MCP Server              │
    │   • Hybrid search engine       │
    │   • Resource resolution        │
    │   • Claude Code integration    │
    └─────────────────────────────────┘
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Workflow

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Set up the development environment:

   ```bash
   make setup
   ```

4. Make your changes and ensure quality:

   ```bash
   make check-all          # Run linter, typecheck, and tests
   make format             # Format your code
   ```

5. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
6. Push to the branch (`git push origin feature/AmazingFeature`)
7. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the integration standard
- [sqlite-vec](https://github.com/asg017/sqlite-vec) for vector search capabilities
- [Claude Code](https://claude.ai/code) for the AI-powered development experience
