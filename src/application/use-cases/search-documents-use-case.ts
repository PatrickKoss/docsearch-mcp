import type { SearchResultEntity } from '../../domain/entities/document.js';
import type { SearchService } from '../../domain/services/search-service.js';
import type { SearchCriteria } from '../../domain/value-objects/search-criteria.js';

export type SearchDocumentsRequest = SearchCriteria;

export interface SearchDocumentsResponse {
  readonly results: readonly SearchResultEntity[];
  readonly totalResults: number;
}

export class SearchDocumentsUseCase {
  constructor(private readonly searchService: SearchService) {}

  async execute(request: SearchDocumentsRequest): Promise<SearchDocumentsResponse> {
    const results = await this.searchService.search(request);

    return {
      results,
      totalResults: results.length,
    };
  }
}
