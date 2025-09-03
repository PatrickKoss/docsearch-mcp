import type { DocumentEntity, ChunkEntity, EmbeddingEntity } from '../entities/document.js';

export interface DocumentRepository {
  getDocumentByUri(uri: string): Promise<{ id: number; hash: string } | null>;
  saveDocument(document: Omit<DocumentEntity, 'id'>): Promise<number>;
  saveChunks(
    documentId: number,
    chunks: readonly Omit<ChunkEntity, 'id' | 'documentId'>[],
  ): Promise<void>;
  getUnembeddedChunks(limit?: number): Promise<Array<{ id: number; content: string }>>;
  saveEmbeddings(embeddings: readonly EmbeddingEntity[]): Promise<void>;
  hasChunks(documentId: number): Promise<boolean>;
  removeDocumentChunks(documentId: number): Promise<void>;
}
