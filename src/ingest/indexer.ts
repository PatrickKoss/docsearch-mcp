import { getEmbedder } from './embeddings.js';

import type { DatabaseAdapter } from './adapters/index.js';
import type { DocumentInput, ChunkInput } from '../shared/types.js';

export class Indexer {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async upsertDocument(doc: DocumentInput): Promise<number> {
    return await this.adapter.upsertDocument(doc);
  }

  async insertChunks(documentId: number, chunks: readonly ChunkInput[]): Promise<void> {
    await this.adapter.insertChunks(documentId, chunks);
  }

  async embedNewChunks(batchSize: number = 64): Promise<void> {
    const embedder = getEmbedder();
    const toEmbed = await this.adapter.getChunksToEmbed();

    for (let i = 0; i < toEmbed.length; i += batchSize) {
      const batch = toEmbed.slice(i, i + batchSize);
      const vecs = await embedder.embed(batch.map((b) => b.content));

      const embeddings = batch.map((item, j) => {
        const vec = vecs[j];
        if (!vec) {
          throw new Error(`Missing embedding vector for chunk ${item.id}`);
        }
        return {
          id: item.id,
          embedding: Array.from(vec),
        };
      });

      await this.adapter.insertEmbeddings(embeddings);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.adapter.setMeta(key, value);
  }

  async getMeta(key: string): Promise<string | undefined> {
    return await this.adapter.getMeta(key);
  }
}
