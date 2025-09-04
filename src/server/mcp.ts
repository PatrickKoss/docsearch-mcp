import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getDatabase } from '../ingest/database.js';
import { performSearch } from '../ingest/search.js';
import { registerIngestTools } from './tools/ingest-tools.js';
import { FormatterFactory } from '../cli/adapters/output/formatter-factory.js';

import type { OutputFormat } from '../cli/domain/ports.js';
import type { SearchResult as AdapterSearchResult } from '../ingest/adapters/index.js';
import type { SearchParams, SearchMode } from '../ingest/search.js';
import type { SourceType } from '../shared/types.js';

interface SearchResult extends AdapterSearchResult {
  readonly reason: 'keyword' | 'vector';
}

interface TextContentItem {
  readonly [x: string]: unknown;
  readonly type: 'text';
  readonly text: string;
  readonly _meta?: { [x: string]: unknown } | undefined;
}

interface ResourceLinkContentItem {
  readonly [x: string]: unknown;
  readonly type: 'resource_link';
  readonly uri: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly title?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly _meta?: { [x: string]: unknown } | undefined;
}

type ContentItem = TextContentItem | ResourceLinkContentItem;

interface SearchToolInput {
  readonly query: string;
  readonly topK?: number | undefined;
  readonly source?: SourceType | undefined;
  readonly repo?: string | undefined;
  readonly pathPrefix?: string | undefined;
  readonly mode?: SearchMode | undefined;
  readonly output?: OutputFormat | undefined;
  readonly includeImages?: boolean | undefined;
  readonly imagesOnly?: boolean | undefined;
}

const server = new McpServer({ name: 'docsearch-mcp', version: '0.1.0' });

// Register ingestion tools
registerIngestTools(server);

server.registerResource(
  'docchunk',
  new ResourceTemplate('docchunk://{id}', { list: undefined }),
  {
    title: 'Document Chunk',
    description: 'Retrieve an indexed chunk by id',
    mimeType: 'text/markdown',
  },
  async (_uri, { id }) => {
    const adapter = await getDatabase();
    const chunkContent = await adapter.getChunkContent(Number(id));

    if (!chunkContent) {
      return { contents: [{ uri: `docchunk://${id}`, text: 'Not found' }] };
    }

    const title = chunkContent.title || chunkContent.path || chunkContent.uri;
    const location = chunkContent.path ? `• ${chunkContent.path}` : '';
    const lines = chunkContent.start_line
      ? `(lines ${chunkContent.start_line}-${chunkContent.end_line})`
      : '';
    const header = `# ${title}\n\n> ${chunkContent.source} • ${chunkContent.repo || ''} ${location} ${lines}\n\n`;

    return { contents: [{ uri: `docchunk://${id}`, text: header + chunkContent.content }] };
  },
);

server.registerTool(
  'doc-search',
  {
    title: 'Search indexed docs',
    description: 'Hybrid semantic+keyword search across local files and Confluence',
    inputSchema: {
      query: z.string(),
      topK: z.number().int().min(1).max(50).optional(),
      source: z.enum(['file', 'confluence']).optional(),
      repo: z.string().optional(),
      pathPrefix: z.string().optional(),
      mode: z.enum(['auto', 'vector', 'keyword']).optional(),
      output: z.enum(['text', 'json', 'yaml']).optional(),
      includeImages: z.boolean().optional(),
      imagesOnly: z.boolean().optional(),
    },
  },
  async (input: SearchToolInput) => {
    const adapter = await getDatabase();
    const searchResults = await performSearch(adapter, input as SearchParams);

    // Convert adapter results to our SearchResult format
    const results: SearchResult[] = searchResults.map((r) => ({
      ...r,
      reason: 'vector' as const, // performSearch handles both modes internally
    }));

    const items = results.slice(0, input.topK ?? 8);

    // Handle output formatting if requested
    if (input.output && input.output !== 'text') {
      // Convert to CLI-compatible format for formatting
      const cliResults = items.map((r) => ({
        ...r,
        id: r.chunk_id,
        title: r.title || r.path || r.uri,
        content: r.snippet || '',
        source: r.source as SourceType,
      }));

      const formatter = FormatterFactory.createFormatter(input.output);
      const formattedOutput = formatter.format(cliResults);

      return {
        content: [{ type: 'text' as const, text: formattedOutput }],
      };
    }

    // Default MCP text output with resource links
    const content: ContentItem[] = [
      { type: 'text', text: `Found ${items.length} results for "${input.query}"` },
    ];

    for (const r of items) {
      const name = r.title || r.path || r.uri;
      const repoInfo = r.repo ? ` • ${r.repo}` : '';
      const pathInfo = r.path ? ` • ${r.path}` : '';
      const description = `${r.source}${repoInfo}${pathInfo}`;

      content.push({
        type: 'resource_link',
        uri: `docchunk://${r.chunk_id}`,
        name,
        description,
      } satisfies ResourceLinkContentItem);

      const snippet = String(r.snippet || '')
        .replace(/\s+/g, ' ')
        .slice(0, 240);
      const ellipsis = snippet.length >= 240 ? '…' : '';
      content.push({
        type: 'text',
        text: `— ${snippet}${ellipsis}`,
      } satisfies TextContentItem);
    }

    return { content };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
