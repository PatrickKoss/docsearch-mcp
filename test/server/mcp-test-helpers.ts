import { z } from 'zod';

import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';
import { performSearch } from '../../src/ingest/search.js';
import { testDbPath } from '../setup.js';

import type { SearchResult as AdapterSearchResult } from '../../src/ingest/adapters/types.js';
import type { SearchParams, SearchMode } from '../../src/ingest/search.js';
import type { SourceType } from '../../src/shared/types.js';

interface SearchToolInput {
  readonly query: string;
  readonly topK?: number | undefined;
  readonly source?: SourceType | undefined;
  readonly repo?: string | undefined;
  readonly pathPrefix?: string | undefined;
  readonly mode?: SearchMode | undefined;
}

interface TextContentItem {
  readonly type: 'text';
  readonly text: string;
}

interface ResourceLinkContentItem {
  readonly type: 'resource_link';
  readonly uri: string;
  readonly name: string;
  readonly description?: string | undefined;
}

type ContentItem = TextContentItem | ResourceLinkContentItem;

export async function resourceHandler(uri: string) {
  const match = uri.match(/^docchunk:\/\/(\d+)$/);
  if (!match) {
    throw new Error('Invalid docchunk URI');
  }

  const id = match[1];
  const adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
  await adapter.init();

  try {
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
  } finally {
    await adapter.close();
  }
}

export async function searchTool(input: SearchToolInput) {
  const schema = z.object({
    query: z.string(),
    topK: z.number().int().min(1).max(50).optional(),
    source: z.enum(['file', 'confluence']).optional(),
    repo: z.string().optional(),
    pathPrefix: z.string().optional(),
    mode: z.enum(['auto', 'vector', 'keyword']).optional(),
  });

  const validatedInput = schema.parse(input);

  const adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
  await adapter.init();

  try {
    const searchParams: SearchParams = {
      query: validatedInput.query,
      topK: validatedInput.topK,
      source: validatedInput.source,
      repo: validatedInput.repo,
      pathPrefix: validatedInput.pathPrefix,
      mode: validatedInput.mode,
    };

    const results: AdapterSearchResult[] = await performSearch(adapter, searchParams);

    const content: ContentItem[] = [
      { type: 'text', text: `Found ${results.length} results for "${validatedInput.query}"` },
    ];

    for (const r of results) {
      const name = r.title || r.path || r.uri;
      const repoInfo = r.repo ? ` • ${r.repo}` : '';
      const pathInfo = r.path ? ` • ${r.path}` : '';
      const description = `${r.source}${repoInfo}${pathInfo}`;

      content.push({
        type: 'resource_link',
        uri: `docchunk://${r.chunk_id}`,
        name,
        description,
      });

      const snippet = String(r.snippet || '')
        .replace(/\s+/g, ' ')
        .slice(0, 240);
      const ellipsis = snippet.length >= 240 ? '…' : '';
      content.push({
        type: 'text',
        text: `— ${snippet}${ellipsis}`,
      });
    }

    return { content };
  } finally {
    await adapter.close();
  }
}
