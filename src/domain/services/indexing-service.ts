import type { DocumentEntity, ChunkEntity } from '../entities/document.js';
import type { DocumentRepository } from '../ports/document-repository.js';
import type { EmbeddingService } from '../ports/embedding-service.js';
import type { MetadataRepository } from '../ports/metadata-repository.js';

export class IndexingService {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly metadataRepository: MetadataRepository,
  ) {}

  async indexDocument(document: Omit<DocumentEntity, 'id'>): Promise<number> {
    return await this.documentRepository.saveDocument(document);
  }

  async indexChunks(
    documentId: number,
    chunks: readonly Omit<ChunkEntity, 'id' | 'documentId'>[],
  ): Promise<void> {
    await this.documentRepository.saveChunks(documentId, chunks);
  }

  async generateEmbeddings(batchSize: number = 64): Promise<void> {
    const chunksToEmbed = await this.documentRepository.getUnembeddedChunks();

    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      const batch = chunksToEmbed.slice(i, i + batchSize);
      const embeddings = await this.embeddingService.generateEmbeddings(
        batch.map((chunk) => chunk.content),
      );

      const embeddingEntities = batch.map((chunk, index) => ({
        id: chunk.id,
        embedding: Array.from(embeddings[index] || []),
      }));

      await this.documentRepository.saveEmbeddings(embeddingEntities);

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  async setMetadata(key: string, value: string): Promise<void> {
    await this.metadataRepository.setValue(key, value);
  }

  async getMetadata(key: string): Promise<string | null> {
    return await this.metadataRepository.getValue(key);
  }
}
