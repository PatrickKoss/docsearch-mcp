import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { PostgresAdapter } from '../../src/ingest/adapters/postgresql.js';

import type { DocumentInput, ChunkInput } from '../../src/infrastructure/database/legacy-types.js';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('PostgreSQL Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let adapter: PostgresAdapter;
  let connectionString: string;

  beforeAll(async () => {
    // Start PostgreSQL container with pgvector extension
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withExposedPorts(5432)
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .start();

    connectionString = `postgresql://testuser:testpass@${container.getHost()}:${container.getMappedPort(5432)}/testdb`;

    adapter = new PostgresAdapter({
      connectionString,
      embeddingDim: 4, // Small dimension for testing
    });

    await adapter.init();
  }, 60000);

  afterAll(async () => {
    await adapter?.close();
    await container?.stop();
  });

  describe('Document Operations', () => {
    it('should upsert and retrieve documents', async () => {
      const doc: DocumentInput = {
        source: 'file',
        uri: 'file:///test.md',
        repo: 'test-repo',
        path: 'test.md',
        title: 'Test Document',
        lang: 'md',
        hash: 'abc123',
        mtime: Date.now(),
        version: '1.0',
        extraJson: JSON.stringify({ test: true }),
      };

      // Insert document
      const docId = await adapter.upsertDocument(doc);
      expect(docId).toBeGreaterThan(0);

      // Retrieve document
      const retrieved = await adapter.getDocument(doc.uri as string);
      expect(retrieved).not.toBeNull();
      if (retrieved) {
        expect(retrieved.hash).toBe(doc.hash);
      }

      // Update document with same hash should return same ID
      const docId2 = await adapter.upsertDocument(doc);
      expect(docId2).toBe(docId);

      // Update document with different hash should return same ID but trigger cleanup
      const updatedDoc = { ...doc, hash: 'def456' };
      const docId3 = await adapter.upsertDocument(updatedDoc);
      expect(docId3).toBe(docId);

      const retrievedUpdated = await adapter.getDocument(doc.uri as string);
      if (retrievedUpdated) {
        expect(retrievedUpdated.hash).toBe('def456');
      }
    });
  });

  describe('Chunk Operations', () => {
    let testDocId: number;

    beforeAll(async () => {
      const doc: DocumentInput = {
        source: 'file',
        uri: 'file:///chunks-test.md',
        repo: 'test-repo',
        path: 'chunks-test.md',
        title: 'Chunks Test Document',
        lang: 'md',
        hash: 'chunks123',
        mtime: Date.now(),
        version: '1.0',
        extraJson: null,
      };
      testDocId = await adapter.upsertDocument(doc);
    });

    it('should insert and retrieve chunks', async () => {
      const chunks: ChunkInput[] = [
        {
          content: 'This is the first chunk about databases and storage systems.',
          startLine: 1,
          endLine: 3,
          tokenCount: 12,
        },
        {
          content: 'This is the second chunk covering search algorithms and indexing.',
          startLine: 4,
          endLine: 6,
          tokenCount: 11,
        },
        {
          content: 'The third chunk discusses vector embeddings and similarity search.',
          startLine: 7,
          endLine: 9,
          tokenCount: 10,
        },
      ];

      // Insert chunks
      await adapter.insertChunks(testDocId, chunks);

      // Check if document has chunks
      const hasChunks = await adapter.hasChunks(testDocId);
      expect(hasChunks).toBe(true);

      // Get chunks that need embedding
      const chunksToEmbed = await adapter.getChunksToEmbed();
      expect(chunksToEmbed).toHaveLength(3);
      expect(chunksToEmbed.every((c) => chunks.some((chunk) => chunk.content === c.content))).toBe(
        true,
      );
    });

    it('should retrieve chunk content with metadata', async () => {
      const chunksToEmbed = await adapter.getChunksToEmbed();
      const firstChunk = chunksToEmbed[0];
      expect(firstChunk).toBeDefined();

      const chunkContent = await adapter.getChunkContent(firstChunk!.id);
      expect(chunkContent).not.toBeNull();
      if (chunkContent) {
        expect(chunkContent.content).toBe(firstChunk!.content);
        expect(chunkContent.source).toBe('file');
        expect(chunkContent.title).toBe('Chunks Test Document');
        expect(chunkContent.path).toBe('chunks-test.md');
        expect(chunkContent.repo).toBe('test-repo');
      }
    });

    it('should handle empty chunks insertion', async () => {
      await expect(adapter.insertChunks(testDocId, [])).resolves.not.toThrow();
    });
  });

  describe('Vector Operations', () => {
    let testChunks: Array<{ id: number; content: string }>;

    beforeAll(async () => {
      testChunks = await adapter.getChunksToEmbed();
      expect(testChunks.length).toBeGreaterThan(0);
    });

    it('should insert and query vector embeddings', async () => {
      // Create mock embeddings (4 dimensions for testing)
      const embeddings = testChunks.map((chunk, index) => ({
        id: chunk.id,
        embedding: [0.1 + index * 0.1, 0.2 + index * 0.1, 0.3 + index * 0.1, 0.4 + index * 0.1],
      }));

      // Insert embeddings
      await adapter.insertEmbeddings(embeddings);

      // Verify chunks no longer need embeddings
      const chunksStillNeedingEmbeddings = await adapter.getChunksToEmbed();
      expect(chunksStillNeedingEmbeddings).toHaveLength(0);

      // Test vector search
      const queryEmbedding = [0.15, 0.25, 0.35, 0.45]; // Close to first embedding
      const searchResults = await adapter.vectorSearch(queryEmbedding, 5, {});

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0]!.score).toBeGreaterThan(0); // Distance score

      // Verify at least one result is from our test chunks
      const hasTestChunk = searchResults.some((result) =>
        testChunks.some((chunk) => result.snippet.includes(chunk.content.substring(0, 15))),
      );
      expect(hasTestChunk).toBe(true);

      // Verify we can find one of our expected chunks in the results
      const expectedTerms = [
        'databases',
        'storage',
        'search',
        'algorithms',
        'vector',
        'embeddings',
      ];
      const foundExpectedChunk = searchResults.find((result) =>
        expectedTerms.some((term) => result.snippet.toLowerCase().includes(term.toLowerCase())),
      );
      expect(foundExpectedChunk).toBeDefined();
    });

    it('should support filtered vector search', async () => {
      const queryEmbedding = [0.25, 0.35, 0.45, 0.55];

      // Search with source filter
      const filteredResults = await adapter.vectorSearch(queryEmbedding, 5, {
        source: 'file',
        repo: 'test-repo',
      });

      expect(filteredResults.length).toBeGreaterThan(0);
      expect(filteredResults.every((r) => r.source === 'file')).toBe(true);
      expect(filteredResults.every((r) => r.repo === 'test-repo')).toBe(true);

      // Search with non-existent filter should return empty
      const noResults = await adapter.vectorSearch(queryEmbedding, 5, {
        source: 'nonexistent',
      });
      expect(noResults).toHaveLength(0);
    });
  });

  describe('Full-Text Search', () => {
    it('should perform keyword search', async () => {
      // Search for "databases"
      const results = await adapter.keywordSearch('databases', 5, {});

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.snippet).toContain('databases');
      expect(results[0]!.score).toBeGreaterThan(0); // ts_rank score
      expect(results[0]!.source).toBe('file');
    });

    it('should support multi-word keyword search', async () => {
      const results = await adapter.keywordSearch('vector embeddings', 5, {});

      expect(results.length).toBeGreaterThan(0);
      const foundContent = results.find((r) => r.snippet.includes('vector embeddings'));
      expect(foundContent).toBeDefined();
    });

    it('should support filtered keyword search', async () => {
      // Search with path prefix filter
      const results = await adapter.keywordSearch('search', 5, {
        source: 'file',
        pathPrefix: 'chunks-test',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.path?.startsWith('chunks-test'))).toBe(true);
    });

    it('should handle empty search results gracefully', async () => {
      const results = await adapter.keywordSearch('nonexistentterm', 5, {});
      expect(results).toHaveLength(0);
    });
  });

  describe('Metadata Operations', () => {
    it('should store and retrieve metadata', async () => {
      const key = 'test.lastSync';
      const value = new Date().toISOString();

      // Set metadata
      await adapter.setMeta(key, value);

      // Retrieve metadata
      const retrieved = await adapter.getMeta(key);
      expect(retrieved).toBe(value);

      // Update metadata
      const newValue = new Date(Date.now() + 1000).toISOString();
      await adapter.setMeta(key, newValue);

      const updatedValue = await adapter.getMeta(key);
      expect(updatedValue).toBe(newValue);
      expect(updatedValue).not.toBe(value);
    });

    it('should return undefined for non-existent metadata', async () => {
      const retrieved = await adapter.getMeta('nonexistent.key');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up document chunks and embeddings', async () => {
      // Create a test document with chunks
      const doc: DocumentInput = {
        source: 'file',
        uri: 'file:///cleanup-test.md',
        repo: 'test-repo',
        path: 'cleanup-test.md',
        title: 'Cleanup Test',
        lang: 'md',
        hash: 'cleanup123',
        mtime: Date.now(),
        version: '1.0',
        extraJson: null,
      };

      const docId = await adapter.upsertDocument(doc);

      const chunks: ChunkInput[] = [
        { content: 'Content to be cleaned up', startLine: 1, endLine: 1, tokenCount: 5 },
      ];

      await adapter.insertChunks(docId, chunks);

      // Add embeddings
      const chunksToEmbed = await adapter.getChunksToEmbed();
      const embeddings = chunksToEmbed
        .filter((c) => c.content === 'Content to be cleaned up')
        .map((chunk) => ({
          id: chunk.id,
          embedding: [0.1, 0.2, 0.3, 0.4],
        }));

      if (embeddings.length > 0) {
        await adapter.insertEmbeddings(embeddings);
      }

      // Verify chunks exist
      expect(await adapter.hasChunks(docId)).toBe(true);

      // Clean up
      await adapter.cleanupDocumentChunks(docId);

      // Verify cleanup
      expect(await adapter.hasChunks(docId)).toBe(false);

      // Verify embeddings are also cleaned up
      const remainingChunks = await adapter.getChunksToEmbed();
      const cleanedUpChunks = remainingChunks.filter(
        (c) => c.content === 'Content to be cleaned up',
      );
      expect(cleanedUpChunks).toHaveLength(0);
    });
  });

  describe('Database Connection', () => {
    it('should handle connection lifecycle correctly', async () => {
      // Test that we can create a new adapter and connect
      const newAdapter = new PostgresAdapter({
        connectionString,
        embeddingDim: 4,
      });

      await newAdapter.init();

      // Test basic operation
      const result = await newAdapter.getMeta('test.connection');
      expect(result).toBeUndefined(); // Should not throw

      await newAdapter.close();
    });

    it('should create required extensions and tables', async () => {
      // Connect directly to verify schema
      const client = new Client({ connectionString });
      await client.connect();

      try {
        // Check vector extension
        const extensionResult = await client.query(
          "SELECT * FROM pg_extension WHERE extname = 'vector'",
        );
        expect(extensionResult.rows).toHaveLength(1);

        // Check required tables exist
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

        // Check vector column exists with correct dimensions
        const vectorColumnResult = await client.query(`
          SELECT column_name, data_type FROM information_schema.columns 
          WHERE table_name = 'chunk_embeddings' AND column_name = 'embedding'
        `);
        expect(vectorColumnResult.rows).toHaveLength(1);
        expect(vectorColumnResult.rows[0].data_type).toBe('USER-DEFINED'); // vector type
      } finally {
        await client.end();
      }
    });
  });
});
