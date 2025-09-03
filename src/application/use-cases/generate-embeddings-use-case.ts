import type { IndexingService } from '../../domain/services/indexing-service.js';

export interface GenerateEmbeddingsRequest {
  readonly batchSize?: number;
}

export interface GenerateEmbeddingsResponse {
  readonly success: boolean;
}

export class GenerateEmbeddingsUseCase {
  constructor(private readonly indexingService: IndexingService) {}

  async execute(request: GenerateEmbeddingsRequest = {}): Promise<GenerateEmbeddingsResponse> {
    const batchSize = request.batchSize ?? 64;

    await this.indexingService.generateEmbeddings(batchSize);

    return {
      success: true,
    };
  }
}
