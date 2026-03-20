import { Client } from 'pg';
import { GenericContainer } from 'testcontainers';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { PostgresAdapter } from '../../src/ingest/adapters/postgresql.js';
import { VectorChordAdapter } from '../../src/ingest/adapters/vectorchord.js';

import type { DocumentInput, ChunkInput } from '../../src/shared/types.js';
import type { StartedTestContainer } from 'testcontainers';

async function waitForPostgres(connectionString: string, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = new Client({ connectionString });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`PostgreSQL not ready after ${maxRetries} retries`);
}

const defaultVcConfig = {
  embeddingDim: 4,
  residualQuantization: true,
  lists: 4,
  sphericalCentroids: true,
  buildThreads: 1,
  probes: 10,
};

describe('VectorChord Integration Tests', () => {
  let container: StartedTestContainer;
  let adapter: VectorChordAdapter;
  let connectionString: string;

  beforeAll(async () => {
    container = await new GenericContainer('tensorchord/vchord-suite:pg17-latest')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_DB: 'testdb',
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
      })
      .withStartupTimeout(120000)
      .start();

    connectionString = `postgresql://testuser:testpass@${container.getHost()}:${container.getMappedPort(5432)}/testdb`;
    await waitForPostgres(connectionString);

    adapter = new VectorChordAdapter({
      connectionString,
      ...defaultVcConfig,
    });

    await adapter.init();
  }, 120000);

  afterAll(async () => {
    await adapter?.close();
    await container?.stop();
  });

  describe('Document Operations', () => {
    it('should upsert and retrieve documents', async () => {
      const doc: DocumentInput = {
        source: 'file',
        uri: 'file:///vc-test.md',
        repo: 'test-repo',
        path: 'vc-test.md',
        title: 'VectorChord Test Document',
        lang: 'md',
        hash: 'vchash123',
        mtime: Date.now(),
        version: '1.0',
        extraJson: JSON.stringify({ test: true }),
      };

      const docId = await adapter.upsertDocument(doc);
      expect(docId).toBeGreaterThan(0);

      const retrieved = await adapter.getDocument(doc.uri as string);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.hash).toBe(doc.hash);
    });

    it('should update document with different hash', async () => {
      const doc: DocumentInput = {
        source: 'file',
        uri: 'file:///vc-update-test.md',
        repo: 'test-repo',
        path: 'vc-update-test.md',
        title: 'Update Test',
        lang: 'md',
        hash: 'original-hash',
        mtime: Date.now(),
        version: '1.0',
        extraJson: null,
      };

      const docId = await adapter.upsertDocument(doc);
      const updatedDoc = { ...doc, hash: 'updated-hash' };
      const docId2 = await adapter.upsertDocument(updatedDoc);
      expect(docId2).toBe(docId);

      const retrieved = await adapter.getDocument(doc.uri as string);
      expect(retrieved!.hash).toBe('updated-hash');
    });
  });

  describe('Chunk Operations', () => {
    let testDocId: number;

    beforeAll(async () => {
      const doc: DocumentInput = {
        source: 'file',
        uri: 'file:///vc-chunks-test.md',
        repo: 'test-repo',
        path: 'vc-chunks-test.md',
        title: 'VectorChord Chunks Test',
        lang: 'md',
        hash: 'vcchunks123',
        mtime: Date.now(),
        version: '1.0',
        extraJson: null,
      };
      testDocId = await adapter.upsertDocument(doc);
    });

    it('should insert and retrieve chunks', async () => {
      const chunks: ChunkInput[] = [
        {
          content: 'VectorChord uses RaBitQ compression for efficient vector storage.',
          startLine: 1,
          endLine: 3,
          tokenCount: 10,
        },
        {
          content: 'The vchordrq index type provides high-performance vector search.',
          startLine: 4,
          endLine: 6,
          tokenCount: 10,
        },
        {
          content: 'Hierarchical K-means clustering enables fast index construction.',
          startLine: 7,
          endLine: 9,
          tokenCount: 9,
        },
      ];

      await adapter.insertChunks(testDocId, chunks);

      const hasChunks = await adapter.hasChunks(testDocId);
      expect(hasChunks).toBe(true);

      const chunksToEmbed = await adapter.getChunksToEmbed();
      expect(chunksToEmbed.length).toBeGreaterThanOrEqual(3);
    });

    it('should retrieve chunk content with metadata', async () => {
      const chunksToEmbed = await adapter.getChunksToEmbed();
      const firstChunk = chunksToEmbed[0];
      expect(firstChunk).toBeDefined();

      const chunkContent = await adapter.getChunkContent(firstChunk!.id);
      expect(chunkContent).not.toBeNull();
      expect(chunkContent!.source).toBe('file');
    });

    it('should handle empty chunks insertion', async () => {
      await expect(adapter.insertChunks(testDocId, [])).resolves.not.toThrow();
    });

    it('should insert, update, and delete individual chunks', async () => {
      const chunk: ChunkInput = {
        content: 'Individual chunk for update/delete test.',
        startLine: 100,
        endLine: 102,
        tokenCount: 7,
      };

      await adapter.insertChunk(testDocId, chunk, 99);

      const docChunks = await adapter.getDocumentChunks(testDocId);
      const insertedChunk = docChunks.find((c) => c.content === chunk.content);
      expect(insertedChunk).toBeDefined();

      await adapter.updateChunk(insertedChunk!.id, {
        content: 'Updated individual chunk content.',
        startLine: 100,
        endLine: 103,
        tokenCount: 5,
      });

      const updatedContent = await adapter.getChunkContent(insertedChunk!.id);
      expect(updatedContent!.content).toBe('Updated individual chunk content.');

      await adapter.deleteChunk(insertedChunk!.id);
      const deleted = await adapter.getChunkContent(insertedChunk!.id);
      expect(deleted).toBeNull();
    });
  });

  describe('Vector Operations', () => {
    let testChunks: Array<{ id: number; content: string }>;

    beforeAll(async () => {
      testChunks = await adapter.getChunksToEmbed();
      expect(testChunks.length).toBeGreaterThan(0);
    });

    it('should insert embeddings and create vchordrq index', async () => {
      const embeddings = testChunks.map((chunk, index) => ({
        id: chunk.id,
        embedding: [0.1 + index * 0.1, 0.2 + index * 0.1, 0.3 + index * 0.1, 0.4 + index * 0.1],
      }));

      await adapter.insertEmbeddings(embeddings);

      const chunksStillNeedingEmbeddings = await adapter.getChunksToEmbed();
      expect(chunksStillNeedingEmbeddings).toHaveLength(0);

      // Verify vchordrq index was created
      const client = new Client({ connectionString });
      await client.connect();
      try {
        const indexResult = await client.query(`
          SELECT indexname, indexdef FROM pg_indexes
          WHERE indexname = 'idx_chunk_embeddings_vchordrq'
        `);
        expect(indexResult.rows).toHaveLength(1);
        expect(indexResult.rows[0].indexdef).toContain('vchordrq');
      } finally {
        await client.end();
      }
    });

    it('should perform vector search with ranked results', async () => {
      const queryEmbedding = [0.15, 0.25, 0.35, 0.45];
      const searchResults = await adapter.vectorSearch(queryEmbedding, 5, {});

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0]!.score).toBeGreaterThanOrEqual(0);

      const hasTestChunk = searchResults.some((result) =>
        testChunks.some((chunk) => result.snippet.includes(chunk.content.substring(0, 15))),
      );
      expect(hasTestChunk).toBe(true);
    });

    it('should support filtered vector search', async () => {
      const queryEmbedding = [0.25, 0.35, 0.45, 0.55];

      const filteredResults = await adapter.vectorSearch(queryEmbedding, 5, {
        source: 'file',
        repo: 'test-repo',
      });

      expect(filteredResults.length).toBeGreaterThan(0);
      expect(filteredResults.every((r) => r.source === 'file')).toBe(true);
      expect(filteredResults.every((r) => r.repo === 'test-repo')).toBe(true);

      const noResults = await adapter.vectorSearch(queryEmbedding, 5, {
        source: 'nonexistent',
      });
      expect(noResults).toHaveLength(0);
    });
  });

  describe('Full-Text Search', () => {
    it('should perform keyword search', async () => {
      const results = await adapter.keywordSearch('RaBitQ compression', 5, {});

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.score).toBeGreaterThan(0);
    });

    it('should support filtered keyword search', async () => {
      const results = await adapter.keywordSearch('vector', 5, {
        source: 'file',
        pathPrefix: 'vc-chunks',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.path?.startsWith('vc-chunks'))).toBe(true);
    });

    it('should handle empty search results', async () => {
      const results = await adapter.keywordSearch('nonexistentterm', 5, {});
      expect(results).toHaveLength(0);
    });
  });

  describe('Metadata Operations', () => {
    it('should store and retrieve metadata', async () => {
      const key = 'vc.test.lastSync';
      const value = new Date().toISOString();

      await adapter.setMeta(key, value);
      const retrieved = await adapter.getMeta(key);
      expect(retrieved).toBe(value);

      const newValue = new Date(Date.now() + 1000).toISOString();
      await adapter.setMeta(key, newValue);
      const updated = await adapter.getMeta(key);
      expect(updated).toBe(newValue);
    });

    it('should return undefined for non-existent metadata', async () => {
      const retrieved = await adapter.getMeta('nonexistent.key');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up document chunks and embeddings', async () => {
      const doc: DocumentInput = {
        source: 'file',
        uri: 'file:///vc-cleanup-test.md',
        repo: 'test-repo',
        path: 'vc-cleanup-test.md',
        title: 'Cleanup Test',
        lang: 'md',
        hash: 'vccleanup123',
        mtime: Date.now(),
        version: '1.0',
        extraJson: null,
      };

      const docId = await adapter.upsertDocument(doc);

      const chunks: ChunkInput[] = [
        { content: 'VectorChord cleanup test content', startLine: 1, endLine: 1, tokenCount: 5 },
      ];
      await adapter.insertChunks(docId, chunks);

      const chunksToEmbed = await adapter.getChunksToEmbed();
      const embeddings = chunksToEmbed
        .filter((c) => c.content === 'VectorChord cleanup test content')
        .map((chunk) => ({
          id: chunk.id,
          embedding: [0.1, 0.2, 0.3, 0.4],
        }));

      if (embeddings.length > 0) {
        await adapter.insertEmbeddings(embeddings);
      }

      expect(await adapter.hasChunks(docId)).toBe(true);

      await adapter.cleanupDocumentChunks(docId);

      expect(await adapter.hasChunks(docId)).toBe(false);
    });
  });

  describe('Database Schema', () => {
    it('should create vchord extension', async () => {
      const client = new Client({ connectionString });
      await client.connect();

      try {
        const extensionResult = await client.query(
          "SELECT * FROM pg_extension WHERE extname = 'vchord'",
        );
        expect(extensionResult.rows).toHaveLength(1);

        // vector extension should also be present (via CASCADE)
        const vectorExtResult = await client.query(
          "SELECT * FROM pg_extension WHERE extname = 'vector'",
        );
        expect(vectorExtResult.rows).toHaveLength(1);
      } finally {
        await client.end();
      }
    });

    it('should create required tables', async () => {
      const client = new Client({ connectionString });
      await client.connect();

      try {
        const tablesResult = await client.query(`
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename IN ('documents', 'chunks', 'chunk_embeddings', 'meta')
          ORDER BY tablename
        `);

        expect(tablesResult.rows).toHaveLength(4);
        expect(tablesResult.rows.map((r) => r.tablename)).toEqual([
          'chunk_embeddings',
          'chunks',
          'documents',
          'meta',
        ]);
      } finally {
        await client.end();
      }
    });
  });
});

describe('VectorChord vs PostgreSQL Adapter Comparison', () => {
  let vcContainer: StartedTestContainer;
  let pgContainer: StartedTestContainer;
  let vcAdapter: VectorChordAdapter;
  let pgAdapter: PostgresAdapter;

  beforeAll(async () => {
    // Start both containers in parallel
    [vcContainer, pgContainer] = await Promise.all([
      new GenericContainer('tensorchord/vchord-suite:pg17-latest')
        .withExposedPorts(5432)
        .withEnvironment({
          POSTGRES_DB: 'vcdb',
          POSTGRES_USER: 'testuser',
          POSTGRES_PASSWORD: 'testpass',
        })
        .withStartupTimeout(120000)
        .start(),
      new GenericContainer('pgvector/pgvector:pg16')
        .withExposedPorts(5432)
        .withEnvironment({
          POSTGRES_DB: 'pgdb',
          POSTGRES_USER: 'testuser',
          POSTGRES_PASSWORD: 'testpass',
        })
        .withStartupTimeout(120000)
        .start(),
    ]);

    const vcConnStr = `postgresql://testuser:testpass@${vcContainer.getHost()}:${vcContainer.getMappedPort(5432)}/vcdb`;
    const pgConnStr = `postgresql://testuser:testpass@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/pgdb`;

    // Wait for both databases to be fully ready
    await Promise.all([waitForPostgres(vcConnStr), waitForPostgres(pgConnStr)]);

    vcAdapter = new VectorChordAdapter({
      connectionString: vcConnStr,
      ...defaultVcConfig,
    });

    pgAdapter = new PostgresAdapter({
      connectionString: pgConnStr,
      embeddingDim: 4,
    });

    await Promise.all([vcAdapter.init(), pgAdapter.init()]);
  }, 120000);

  afterAll(async () => {
    await vcAdapter?.close();
    await pgAdapter?.close();
    await vcContainer?.stop();
    await pgContainer?.stop();
  });

  it('should produce equivalent results for identical operations', async () => {
    const doc: DocumentInput = {
      source: 'file',
      uri: 'file:///comparison-test.md',
      repo: 'test-repo',
      path: 'comparison-test.md',
      title: 'Comparison Test',
      lang: 'md',
      hash: 'compare123',
      mtime: Date.now(),
      version: '1.0',
      extraJson: null,
    };

    const [vcDocId, pgDocId] = await Promise.all([
      vcAdapter.upsertDocument(doc),
      pgAdapter.upsertDocument(doc),
    ]);
    expect(vcDocId).toBeGreaterThan(0);
    expect(pgDocId).toBeGreaterThan(0);

    const chunks: ChunkInput[] = [
      {
        content: 'Vector search comparison between adapters for testing.',
        startLine: 1,
        endLine: 2,
        tokenCount: 8,
      },
      {
        content: 'Database indexing strategies and performance benchmarks.',
        startLine: 3,
        endLine: 4,
        tokenCount: 7,
      },
    ];

    await Promise.all([
      vcAdapter.insertChunks(vcDocId, chunks),
      pgAdapter.insertChunks(pgDocId, chunks),
    ]);

    const [vcHasChunks, pgHasChunks] = await Promise.all([
      vcAdapter.hasChunks(vcDocId),
      pgAdapter.hasChunks(pgDocId),
    ]);
    expect(vcHasChunks).toBe(true);
    expect(pgHasChunks).toBe(true);

    const [vcChunksToEmbed, pgChunksToEmbed] = await Promise.all([
      vcAdapter.getChunksToEmbed(),
      pgAdapter.getChunksToEmbed(),
    ]);
    expect(vcChunksToEmbed).toHaveLength(2);
    expect(pgChunksToEmbed).toHaveLength(2);

    const vcEmbeddings = vcChunksToEmbed.map((c, i) => ({
      id: c.id,
      embedding: [0.1 + i * 0.1, 0.2 + i * 0.1, 0.3 + i * 0.1, 0.4 + i * 0.1],
    }));
    const pgEmbeddings = pgChunksToEmbed.map((c, i) => ({
      id: c.id,
      embedding: [0.1 + i * 0.1, 0.2 + i * 0.1, 0.3 + i * 0.1, 0.4 + i * 0.1],
    }));

    await Promise.all([
      vcAdapter.insertEmbeddings(vcEmbeddings),
      pgAdapter.insertEmbeddings(pgEmbeddings),
    ]);

    const queryEmbedding = [0.15, 0.25, 0.35, 0.45];
    const [vcResults, pgResults] = await Promise.all([
      vcAdapter.vectorSearch(queryEmbedding, 5, {}),
      pgAdapter.vectorSearch(queryEmbedding, 5, {}),
    ]);

    // Both should return results
    expect(vcResults.length).toBeGreaterThan(0);
    expect(pgResults.length).toBeGreaterThan(0);
    expect(vcResults).toHaveLength(pgResults.length);

    // Both should return the same documents (by content)
    const vcSnippets = vcResults.map((r) => r.snippet).sort();
    const pgSnippets = pgResults.map((r) => r.snippet).sort();
    expect(vcSnippets).toEqual(pgSnippets);

    // Keyword search comparison
    const [vcKeyword, pgKeyword] = await Promise.all([
      vcAdapter.keywordSearch('vector search', 5, {}),
      pgAdapter.keywordSearch('vector search', 5, {}),
    ]);

    expect(vcKeyword.length).toBeGreaterThan(0);
    expect(pgKeyword.length).toBeGreaterThan(0);

    const vcKeySnippets = vcKeyword.map((r) => r.snippet).sort();
    const pgKeySnippets = pgKeyword.map((r) => r.snippet).sort();
    expect(vcKeySnippets).toEqual(pgKeySnippets);

    // Metadata comparison
    await Promise.all([
      vcAdapter.setMeta('compare.key', 'compare-value'),
      pgAdapter.setMeta('compare.key', 'compare-value'),
    ]);

    const [vcMeta, pgMeta] = await Promise.all([
      vcAdapter.getMeta('compare.key'),
      pgAdapter.getMeta('compare.key'),
    ]);
    expect(vcMeta).toBe(pgMeta);
  });
});
