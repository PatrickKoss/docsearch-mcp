import { z } from 'zod';

import type { Application } from '../../application/factories/application-factory.js';
import type { SourceType } from '../../domain/entities/document.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerIngestTools(server: McpServer, app: Application): void {
  server.registerTool(
    'doc-ingest',
    {
      title: 'Ingest documents',
      description: 'Index documents from files or Confluence',
      inputSchema: {
        source: z.enum(['file', 'confluence', 'all']),
      },
    },
    async (input) => {
      const { source } = input;

      try {
        const sources: readonly (SourceType | 'all')[] = source === 'all' ? ['all'] : [source];
        const result = await app.services.documentService.ingestDocuments({
          sources,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: result.success
                ? result.message
                : `Document ingestion failed: ${result.message}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: `Document ingestion failed: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    'doc-ingest-status',
    {
      title: 'Get ingestion status',
      description: 'Get information about the current document index',
      inputSchema: {
        detailed: z.boolean().optional(),
      },
    },
    async (_input) => {
      try {
        // This would need to be implemented to provide actual statistics
        // using the metadata repository or direct database queries

        return {
          content: [
            {
              type: 'text' as const,
              text: 'Index status: Active\nDocuments indexed: N/A\nChunks processed: N/A',
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get ingestion status: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );
}
