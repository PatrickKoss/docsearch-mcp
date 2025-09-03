import type { SearchResultEntity, ChunkContentEntity } from '../entities/document.js';
import type { EmbeddingService } from '../ports/embedding-service.js';
import type { SearchRepository } from '../ports/search-repository.js';
import type { SearchCriteria, SearchFilters } from '../value-objects/search-criteria.js';

export class SearchService {
  constructor(
    private readonly searchRepository: SearchRepository,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async search(criteria: SearchCriteria): Promise<readonly SearchResultEntity[]> {
    const filters: SearchFilters = {
      ...(criteria.source && { source: criteria.source }),
      ...(criteria.repository && { repository: criteria.repository }),
      ...(criteria.pathPrefix && { pathPrefix: criteria.pathPrefix }),
    };

    switch (criteria.mode) {
      case 'keyword':
        return await this.searchRepository.searchByKeywords(
          criteria.query,
          criteria.limit,
          filters,
        );

      case 'vector':
        return await this.performVectorSearch(criteria.query, criteria.limit, filters);

      case 'auto':
      default:
        return await this.performHybridSearch(criteria.query, criteria.limit, filters);
    }
  }

  async getChunkContent(chunkId: number): Promise<ChunkContentEntity | null> {
    return await this.searchRepository.getChunkContent(chunkId);
  }

  private async performVectorSearch(
    query: string,
    limit: number,
    filters: SearchFilters,
  ): Promise<readonly SearchResultEntity[]> {
    const embeddings = await this.embeddingService.generateEmbeddings([query]);
    const queryEmbedding = embeddings[0];

    if (!queryEmbedding) {
      throw new Error('Failed to generate embedding for query');
    }

    return await this.searchRepository.searchByVector(Array.from(queryEmbedding), limit, filters);
  }

  private async performHybridSearch(
    query: string,
    limit: number,
    filters: SearchFilters,
  ): Promise<readonly SearchResultEntity[]> {
    const halfLimit = Math.ceil(limit / 2);

    const [keywordResults, vectorResults] = await Promise.all([
      this.searchRepository.searchByKeywords(query, halfLimit, filters),
      this.performVectorSearch(query, halfLimit, filters),
    ]);

    // Combine and deduplicate results by chunk_id, preferring keyword matches
    const resultMap = new Map<number, SearchResultEntity>();

    // Add vector results first
    vectorResults.forEach((result) => {
      resultMap.set(result.chunkId, result);
    });

    // Add keyword results, overwriting vector results for the same chunk
    keywordResults.forEach((result) => {
      resultMap.set(result.chunkId, result);
    });

    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
