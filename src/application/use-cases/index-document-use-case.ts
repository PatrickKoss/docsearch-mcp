import type { DocumentEntity, ChunkEntity } from '../../domain/entities/document.js';
import type { IndexingService } from '../../domain/services/indexing-service.js';

export interface IndexDocumentRequest {
  readonly document: Omit<DocumentEntity, 'id'>;
  readonly chunks: readonly Omit<ChunkEntity, 'id' | 'documentId'>[];
}

export interface IndexDocumentResponse {
  readonly documentId: number;
  readonly chunksIndexed: number;
}

export class IndexDocumentUseCase {
  constructor(private readonly indexingService: IndexingService) {}

  async execute(request: IndexDocumentRequest): Promise<IndexDocumentResponse> {
    const documentId = await this.indexingService.indexDocument(request.document);

    if (request.chunks.length > 0) {
      await this.indexingService.indexChunks(documentId, request.chunks);
    }

    return {
      documentId,
      chunksIndexed: request.chunks.length,
    };
  }
}
