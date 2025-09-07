import { z } from 'zod';

import { getDatabase } from '../../ingest/database.js';
import { Indexer } from '../../ingest/indexer.js';
import { ingestConfluence } from '../../ingest/sources/confluence.js';
import { ingestFiles } from '../../ingest/sources/files.js';

import type { DatabaseAdapter } from '../../ingest/adapters/index.js';
import type { SourceType } from '../../shared/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface IngestToolInput {
  readonly source: SourceType | 'all';
}

interface IngestStatusToolInput {
  readonly detailed?: boolean | undefined;
}

export function registerIngestTools(server: McpServer): void {
  // Doc ingestion tool
  server.registerTool(
    'doc-ingest',
    {
      title: 'Ingest documents',
      description: 'Ingest and index documents from files or Confluence',
      inputSchema: {
        source: z.enum(['file', 'confluence', 'all']).describe('Source to ingest'),
      },
    },
    async (input: IngestToolInput) => {
      const adapter = await getDatabase();
      const indexer = new Indexer(adapter);

      try {
        const results: string[] = [];

        if (input.source === 'file' || input.source === 'all') {
          results.push('Starting file ingestion...');
          await ingestFiles(adapter);
          await indexer.embedNewChunks();
          results.push('✅ Files ingested and indexed successfully');
        }

        if (input.source === 'confluence' || input.source === 'all') {
          results.push('Starting Confluence ingestion...');
          await ingestConfluence(adapter);
          await indexer.embedNewChunks();
          results.push('✅ Confluence pages ingested and indexed successfully');
        }

        const content = results.join('\n');
        return { content: [{ type: 'text' as const, text: content }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Ingestion failed: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Doc ingestion status tool
  server.registerTool(
    'doc-ingest-status',
    {
      title: 'Get ingestion status',
      description: 'Get information about the current document index',
      inputSchema: {
        detailed: z.boolean().optional().describe('Include detailed statistics'),
      },
    },
    async (input: IngestStatusToolInput) => {
      try {
        const adapter = await getDatabase();
        const stats = await getIndexStats(adapter, input.detailed || false);

        return {
          content: [{ type: 'text' as const, text: formatStatsOutput(stats, input.detailed) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Failed to get status: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

async function getIndexStats(adapter: DatabaseAdapter, detailed: boolean) {
  // Get basic stats
  const documentsCount = await adapter.rawQuery('SELECT COUNT(*) as count FROM documents');
  const chunksCount = await adapter.rawQuery('SELECT COUNT(*) as count FROM chunks');
  const embeddedChunksCount = await adapter.rawQuery('SELECT COUNT(*) as count FROM vec_chunks');

  const docCount = (documentsCount[0]?.count as number) || 0;
  const chunkCount = (chunksCount[0]?.count as number) || 0;
  const embeddedCount = (embeddedChunksCount[0]?.count as number) || 0;

  const stats = {
    documents: docCount,
    chunks: chunkCount,
    embedded_chunks: embeddedCount,
    embedding_progress: chunkCount > 0 ? Math.round((embeddedCount / chunkCount) * 100) : 0,
  };

  if (detailed) {
    // Get source breakdown
    const sourceBreakdown = await adapter.rawQuery(`
      SELECT 
        source,
        COUNT(*) as documents,
        SUM(CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END) as chunks
      FROM documents d
      LEFT JOIN chunks c ON d.id = c.doc_id
      GROUP BY source
    `);

    // Get recent activity
    const recentActivity = await adapter.rawQuery(`
      SELECT 
        title,
        source,
        repo,
        path,
        mtime
      FROM documents 
      ORDER BY mtime DESC 
      LIMIT 5
    `);

    return {
      ...stats,
      sourceBreakdown,
      recentActivity,
    };
  }

  return stats;
}

function formatStatsOutput(stats: Record<string, unknown>, detailed?: boolean): string {
  const lines = [
    '📊 Document Index Status',
    '',
    `📄 Documents: ${stats.documents}`,
    `📝 Chunks: ${stats.chunks}`,
    `🧠 Embedded chunks: ${stats.embedded_chunks}`,
    `📈 Embedding progress: ${stats.embedding_progress}%`,
  ];

  if (detailed && Array.isArray(stats.sourceBreakdown)) {
    lines.push('');
    lines.push('📊 Source Breakdown:');
    for (const row of stats.sourceBreakdown) {
      if (typeof row === 'object' && row !== null) {
        const rowObj = row as Record<string, unknown>;
        lines.push(`  ${rowObj.source}: ${rowObj.documents} docs, ${rowObj.chunks} chunks`);
      }
    }
  }

  if (detailed && Array.isArray(stats.recentActivity) && stats.recentActivity.length > 0) {
    lines.push('');
    lines.push('📅 Recent Activity:');
    for (const doc of stats.recentActivity) {
      if (typeof doc === 'object' && doc !== null) {
        const docObj = doc as Record<string, unknown>;
        const title = docObj.title || docObj.path || 'Untitled';
        const location = [docObj.source, docObj.repo, docObj.path].filter(Boolean).join(' • ');
        lines.push(`  ${title} (${location})`);
      }
    }
  }

  return lines.join('\n');
}
