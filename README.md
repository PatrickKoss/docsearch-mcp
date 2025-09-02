# docsearch-mcp

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.17-purple.svg)](https://modelcontextprotocol.io/)

A local-first document search and indexing system that provides hybrid semantic + keyword search across local files and Confluence pages through the Model Context Protocol (MCP). Perfect for AI assistants like Claude Code/Desktop to access your documentation and codebase.

## ✨ Features

- **🔍 Hybrid Search**: Combines full-text search (FTS) with vector similarity for optimal results
- **📁 Multi-Source**: Index both local files and Confluence spaces
- **🚀 Local-First**: All data stored locally in SQLite with vector extensions
- **🤖 MCP Integration**: Seamless integration with Claude Code and other MCP-compatible tools
- **⚡ Real-time Updates**: File watching with automatic re-indexing
- **🎯 Smart Chunking**: Intelligent text chunking for code and documentation
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

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys and configuration
```

### Basic Usage

```bash
# Index your local files
pnpm dev:ingest files

# Index Confluence pages (optional)
pnpm dev:ingest confluence

# Start the MCP server
pnpm dev:mcp

# Or build and run in production
pnpm build
pnpm start:mcp
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
FILE_INCLUDE_GLOBS=**/*.{ts,js,py,md,txt}
FILE_EXCLUDE_GLOBS=**/node_modules/**,**/dist/**
```

### Confluence (Optional)
```env
CONFLUENCE_BASE_URL=https://yourcompany.atlassian.net
CONFLUENCE_EMAIL=your@email.com
CONFLUENCE_API_TOKEN=your_confluence_token
CONFLUENCE_SPACES=SPACE1,SPACE2
```

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

### CLI Commands

```bash
# Ingestion
pnpm dev:ingest files           # Index local files
pnpm dev:ingest confluence      # Index Confluence pages  
pnpm dev:ingest watch           # Watch for file changes

# Server
pnpm dev:mcp                    # Development server
pnpm start:mcp                  # Production server
```

## 🏗️ Architecture

```
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
    │         SQLite + Vectors        │
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

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the integration standard
- [sqlite-vec](https://github.com/asg017/sqlite-vec) for vector search capabilities
- [Claude Code](https://claude.ai/code) for the AI-powered development experience
