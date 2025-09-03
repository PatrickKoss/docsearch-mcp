import { z } from 'zod';

import { FormatterFactory } from '../../cli/adapters/output/formatter-factory.js';

import type { Application } from '../../application/factories/application-factory.js';
import type { OutputFormat } from '../../cli/ports.js';
import type { SourceType } from '../../domain/entities/document.js';
import type { SearchMode } from '../../domain/value-objects/search-criteria.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
}

export function registerSearchTools(server: McpServer, app: Application): void {
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
      },
    },
    async (input: SearchToolInput) => {
      const searchResults = await app.services.documentService.searchDocuments({
        query: input.query,
        limit: input.topK ?? 8,
        mode: input.mode ?? 'auto',
        source: input.source,
        repository: input.repo,
        pathPrefix: input.pathPrefix,
      });

      // Handle output formatting if requested
      if (input.output && input.output !== 'text') {
        // Convert to CLI-compatible format for formatting
        const cliResults = searchResults.map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          chunk_id: r.chunkId,
          score: r.score,
          document_id: r.documentId,
          source: r.source,
          uri: r.uri,
          repo: r.repo,
          path: r.path,
          start_line: r.startLine,
          end_line: r.endLine,
          snippet: r.snippet,
        }));

        const formatter = FormatterFactory.createFormatter(input.output);
        const formattedOutput = formatter.format(cliResults);

        return {
          content: [{ type: 'text' as const, text: formattedOutput }],
        };
      }

      // Default MCP text output with resource links
      const content: ContentItem[] = [
        { type: 'text', text: `Found ${searchResults.length} results for "${input.query}"` },
      ];

      for (const r of searchResults) {
        const name = r.title;
        const repoInfo = r.repo ? ` • ${r.repo}` : '';
        const pathInfo = r.path ? ` • ${r.path}` : '';
        const description = `${r.source}${repoInfo}${pathInfo}`;

        content.push({
          type: 'resource_link',
          uri: `docchunk://${r.chunkId}`,
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
}
