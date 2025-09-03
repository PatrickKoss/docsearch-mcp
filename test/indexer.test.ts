import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { testDbPath } from './setup.js';
import { SqliteAdapter } from '../src/ingest/adapters/sqlite.js';
import { Indexer } from '../src/ingest/indexer.js';

import type { DocumentInput, ChunkInput } from '../src/infrastructure/database/legacy-types.js';

vi.mock('../src/ingest/embeddings.js', () => ({
  getEmbedder: vi.fn().mockReturnValue({
    dim: 1536,
    embed: vi
      .fn()
      .mockResolvedValue([
        new Float32Array(Array(1536).fill(0.1)),
        new Float32Array(Array(1536).fill(0.2)),
      ]),
  }),
}));

describe('Indexer', () => {
  let adapter: SqliteAdapter;
  let indexer: Indexer;

  beforeEach(async () => {
    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();
    indexer = new Indexer(adapter);
  });

  afterEach(async () => {
    await adapter?.close();
  });

  describe('Document operations', () => {
    const sampleDoc: DocumentInput = {
      source: 'file',
      uri: 'test://sample.txt',
      repo: 'test-repo',
      path: 'sample.txt',
      title: 'Sample Document',
      lang: 'text',
      hash: 'abc123',
      mtime: Date.now(),
      version: '1.0',
      extraJson: JSON.stringify({ type: 'test' }),
    };

    it('should insert new document', async () => {
      const docId = await indexer.upsertDocument(sampleDoc);
      expect(docId).toBeGreaterThan(0);

      // @ts-expect-error - accessing private property for testing
      const result = adapter.db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
      expect(result).toBeTruthy();
      expect(result.uri).toBe(sampleDoc.uri);
      expect(result.hash).toBe(sampleDoc.hash);
      expect(result.title).toBe(sampleDoc.title);
    });

    it('should update existing document with same URI', async () => {
      const docId1 = await indexer.upsertDocument(sampleDoc);

      const updatedDoc = { ...sampleDoc, hash: 'xyz789', title: 'Updated Title' };
      const docId2 = await indexer.upsertDocument(updatedDoc);

      expect(docId1).toBe(docId2);

      // @ts-expect-error - accessing private property for testing
      const result = adapter.db.prepare('SELECT * FROM documents WHERE id = ?').get(docId2);
      expect(result.hash).toBe('xyz789');
      expect(result.title).toBe('Updated Title');
    });

    it('should not update when hash is the same', async () => {
      const docId1 = await indexer.upsertDocument(sampleDoc);
      const docId2 = await indexer.upsertDocument(sampleDoc);

      expect(docId1).toBe(docId2);
    });

    it('should handle null/optional fields', async () => {
      const minimalDoc: DocumentInput = {
        source: 'file',
        uri: 'test://minimal.txt',
        hash: 'minimal123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extraJson: null,
      };

      const docId = await indexer.upsertDocument(minimalDoc);
      expect(docId).toBeGreaterThan(0);

      // @ts-expect-error - accessing private property for testing
      const result = adapter.db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
      expect(result.uri).toBe(minimalDoc.uri);
      expect(result.repo).toBeNull();
      expect(result.path).toBeNull();
    });
  });

  describe('Chunk operations', () => {
    let docId: number;

    beforeEach(async () => {
      const sampleDoc: DocumentInput = {
        source: 'file',
        uri: 'test://chunks.txt',
        hash: 'chunks123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extraJson: null,
      };
      docId = await indexer.upsertDocument(sampleDoc);
    });

    it('should insert chunks for document', async () => {
      const chunks: ChunkInput[] = [
        { content: 'First chunk', startLine: 1, endLine: 5, tokenCount: 10 },
        { content: 'Second chunk', startLine: 6, endLine: 10, tokenCount: 12 },
        { content: 'Third chunk', tokenCount: 8 },
      ];

      await indexer.insertChunks(docId, chunks);

      // @ts-expect-error - accessing private property for testing
      const result = adapter.db
        .prepare('SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index')
        .all(docId);
      expect(result).toHaveLength(3);

      expect(result[0].content).toBe('First chunk');
      expect(result[0].chunk_index).toBe(0);
      expect(result[0].start_line).toBe(1);
      expect(result[0].end_line).toBe(5);
      expect(result[0].token_count).toBe(10);

      expect(result[1].content).toBe('Second chunk');
      expect(result[1].chunk_index).toBe(1);

      expect(result[2].content).toBe('Third chunk');
      expect(result[2].chunk_index).toBe(2);
      expect(result[2].start_line).toBeNull();
      expect(result[2].end_line).toBeNull();
    });

    it('should handle empty chunks array', async () => {
      await indexer.insertChunks(docId, []);

      // @ts-expect-error - accessing private property for testing
      const result = adapter.db
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE document_id = ?')
        .get(docId);
      expect(result.count).toBe(0);
    });
  });

  describe('Embedding operations', () => {
    let docId: number;

    beforeEach(async () => {
      const sampleDoc: DocumentInput = {
        source: 'file',
        uri: 'test://embed.txt',
        hash: 'embed123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extraJson: null,
      };
      docId = await indexer.upsertDocument(sampleDoc);

      const chunks: ChunkInput[] = [
        { content: 'Chunk to embed 1' },
        { content: 'Chunk to embed 2' },
      ];
      await indexer.insertChunks(docId, chunks);
    });

    it('should embed new chunks', async () => {
      await indexer.embedNewChunks(1);

      // @ts-expect-error - accessing private property for testing
      const embeddedCount = adapter.db.prepare('SELECT COUNT(*) as count FROM chunk_vec_map').get();
      expect(embeddedCount.count).toBe(2);

      // @ts-expect-error - accessing private property for testing
      const vecCount = adapter.db.prepare('SELECT COUNT(*) as count FROM vec_chunks').get();
      expect(vecCount.count).toBe(2);
    });

    it('should not re-embed already embedded chunks', async () => {
      await indexer.embedNewChunks();

      // @ts-expect-error - accessing private property for testing
      const initialCount = adapter.db
        .prepare('SELECT COUNT(*) as count FROM chunk_vec_map')
        .get().count;

      await indexer.embedNewChunks();

      // @ts-expect-error - accessing private property for testing
      const finalCount = adapter.db
        .prepare('SELECT COUNT(*) as count FROM chunk_vec_map')
        .get().count;
      expect(finalCount).toBe(initialCount);
    });

    it('should handle batch processing', async () => {
      const { getEmbedder } = await import('../src/ingest/embeddings.js');
      const mockEmbedder = vi.mocked(getEmbedder());

      // Clear previous calls from other tests
      mockEmbedder.embed.mockClear();

      await indexer.embedNewChunks(1);

      expect(mockEmbedder.embed).toHaveBeenCalledTimes(2);
      expect(mockEmbedder.embed).toHaveBeenNthCalledWith(1, ['Chunk to embed 1']);
      expect(mockEmbedder.embed).toHaveBeenNthCalledWith(2, ['Chunk to embed 2']);
    });
  });

  describe('Document cleanup on update', () => {
    it('should cleanup chunks and embeddings when document hash changes', async () => {
      const doc: DocumentInput = {
        source: 'file',
        uri: 'test://cleanup.txt',
        hash: 'original123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extraJson: null,
      };
      const docId = await indexer.upsertDocument(doc);

      const chunks: ChunkInput[] = [
        { content: 'Original chunk 1' },
        { content: 'Original chunk 2' },
      ];
      await indexer.insertChunks(docId, chunks);
      await indexer.embedNewChunks();

      // @ts-expect-error - accessing private property for testing
      const initialChunkCount = adapter.db
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE document_id = ?')
        .get(docId).count;
      // @ts-expect-error - accessing private property for testing
      const initialVecCount = adapter.db
        .prepare('SELECT COUNT(*) as count FROM chunk_vec_map')
        .get().count;
      expect(initialChunkCount).toBe(2);
      expect(initialVecCount).toBe(2);

      const updatedDoc = { ...doc, hash: 'updated456' };
      await indexer.upsertDocument(updatedDoc);

      // @ts-expect-error - accessing private property for testing
      const finalChunkCount = adapter.db
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE document_id = ?')
        .get(docId).count;
      // @ts-expect-error - accessing private property for testing
      const finalVecCount = adapter.db
        .prepare('SELECT COUNT(*) as count FROM chunk_vec_map')
        .get().count;
      expect(finalChunkCount).toBe(0);
      expect(finalVecCount).toBe(0);
    });
  });

  describe('Metadata operations', () => {
    it('should set and get metadata', async () => {
      await indexer.setMeta('test_key', 'test_value');

      const value = await indexer.getMeta('test_key');
      expect(value).toBe('test_value');
    });

    it('should return undefined for non-existent keys', async () => {
      const value = await indexer.getMeta('non_existent_key');
      expect(value).toBeUndefined();
    });

    it('should update existing metadata', async () => {
      await indexer.setMeta('key', 'original_value');
      await indexer.setMeta('key', 'updated_value');

      const value = await indexer.getMeta('key');
      expect(value).toBe('updated_value');
    });

    it('should handle empty string values', async () => {
      await indexer.setMeta('empty_key', '');

      const value = await indexer.getMeta('empty_key');
      expect(value).toBe('');
    });
  });

  describe('Error handling', () => {
    it('should throw error if document upsert fails', async () => {
      const invalidDoc = {} as DocumentInput;

      await expect(indexer.upsertDocument(invalidDoc)).rejects.toThrow();
    });

    it('should handle embedding errors gracefully', async () => {
      const { getEmbedder } = await import('../src/ingest/embeddings.js');
      const mockEmbedder = vi.mocked(getEmbedder());
      mockEmbedder.embed.mockRejectedValueOnce(new Error('Embedding service down'));

      const doc: DocumentInput = {
        source: 'file',
        uri: 'test://error.txt',
        hash: 'error123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extraJson: null,
      };
      const docId = await indexer.upsertDocument(doc);
      await indexer.insertChunks(docId, [{ content: 'Test content' }]);

      await expect(indexer.embedNewChunks()).rejects.toThrow('Embedding service down');
    });
  });
});
