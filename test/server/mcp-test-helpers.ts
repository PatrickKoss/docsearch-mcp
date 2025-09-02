import { z } from 'zod';

import { openDb } from '../../src/ingest/db.js';
import { getEmbedder } from '../../src/ingest/embeddings.js';
import { hybridSearch } from '../../src/ingest/search.js';

import type { SearchParams, SearchMode } from '../../src/ingest/search.js';
import type { SourceType } from '../../src/shared/types.js';

interface ChunkWithDocumentRow {
  readonly id: number;
  readonly content: string;
  readonly uri: string;
  readonly title?: string | null;
  readonly path?: string | null;
  readonly repo?: string | null;
  readonly source: string;
  readonly start_line?: number | null;
  readonly end_line?: number | null;
}

interface SearchResult {
  readonly chunk_id: number;
  readonly score: number;
  readonly document_id: number;
  readonly source: string;
  readonly uri: string;
  readonly repo?: string | null;
  readonly path?: string | null;
  readonly title?: string | null;
  readonly start_line?: number | null;
  readonly end_line?: number | null;
  readonly snippet: string;
  readonly reason: 'keyword' | 'vector';
}

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
  const db = openDb();
  const stmt = db.prepare(`
    select c.id, c.content, d.uri, d.title, d.path, d.repo, d.source, c.start_line, c.end_line
    from chunks c join documents d on d.id = c.document_id
    where c.id = ?
  `);
  const row = stmt.get(Number(id)) as ChunkWithDocumentRow | undefined;

  if (!row) {
    return { contents: [{ uri: `docchunk://${id}`, text: 'Not found' }] };
  }

  const title = row.title || row.path || row.uri;
  const location = row.path ? `• ${row.path}` : '';
  const lines = row.start_line ? `(lines ${row.start_line}-${row.end_line})` : '';
  const header = `# ${title}\n\n> ${row.source} • ${row.repo || ''} ${location} ${lines}\n\n`;

  return { contents: [{ uri: `docchunk://${id}`, text: header + row.content }] };
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

  const db = openDb();
  const embedder = getEmbedder();
  const { kw, vec, binds } = hybridSearch(db, validatedInput as SearchParams);
  const results: SearchResult[] = [];

  if (validatedInput.mode !== 'vector') {
    const kwResults = kw.all({ query: validatedInput.query, ...binds });
    for (const r of kwResults) {
      results.push({ ...r, reason: 'keyword' });
    }
  }

  if (validatedInput.mode !== 'keyword') {
    const embeddings = await embedder.embed([validatedInput.query]);
    const firstEmbedding = embeddings[0];
    if (!firstEmbedding) {
      throw new Error('Failed to generate embedding for query');
    }
    const embedding = JSON.stringify(Array.from(firstEmbedding));
    const vecResults = vec.all({ embedding, ...binds });
    for (const r of vecResults) {
      results.push({ ...r, reason: 'vector' });
    }
  }

  const byId = new Map<number, SearchResult>();
  for (const r of results) {
    const prev = byId.get(r.chunk_id);
    if (!prev) {
      byId.set(r.chunk_id, r);
    } else if (r.reason === 'vector' && prev.reason !== 'vector') {
      byId.set(r.chunk_id, r);
    }
  }

  const items = Array.from(byId.values()).slice(0, validatedInput.topK ?? 8);

  const content: ContentItem[] = [
    { type: 'text', text: `Found ${items.length} results for "${validatedInput.query}"` },
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
