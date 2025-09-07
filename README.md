# docsearch-mcp

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.17-purple.svg)](https://modelcontextprotocol.io/)

A local-first document search and indexing system that provides hybrid semantic + keyword search across local files (including PDFs) and Confluence pages through the Model Context Protocol (MCP). Perfect for AI assistants like Claude Code/Desktop to access your documentation, codebase, and research materials.

## ✨ Features

- **🔍 Hybrid Search**: Combines full-text search (FTS) with vector similarity for optimal results
- **📁 Multi-Source**: Index local files (code, docs, PDFs) and Confluence spaces
- **📄 PDF Support**: Extract and search text from PDF documents with metadata preservation
- **🖼️ Image Search**: AI-powered image description and search for diagrams, screenshots, and charts
- **🗄️ Database Flexibility**: Support for SQLite (local-first) and PostgreSQL (scalable)
- **🤖 MCP Integration**: Seamless integration with Claude Code and other MCP-compatible tools
- **💻 CLI Tool**: Standalone command-line interface with multiple output formats
- **⚡ Real-time Updates**: File watching with automatic re-indexing
- **🎯 Smart Chunking**: Intelligent text chunking for code, documentation, and PDFs
- **📊 Multiple Output Formats**: Text, JSON, and YAML output for search results
- **🔒 Secure**: API keys and sensitive data stay on your machine

## 🚀 Installation & Usage

### npm Package

```bash
# Install globally
npm install -g docsearch-mcp

# Or use with npx
npx docsearch-mcp --help
```

### Docker Container

```bash
# Pull the image
docker pull ghcr.io/patrickkoss/docsearch-mcp:v0.0.1

# Run the MCP server
docker run -p 3000:3000 ghcr.io/patrickkoss/docsearch-mcp:v0.0.1
```

### MCP Server Usage

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "docsearch": {
      "command": "npx",
      "args": ["docsearch-mcp", "mcp"]
    }
  }
}
```

### Local Development Setup (Optional)

For development or customization:

```bash
# Clone the repository
git clone https://github.com/patrickkoss/docsearch-mcp.git
cd docsearch-mcp

# Quick setup with Make
make setup

# Or manual setup
pnpm install
cp .env.example .env
# Edit .env with your API keys and configuration
```

### Basic Usage

#### CLI Tool

```bash
# Ingest documents
docsearch-mcp ingest files              # Index local files
docsearch-mcp ingest confluence         # Index Confluence pages
docsearch-mcp ingest all --watch        # Index all sources with file watching

# Search documents
docsearch-mcp search "your query"       # Basic search
docsearch-mcp search "typescript" -k 5 -o json  # JSON output, top 5 results
docsearch-mcp search "API docs" -s confluence   # Search only Confluence

# Get help
docsearch-mcp --help
docsearch-mcp search --help
```

#### MCP Server

```bash
# Run the MCP server directly
npx docsearch-mcp mcp

# Or if installed globally
docsearch-mcp mcp
```

#### Docker Usage

```bash
# Run with official Docker image
docker run --rm \
  -v ./documents:/app/documents \
  -v docsearch-data:/app/data \
  --env-file .env \
  ghcr.io/patrickkoss/docsearch-mcp:v0.0.1

# Run CLI commands with Docker
docker run --rm \
  -v ./documents:/app/documents \
  -v docsearch-data:/app/data \
  --env-file .env \
  ghcr.io/patrickkoss/docsearch-mcp:v0.0.1 \
  npx docsearch-mcp search "your query"

# For development (requires cloning repo)
docker-compose up -d docsearch-mcp
```

## ⚙️ Configuration

### Docker Configuration

When using the official Docker image, create a `.env` file:

```bash
echo "OPENAI_API_KEY=your-openai-key" > .env
echo "FILE_ROOTS=/app/documents" >> .env
```

Key considerations for Docker deployment:

- **Document Volume**: Mount your documents directory to `/app/documents` in the container
- **Data Persistence**: Use a Docker volume for `/app/data` to persist the SQLite database
- **Environment Variables**: Pass configuration via `.env` file or environment variables
- **Official Image**: Use `ghcr.io/patrickkoss/docsearch-mcp:v0.0.1` for production deployments

#### Using the Official Docker Image

```bash
# Basic usage
docker run --rm \
  -v ./documents:/app/documents \
  -v docsearch-data:/app/data \
  --env-file .env \
  ghcr.io/patrickkoss/docsearch-mcp:v0.0.1

# For MCP server integration
docker run -d --name docsearch-mcp \
  -v ./documents:/app/documents \
  -v docsearch-data:/app/data \
  --env-file .env \
  ghcr.io/patrickkoss/docsearch-mcp:v0.0.1
```

### Local Development Configuration

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
FILE_INCLUDE_GLOBS=**/*.{ts,js,py,md,txt,pdf,png,jpg,jpeg,gif,svg,webp}
FILE_EXCLUDE_GLOBS=**/node_modules/**,**/dist/**
```

### Image Search (Optional)

```env
ENABLE_IMAGE_TO_TEXT=true
IMAGE_TO_TEXT_PROVIDER=openai
IMAGE_TO_TEXT_MODEL=gpt-4o-mini
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

# Advanced filtering (all optional)
# Filter by parent page IDs - only index pages under these parent pages
CONFLUENCE_PARENT_PAGES=12345678,87654321

# Title patterns to include (supports * wildcards)
CONFLUENCE_TITLE_INCLUDES=API*,User Guide,*Documentation*

# Title patterns to exclude (supports * wildcards)
CONFLUENCE_TITLE_EXCLUDES=Draft*,*Archive*,Test*
```

**Confluence Filtering Options:**

- **Parent Page Filtering**: Specify page IDs to only index pages within specific folder hierarchies
- **Title Include Patterns**: Define patterns to only index pages with matching titles
- **Title Exclude Patterns**: Define patterns to skip pages with matching titles
- **Wildcard Support**: Use `*` for flexible pattern matching (e.g., `API*` matches any title starting with "API")

### Supported File Types

The system automatically detects and processes different file types:

- **Code files**: `.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, `.cpp`, `.c`, `.rb`, `.php`, `.kt`, `.swift`
- **Documentation**: `.md`, `.mdx`, `.txt`, `.rst`, `.adoc`, `.yaml`, `.yml`, `.json`
- **PDFs**: `.pdf` files are automatically parsed with text extraction and metadata preservation
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp` files with optional AI-powered description generation

PDF files are processed with:

- Text extraction using advanced parsing
- Metadata preservation (page count, document info)
- Smart text normalization and chunking
- Error handling for corrupted or encrypted files

Image files support optional AI-powered description generation:

- **Vision Model Integration**: Uses OpenAI vision models (or compatible APIs) to generate detailed descriptions
- **Configurable Processing**: Enable/disable image-to-text via `ENABLE_IMAGE_TO_TEXT` environment variable
- **Fallback Support**: Images are indexed by filename when vision processing is disabled
- **Metadata Preservation**: Stores image dimensions, file size, and description metadata
- **Search Integration**: Image descriptions are indexed as searchable text content

## 📖 Usage

### CLI Tool

The CLI tool provides a convenient way to ingest and search documents directly from the command line:

#### CLI Commands & Flags

All CLI flags support configuration precedence: **CLI args > Environment variables > Config file**

##### Global Options (Available for all commands)

| Flag                                    | Environment Variable         | Default                                                       | Description                              |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| `-c, --config <file>`                   | -                            | `.env`                                                        | Configuration file path                  |
| `--embeddings-provider <provider>`      | `EMBEDDINGS_PROVIDER`        | `openai`                                                      | Embeddings provider (`openai` or `tei`)  |
| `--openai-api-key <key>`                | `OPENAI_API_KEY`             | -                                                             | OpenAI API key                           |
| `--openai-base-url <url>`               | `OPENAI_BASE_URL`            | -                                                             | OpenAI base URL (for custom endpoints)   |
| `--openai-embed-model <model>`          | `OPENAI_EMBED_MODEL`         | `text-embedding-3-small`                                      | OpenAI embedding model                   |
| `--openai-embed-dim <dimension>`        | `OPENAI_EMBED_DIM`           | `1536`                                                        | OpenAI embedding dimension               |
| `--tei-endpoint <url>`                  | `TEI_ENDPOINT`               | -                                                             | Text Embeddings Inference endpoint       |
| `--enable-image-to-text`                | `ENABLE_IMAGE_TO_TEXT`       | `false`                                                       | Enable image-to-text processing          |
| `--image-to-text-provider <provider>`   | `IMAGE_TO_TEXT_PROVIDER`     | `openai`                                                      | Image-to-text provider                   |
| `--image-to-text-model <model>`         | `IMAGE_TO_TEXT_MODEL`        | `gpt-4o-mini`                                                 | Image-to-text model                      |
| `--confluence-base-url <url>`           | `CONFLUENCE_BASE_URL`        | -                                                             | Confluence base URL                      |
| `--confluence-email <email>`            | `CONFLUENCE_EMAIL`           | -                                                             | Confluence email                         |
| `--confluence-api-token <token>`        | `CONFLUENCE_API_TOKEN`       | -                                                             | Confluence API token                     |
| `--confluence-spaces <spaces>`          | `CONFLUENCE_SPACES`          | -                                                             | Confluence spaces (comma-separated)      |
| `--file-roots <roots>`                  | `FILE_ROOTS`                 | `.`                                                           | File roots to index (comma-separated)    |
| `--file-include-globs <globs>`          | `FILE_INCLUDE_GLOBS`         | `**/*.{go,ts,tsx,js,py,rs,java,md,mdx,txt,yaml,yml,json,pdf}` | File include patterns                    |
| `--file-exclude-globs <globs>`          | `FILE_EXCLUDE_GLOBS`         | `**/{.git,node_modules,dist,build,target}/**`                 | File exclude patterns                    |
| `--db-type <type>`                      | `DB_TYPE`                    | `sqlite`                                                      | Database type (`sqlite` or `postgresql`) |
| `--db-path <path>`                      | `DB_PATH`                    | `./data/index.db`                                             | SQLite database path                     |
| `--postgres-connection-string <string>` | `POSTGRES_CONNECTION_STRING` | -                                                             | PostgreSQL connection string             |

##### Ingest Command

```bash
docsearch ingest [source] [options]
```

**Arguments:**

- `source` - Source to ingest: `files`, `confluence`, or `all` (default: `all`)

**Options:**

- `-w, --watch` - Watch for file changes and re-index

**Examples:**

```bash
# Basic ingestion with environment config
docsearch ingest files
docsearch ingest confluence
docsearch ingest all --watch

# Override config with CLI args
docsearch ingest files --file-roots "./src,./docs" --openai-api-key sk-xxx

# Use custom config file and database
docsearch --config prod.env --db-path /data/prod.db ingest all

# Ingest with custom file patterns
docsearch ingest files \
  --file-include-globs "**/*.{ts,md,py}" \
  --file-exclude-globs "**/node_modules/**,**/venv/**"

# Use PostgreSQL instead of SQLite
docsearch ingest all \
  --db-type postgresql \
  --postgres-connection-string "postgresql://user:pass@localhost:5432/docs"
```

##### Search Command

```bash
docsearch search <query> [options]
```

**Arguments:**

- `query` - Search query (required)

**Options:**

| Flag                         | Default | Description                                 |
| ---------------------------- | ------- | ------------------------------------------- |
| `-k, --top-k <number>`       | `10`    | Number of results to return (1-100)         |
| `-s, --source <source>`      | -       | Filter by source: `file` or `confluence`    |
| `-r, --repo <repo>`          | -       | Filter by repository name                   |
| `-p, --path-prefix <prefix>` | -       | Filter by path prefix                       |
| `-m, --mode <mode>`          | `auto`  | Search mode: `auto`, `vector`, or `keyword` |
| `-o, --output <format>`      | `text`  | Output format: `text`, `json`, or `yaml`    |
| `--include-images`           | -       | Include images in search results            |
| `--images-only`              | -       | Search only images                          |

**Examples:**

```bash
# Basic search
docsearch search "typescript interface"

# Limit results and format as JSON
docsearch search "API documentation" --top-k 5 --output json

# Search only Confluence with repository filter
docsearch search "deployment guide" --source confluence --repo backend-docs

# Semantic search only with path filtering
docsearch search "authentication" --mode vector --path-prefix src/auth/

# Override database and output as YAML
docsearch --db-path /custom/index.db search "error handling" --output yaml

# Complex search with multiple filters
docsearch search "React hooks" \
  --source file \
  --repo frontend \
  --path-prefix src/components/ \
  --mode auto \
  --top-k 20 \
  --output json

# Search including images (architecture diagrams, screenshots)
docsearch search "user authentication flow" --include-images

# Search only images for diagrams and charts
docsearch search "system architecture" --images-only --output json
```

#### CLI Configuration

The CLI supports multiple configuration sources in order of precedence:

1. Command-line arguments (highest priority)
2. Custom config file (`--config path/to/.env`)
3. `.env.local` file
4. `.env` file (lowest priority)

#### CLI Output Formats

- **Text** (default): Human-readable with icons and formatting
- **JSON**: Structured data with timestamps for integration
- **YAML**: Clean hierarchical format for configuration or documentation

### MCP Integration

The MCP (Model Context Protocol) server provides seamless integration with Claude Code and other MCP-compatible tools.

#### MCP Configuration Options

All configuration options are passed via environment variables to the MCP server:

##### Required Configuration

| Environment Variable  | Default  | Description                               |
| --------------------- | -------- | ----------------------------------------- |
| `EMBEDDINGS_PROVIDER` | `openai` | Embeddings provider (`openai` or `tei`)   |
| `OPENAI_API_KEY`      | -        | OpenAI API key (required if using OpenAI) |

##### Optional Configuration

| Environment Variable         | Default                                                       | Description                              |
| ---------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| `OPENAI_BASE_URL`            | -                                                             | OpenAI base URL (for custom endpoints)   |
| `OPENAI_EMBED_MODEL`         | `text-embedding-3-small`                                      | OpenAI embedding model                   |
| `OPENAI_EMBED_DIM`           | `1536`                                                        | OpenAI embedding dimension               |
| `TEI_ENDPOINT`               | -                                                             | Text Embeddings Inference endpoint       |
| `FILE_ROOTS`                 | `.`                                                           | File roots to index (comma-separated)    |
| `FILE_INCLUDE_GLOBS`         | `**/*.{go,ts,tsx,js,py,rs,java,md,mdx,txt,yaml,yml,json,pdf}` | File include patterns                    |
| `FILE_EXCLUDE_GLOBS`         | `**/{.git,node_modules,dist,build,target}/**`                 | File exclude patterns                    |
| `CONFLUENCE_BASE_URL`        | -                                                             | Confluence base URL                      |
| `CONFLUENCE_EMAIL`           | -                                                             | Confluence email                         |
| `CONFLUENCE_API_TOKEN`       | -                                                             | Confluence API token                     |
| `CONFLUENCE_SPACES`          | -                                                             | Confluence spaces (comma-separated)      |
| `DB_TYPE`                    | `sqlite`                                                      | Database type (`sqlite` or `postgresql`) |
| `DB_PATH`                    | `./data/index.db`                                             | SQLite database path                     |
| `POSTGRES_CONNECTION_STRING` | -                                                             | PostgreSQL connection string             |

#### Quick Setup

1. **Install the package:**

   ```bash
   npm install -g docsearch-mcp
   ```

2. **Create your configuration:**

   ```bash
   # Create a .env file in your project directory
   echo "OPENAI_API_KEY=your-openai-key" > .env
   echo "FILE_ROOTS=." >> .env
   ```

3. **Add to Claude Code MCP settings:**

   ```json
   {
     "mcpServers": {
       "docsearch": {
         "command": "npx",
         "args": ["docsearch-mcp", "mcp"],
         "env": {
           "OPENAI_API_KEY": "your-openai-key",
           "EMBEDDINGS_PROVIDER": "openai",
           "FILE_ROOTS": ".,../other-project",
           "DB_PATH": "/path/to/your/index.db"
         }
       }
     }
   }
   ```

#### Docker Integration

##### Method 1: Direct Docker Run

```json
{
  "mcpServers": {
    "docsearch": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "/path/to/your/documents:/app/documents",
        "-v",
        "docsearch-data:/app/data",
        "--env-file",
        ".env",
        "ghcr.io/patrickkoss/docsearch-mcp:v0.0.1"
      ]
    }
  }
}
```

##### Method 2: Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  docsearch-mcp:
    image: ghcr.io/patrickkoss/docsearch-mcp:v0.0.1
    volumes:
      - ./documents:/app/documents
      - docsearch-data:/app/data
    env_file:
      - .env
    stdin_open: true
volumes:
  docsearch-data:
```

Then configure MCP:

```json
{
  "mcpServers": {
    "docsearch": {
      "command": "docker",
      "args": ["exec", "-i", "docsearch-mcp", "node", "dist/src/server/mcp.js"]
    }
  }
}
```

#### Advanced MCP Configuration Examples

##### Multi-Project Setup

```json
{
  "mcpServers": {
    "docsearch-work": {
      "command": "npx",
      "args": ["docsearch-mcp", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key",
        "FILE_ROOTS": "/work/projects/frontend,/work/projects/backend",
        "FILE_INCLUDE_GLOBS": "**/*.{ts,tsx,js,py,md,yaml}",
        "DB_PATH": "/work/data/work-index.db",
        "CONFLUENCE_BASE_URL": "https://company.atlassian.net",
        "CONFLUENCE_SPACES": "DEV,API,DOCS"
      }
    },
    "docsearch-personal": {
      "command": "npx",
      "args": ["docsearch-mcp", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key",
        "FILE_ROOTS": "/home/user/projects,/home/user/documents",
        "DB_PATH": "/home/user/.docsearch/personal.db",
        "EMBEDDINGS_PROVIDER": "tei",
        "TEI_ENDPOINT": "http://localhost:8080/embeddings"
      }
    }
  }
}
```

##### PostgreSQL Setup

```json
{
  "mcpServers": {
    "docsearch": {
      "command": "npx",
      "args": ["docsearch-mcp", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key",
        "DB_TYPE": "postgresql",
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost:5432/docsearch",
        "FILE_ROOTS": ".,/other/projects"
      }
    }
  }
}
```

#### MCP Tools

The MCP server provides these tools for Claude Code:

##### `doc-search`

Search indexed documents with optional output formatting.

**Parameters:**

- `query` (string, required): Search query
- `topK` (number, optional): Number of results to return (default: 10, max: 100)
- `source` (string, optional): Filter by source (`file` or `confluence`)
- `repo` (string, optional): Filter by repository name
- `pathPrefix` (string, optional): Filter by path prefix
- `mode` (string, optional): Search mode (`auto`, `vector`, `keyword`, default: `auto`)
- `outputFormat` (string, optional): Output format (`text`, `json`, `yaml`, default: `text`)
- `includeImages` (boolean, optional): Include images in search results
- `imagesOnly` (boolean, optional): Search only images

**Example:**

```text
Use the doc-search tool to find "TypeScript interfaces" with JSON output format, limited to 5 results from file sources only.
```

##### `doc-ingest`

Ingest documents from files or Confluence.

**Parameters:**

- `source` (string, required): Source to ingest (`files`, `confluence`, or `all`)
- `watch` (boolean, optional): Watch for file changes and re-index (default: false)

**Example:**

```text
Use the doc-ingest tool to index all local files and Confluence pages.
```

##### `doc-ingest-status`

Get indexing statistics and status.

**No parameters required.**

**Example:**

```text
Use the doc-ingest-status tool to check how many documents are currently indexed.
```

#### MCP Resources

The server also provides chunk resources via URIs:

- **`docchunk://{chunk_id}`**: Retrieve full content of a specific document chunk by ID

## 📚 Practical Examples

### Complete Setup Workflows

#### Quick Setup Workflow

```bash
# 1. Install globally
npm install -g docsearch-mcp

# 2. Configure with your API key
echo "OPENAI_API_KEY=sk-your-key-here" > .env
echo "FILE_ROOTS=.,../other-project" >> .env

# 3. Index your documents
docsearch-mcp ingest all --watch &

# 4. Test search
docsearch-mcp search "how to deploy" --output json --top-k 3

# 5. Test MCP server
npx docsearch-mcp mcp
```

#### Production Docker Workflow

```bash
# 1. Setup production environment
echo "OPENAI_API_KEY=sk-your-key" > .env
echo "FILE_ROOTS=/app/documents" >> .env
# Add other configuration as needed

# 2. Create documents directory
mkdir -p documents
cp -r /path/to/your/docs/* documents/

# 3. Run the official Docker image
docker run -d \
  --name docsearch-mcp \
  -v $(pwd)/documents:/app/documents \
  -v docsearch-data:/app/data \
  --env-file .env \
  ghcr.io/patrickkoss/docsearch-mcp:v0.0.1

# 4. Index documents
docker exec docsearch-mcp npx docsearch-mcp ingest all

# 5. Test search
docker exec docsearch-mcp npx docsearch-mcp search "authentication" -o json
```

### Common Use Cases

#### Code Documentation Search

**Setup for a TypeScript/React Project:**

```bash
# CLI configuration
docsearch-mcp ingest files \
  --file-roots "./src,./docs,./README.md" \
  --file-include-globs "**/*.{ts,tsx,md,yaml,json}" \
  --file-exclude-globs "**/node_modules/**,**/dist/**,**/.git/**"

# Search for React patterns
docsearch-mcp search "useEffect hook patterns" --source file --top-k 10
docsearch-mcp search "TypeScript interface" --mode vector --output json
```

**MCP Configuration:**

```json
{
  "mcpServers": {
    "project-docs": {
      "command": "npx",
      "args": ["docsearch-mcp", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key",
        "FILE_ROOTS": "./src,./docs,./README.md",
        "FILE_INCLUDE_GLOBS": "**/*.{ts,tsx,md,yaml,json}",
        "FILE_EXCLUDE_GLOBS": "**/node_modules/**,**/dist/**",
        "DB_PATH": "./project-search.db"
      }
    }
  }
}
```

#### Multi-Repository Setup

**Team Documentation Hub:**

```json
{
  "mcpServers": {
    "team-knowledge": {
      "command": "npx",
      "args": ["docsearch-mcp", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key",
        "FILE_ROOTS": "/team/frontend,/team/backend,/team/mobile,/team/docs",
        "CONFLUENCE_BASE_URL": "https://company.atlassian.net",
        "CONFLUENCE_SPACES": "TEAM,API,ARCH,DEPLOY",
        "CONFLUENCE_EMAIL": "team@company.com",
        "CONFLUENCE_API_TOKEN": "your-token",
        "DB_TYPE": "postgresql",
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost/team_docs"
      }
    }
  }
}
```

**Personal Research Setup:**

```bash
# Index academic papers and personal notes
docsearch-mcp ingest files \
  --file-roots "/home/user/papers,/home/user/notes,/home/user/projects" \
  --file-include-globs "**/*.{pdf,md,txt,py,ipynb}" \
  --embeddings-provider tei \
  --tei-endpoint "http://localhost:8080/embeddings"

# Search across all personal knowledge
docsearch-mcp search "machine learning optimization" --mode auto --top-k 15

# Search for diagrams and technical images
docsearch-mcp search "neural network architecture" --include-images --top-k 10
docsearch-mcp search "flowchart" --images-only --output json
```

#### PDF-Heavy Workflow

```bash
# Setup for research document collection
docsearch-mcp ingest files \
  --file-roots "/research/papers,/research/reports" \
  --file-include-globs "**/*.{pdf,docx,md,txt}" \
  --openai-embed-model "text-embedding-3-large" \
  --openai-embed-dim 3072

# Search through research papers
docsearch-mcp search "neural network architectures" \
  --mode vector \
  --top-k 20 \
  --output yaml
```

### Advanced Search Examples

#### Complex Filtering

```bash
# Search only TypeScript files in components directory
docsearch-mcp search "button component" \
  --source file \
  --path-prefix src/components/ \
  --mode auto

# Find Confluence deployment docs from specific space
docsearch-mcp search "kubernetes deployment" \
  --source confluence \
  --repo DEVOPS \
  --mode keyword

# Semantic search across all sources with high precision
docsearch-mcp search "error handling patterns" \
  --mode vector \
  --top-k 50 \
  --output json | jq '.results[] | select(.score > 0.8)'

# Search for architecture diagrams and flowcharts
docsearch-mcp search "system design diagram" \
  --images-only \
  --mode vector \
  --output json

# Include images when searching for UI/UX content
docsearch-mcp search "user interface design" \
  --include-images \
  --path-prefix docs/ \
  --top-k 20
```

#### Output Format Examples

**Text Output (Human-readable):**

```bash
docsearch-mcp search "authentication middleware" --output text
```

**JSON Output (For scripts):**

```bash
# Get results for further processing
RESULTS=$(docsearch-mcp search "API rate limiting" --output json)
echo "$RESULTS" | jq '.results[].path' | head -5
```

**YAML Output (For documentation):**

```bash
# Generate documentation from search results
docsearch-mcp search "configuration options" --output yaml > config-docs.yml
```

### Troubleshooting Examples

#### Debug Search Quality

```bash
# Compare search modes
docsearch-mcp search "async function" --mode keyword --top-k 5
docsearch-mcp search "async function" --mode vector --top-k 5
docsearch-mcp search "async function" --mode auto --top-k 5

# Check what's indexed
docsearch-mcp ingest-status
```

#### Performance Optimization

```bash
# Use smaller embedding model for speed
docsearch-mcp ingest all \
  --openai-embed-model "text-embedding-3-small" \
  --openai-embed-dim 1536

# Use local TEI for privacy/speed
docker run -d --name tei -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
  --model-id sentence-transformers/all-MiniLM-L6-v2

docsearch-mcp ingest all \
  --embeddings-provider tei \
  --tei-endpoint http://localhost:8080/embeddings
```

### Integration Examples

#### CI/CD Pipeline Integration

```yaml
# .github/workflows/docs-index.yml
name: Update Documentation Index
on:
  push:
    paths: ['docs/**', 'src/**/*.md', 'README.md']

jobs:
  update-index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Install dependencies
        run: npm install -g pnpm && pnpm install
      - name: Build docsearch
        run: pnpm build
      - name: Update search index
        run: |
          pnpm start:cli ingest files \
            --file-roots "." \
            --openai-api-key "${{ secrets.OPENAI_API_KEY }}" \
            --db-path "./search-index.db"
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

#### Script Integration

```bash
#!/bin/bash
# update-docs.sh - Automated documentation indexing

# Check if API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Please set OPENAI_API_KEY environment variable"
    exit 1
fi

# Index all project documentation
echo "Indexing project documentation..."
docsearch-mcp ingest files \
    --file-roots "./src,./docs,./examples" \
    --file-include-globs "**/*.{ts,js,md,yaml,json}" \
    --db-path "./project-index.db"

# Generate search summary
echo "Search index updated. Statistics:"
docsearch-mcp ingest-status --output json | jq '.documents'
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
# CLI Tool
pnpm dev:cli                    # CLI development mode
pnpm start:cli                  # CLI production mode (after build)

# Ingestion (legacy scripts)
pnpm dev:ingest files           # Index local files
pnpm dev:ingest confluence      # Index Confluence pages
pnpm dev:ingest watch           # Watch for file changes

# MCP Server
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

The system follows a clean ports and adapters (hexagonal) architecture:

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
        ┌─────────┴─────────┐
        ▼                   ▼
┌─────────────────┐  ┌─────────────────┐
│   CLI Tool      │  │   MCP Server    │
│ • Text output   │  │ • Tool calls    │
│ • JSON output   │  │ • Resources     │
│ • YAML output   │  │ • Claude integration │
│ • Config mgmt   │  │ • Ingestion tools     │
└─────────────────┘  └─────────────────┘
```

### Key Components

- **Domain Layer**: Core interfaces and business logic
- **Adapters**: Configuration, database, and output formatting
- **CLI**: Command-line interface with multiple output formats
- **MCP Server**: Model Context Protocol integration with Claude Code

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

This project is licensed under the Apache License Version 2 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the integration standard
- [sqlite-vec](https://github.com/asg017/sqlite-vec) for vector search capabilities
- [Claude Code](https://claude.ai/code) for the AI-powered development experience
