import type { ChunkContentEntity } from '../../domain/entities/document.js';
import type { SearchService } from '../../domain/services/search-service.js';

export interface GetChunkContentRequest {
  readonly chunkId: number;
}

export interface GetChunkContentResponse {
  readonly chunk: ChunkContentEntity | null;
}

export class GetChunkContentUseCase {
  constructor(private readonly searchService: SearchService) {}

  async execute(request: GetChunkContentRequest): Promise<GetChunkContentResponse> {
    const chunk = await this.searchService.getChunkContent(request.chunkId);

    return {
      chunk,
    };
  }
}
