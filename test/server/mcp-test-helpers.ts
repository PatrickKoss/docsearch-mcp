import { z } from 'zod';

import { ConfigAdapter } from '../../src/application/adapters/config-adapter.js';
import { ApplicationFactory } from '../../src/application/factories/application-factory.js';
import { testDbPath } from '../setup.js';

import type { Application } from '../../src/application/factories/application-factory.js';
import type { SearchMode, SearchCriteria } from '../../src/domain/value-objects/search-criteria.js';

interface SearchToolInput {
  readonly query: string;
  readonly topK?: number | undefined;
  readonly source?: 'file' | 'confluence' | undefined;
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

let testApp: Application | null = null;

async function getTestApp(): Promise<Application> {
  if (!testApp) {
    const config = ConfigAdapter.fromEnvironment();
    // Override database path for tests
    const mutableConfig = { ...config };
    mutableConfig.database = { ...config.database, path: testDbPath };
    testApp = ApplicationFactory.create(mutableConfig);
  }
  return testApp;
}

export async function resourceHandler(uri: string) {
  const match = uri.match(/^docchunk:\/\/(\d+)$/);
  if (!match) {
    throw new Error('Invalid docchunk URI');
  }

  const id = match[1];
  const app = await getTestApp();

  const response = await app.useCases.getChunkContent.execute({ chunkId: Number(id) });

  if (!response.chunk) {
    return { contents: [{ uri: `docchunk://${id}`, text: 'Not found' }] };
  }

  const chunk = response.chunk;
  const title = chunk.title || chunk.path || chunk.uri;
  const location = chunk.path ? `• ${chunk.path}` : '';
  const lines = chunk.startLine ? `(lines ${chunk.startLine}-${chunk.endLine})` : '';
  const header = `# ${title}\n\n> ${chunk.source} • ${chunk.repo || ''} ${location} ${lines}\n\n`;

  return { contents: [{ uri: `docchunk://${id}`, text: header + chunk.content }] };
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
  const app = await getTestApp();

  const searchCriteria: SearchCriteria = {
    query: validatedInput.query,
    limit: validatedInput.topK || 10,
    mode: validatedInput.mode || 'auto',
    ...(validatedInput.source && { source: validatedInput.source }),
    ...(validatedInput.repo && { repository: validatedInput.repo }),
    ...(validatedInput.pathPrefix && { pathPrefix: validatedInput.pathPrefix }),
  };

  const response = await app.useCases.searchDocuments.execute(searchCriteria);
  const results = response.results;

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
      uri: `docchunk://${r.chunkId}`,
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
}
