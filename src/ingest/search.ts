import { getEmbedder } from './embeddings.js';

import type { DatabaseAdapter, SearchResult } from './adapters/index.js';
import type { SourceType } from '../infrastructure/database/legacy-types.js';

export type SearchMode = 'auto' | 'vector' | 'keyword';

export interface SearchParams {
  readonly query: string;
  readonly topK?: number;
  readonly source?: SourceType;
  readonly repo?: string;
  readonly pathPrefix?: string;
  readonly mode?: SearchMode;
}

export async function performSearch(
  adapter: DatabaseAdapter,
  params: SearchParams,
): Promise<SearchResult[]> {
  const topK = params.topK ?? 8;
  const mode = params.mode ?? 'auto';

  const filters = {
    ...(params.source && { source: params.source }),
    ...(params.repo && { repo: params.repo }),
    ...(params.pathPrefix && { pathPrefix: params.pathPrefix }),
  };

  switch (mode) {
    case 'keyword': {
      return await adapter.keywordSearch(params.query, topK, filters);
    }

    case 'vector': {
      const embedder = getEmbedder();
      const queryEmbedding = await embedder.embed([params.query]);
      const firstEmbedding = queryEmbedding[0];
      if (!firstEmbedding) {
        throw new Error('Failed to generate embedding for query');
      }
      const embedding = Array.from(firstEmbedding);
      return await adapter.vectorSearch(embedding, topK, filters);
    }

    case 'auto':
    default: {
      // For auto mode, combine both keyword and vector search
      const [keywordResults, vectorResults] = await Promise.all([
        adapter.keywordSearch(params.query, Math.ceil(topK / 2), filters),
        (async () => {
          const embedder = getEmbedder();
          const queryEmbedding = await embedder.embed([params.query]);
          const firstEmbedding = queryEmbedding[0];
          if (!firstEmbedding) {
            throw new Error('Failed to generate embedding for query');
          }
          const embedding = Array.from(firstEmbedding);
          return await adapter.vectorSearch(embedding, Math.ceil(topK / 2), filters);
        })(),
      ]);

      // Combine and deduplicate results by chunk_id, preferring keyword matches
      const resultMap = new Map<number, SearchResult>();

      // Add vector results first
      for (const result of vectorResults) {
        resultMap.set(result.chunk_id, result);
      }

      // Add keyword results, overwriting vector results for the same chunk
      for (const result of keywordResults) {
        resultMap.set(result.chunk_id, result);
      }

      return Array.from(resultMap.values())
        .sort((a, b) => {
          // Sort by score descending (assuming lower scores are better for vector, higher for keyword)
          // This is a simple heuristic - in practice you might want more sophisticated ranking
          return b.score - a.score;
        })
        .slice(0, topK);
    }
  }
}
