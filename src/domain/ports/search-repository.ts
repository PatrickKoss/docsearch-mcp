import type { SearchResultEntity, ChunkContentEntity } from '../entities/document.js';
import type { SearchFilters } from '../value-objects/search-criteria.js';

export interface SearchRepository {
  searchByKeywords(
    query: string,
    limit: number,
    filters: SearchFilters,
  ): Promise<readonly SearchResultEntity[]>;
  searchByVector(
    embedding: readonly number[],
    limit: number,
    filters: SearchFilters,
  ): Promise<readonly SearchResultEntity[]>;
  getChunkContent(chunkId: number): Promise<ChunkContentEntity | null>;
}
