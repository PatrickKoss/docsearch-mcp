export interface EmbeddingService {
  readonly dimensions: number;
  generateEmbeddings(texts: readonly string[]): Promise<readonly Float32Array[]>;
}
