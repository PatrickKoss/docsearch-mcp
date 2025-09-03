import fs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { PostgresAdapter } from '../../src/ingest/adapters/postgresql.js';
import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';

import type { DocumentInput, ChunkInput } from '../../src/shared/types.js';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('Database Adapter Comparison Tests', () => {
  let container: StartedPostgreSqlContainer;
  let sqliteAdapter: SqliteAdapter;
  let postgresAdapter: PostgresAdapter;
  let tempDbPath: string;

  const testDoc: DocumentInput = {
    source: 'file',
    uri: 'file:///comparison-test.md',
    repo: 'test-repo',
    path: 'comparison-test.md',
    title: 'Comparison Test Document',
    lang: 'md',
    hash: 'comparison123',
    mtime: Date.now(),
    version: '1.0',
    extraJson: JSON.stringify({ test: 'comparison' }),
  };

  const testChunks: ChunkInput[] = [
    {
      content:
        'Machine learning algorithms and data structures are fundamental to modern computing.',
      startLine: 1,
      endLine: 1,
      tokenCount: 12,
    },
    {
      content:
        'Database indexing strategies improve query performance significantly in large datasets.',
      startLine: 2,
      endLine: 2,
      tokenCount: 11,
    },
    {
      content:
        'Vector similarity search enables semantic understanding in information retrieval systems.',
      startLine: 3,
      endLine: 3,
      tokenCount: 10,
    },
  ];

  const testEmbeddings = [
    [0.1, 0.2, 0.3, 0.4, 0.5],
    [0.2, 0.3, 0.4, 0.5, 0.6],
    [0.3, 0.4, 0.5, 0.6, 0.7],
  ];

  beforeAll(async () => {
    // Set up PostgreSQL container
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withExposedPorts(5432)
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .start();

    const connectionString = `postgresql://testuser:testpass@${container.getHost()}:${container.getMappedPort(5432)}/testdb`;

    // Set up PostgreSQL adapter
    postgresAdapter = new PostgresAdapter({
      connectionString,
      embeddingDim: 5,
    });
    await postgresAdapter.init();

    // Set up SQLite adapter
    tempDbPath = path.join(tmpdir(), `test-${Date.now()}.db`);
    sqliteAdapter = new SqliteAdapter({
      path: tempDbPath,
      embeddingDim: 5,
    });
    await sqliteAdapter.init();
  }, 60000);

  afterAll(async () => {
    await postgresAdapter?.close();
    await sqliteAdapter?.close();
    await container?.stop();

    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  // Test SQLite Adapter
  describe('SQLite Adapter', () => {
    let docId: number;

    it('should handle document operations consistently', async () => {
      // Insert document
      docId = await sqliteAdapter.upsertDocument(testDoc);
      expect(docId).toBeGreaterThan(0);

      // Retrieve document
      const retrieved = await sqliteAdapter.getDocument(testDoc.uri as string);
      expect(retrieved).not.toBeNull();
      if (retrieved) {
        expect(retrieved.hash).toBe(testDoc.hash);
      }

      // Check no chunks initially
      const hasChunks = await sqliteAdapter.hasChunks(docId);
      expect(hasChunks).toBe(false);
    });

    it('should handle chunk operations consistently', async () => {
      // Insert chunks
      await sqliteAdapter.insertChunks(docId, testChunks);

      // Verify chunks exist
      const hasChunks = await sqliteAdapter.hasChunks(docId);
      expect(hasChunks).toBe(true);

      // Get chunks needing embeddings
      const chunksToEmbed = await sqliteAdapter.getChunksToEmbed();
      expect(chunksToEmbed.length).toBeGreaterThanOrEqual(testChunks.length);

      // Verify chunk content retrieval
      const relevantChunks = chunksToEmbed.filter((c) =>
        testChunks.some((tc) => tc.content === c.content),
      );
      expect(relevantChunks.length).toBeGreaterThan(0);

      const firstChunk = relevantChunks[0]!;
      const chunkContent = await sqliteAdapter.getChunkContent(firstChunk.id);
      expect(chunkContent).not.toBeNull();
      if (chunkContent) {
        expect(chunkContent.content).toBe(firstChunk.content);
        expect(chunkContent.source).toBe('file');
      }
    });

    it('should handle embedding operations consistently', async () => {
      const chunksToEmbed = await sqliteAdapter.getChunksToEmbed();
      const relevantChunks = chunksToEmbed.filter((c) =>
        testChunks.some((tc) => tc.content === c.content),
      );

      const embeddings = relevantChunks.map((chunk, index) => ({
        id: chunk.id,
        embedding: testEmbeddings[index] || testEmbeddings[0]!,
      }));

      // Insert embeddings
      await sqliteAdapter.insertEmbeddings(embeddings as { id: number; embedding: number[] }[]);

      // Verify no more chunks need embeddings for our test chunks
      const remainingChunks = await sqliteAdapter.getChunksToEmbed();
      const remainingRelevant = remainingChunks.filter((c) =>
        testChunks.some((tc) => tc.content === c.content),
      );
      expect(remainingRelevant).toHaveLength(0);
    });

    it('should handle search operations consistently', async () => {
      // Test keyword search
      const keywordResults = await sqliteAdapter.keywordSearch('machine learning', 5, {});
      expect(keywordResults.length).toBeGreaterThan(0);
      expect(keywordResults[0]!.snippet).toMatch(/machine learning/i);

      // Test vector search
      const queryEmbedding = [0.15, 0.25, 0.35, 0.45, 0.55];
      const vectorResults = await sqliteAdapter.vectorSearch(queryEmbedding, 5, {});
      expect(vectorResults.length).toBeGreaterThan(0);
      expect(vectorResults[0]!.score).toBeGreaterThan(0);

      // Test filtered search
      const filteredResults = await sqliteAdapter.keywordSearch('database', 5, {
        source: 'file',
        repo: 'test-repo',
      });
      expect(filteredResults.every((r) => r.source === 'file')).toBe(true);
    });

    it('should handle metadata operations consistently', async () => {
      const key = 'sqlite.test';
      const value = 'test-value';

      await sqliteAdapter.setMeta(key, value);
      const retrieved = await sqliteAdapter.getMeta(key);
      expect(retrieved).toBe(value);

      // Test non-existent key
      const nonExistent = await sqliteAdapter.getMeta('nonexistent');
      expect(nonExistent).toBeUndefined();
    });
  });

  // Test PostgreSQL Adapter
  describe('PostgreSQL Adapter', () => {
    let docId: number;

    it('should handle document operations consistently', async () => {
      // Insert document
      docId = await postgresAdapter.upsertDocument(testDoc);
      expect(docId).toBeGreaterThan(0);

      // Retrieve document
      const retrieved = await postgresAdapter.getDocument(testDoc.uri as string);
      expect(retrieved).not.toBeNull();
      if (retrieved) {
        expect(retrieved.hash).toBe(testDoc.hash);
      }

      // Check no chunks initially
      const hasChunks = await postgresAdapter.hasChunks(docId);
      expect(hasChunks).toBe(false);
    });

    it('should handle chunk operations consistently', async () => {
      // Insert chunks
      await postgresAdapter.insertChunks(docId, testChunks);

      // Verify chunks exist
      const hasChunks = await postgresAdapter.hasChunks(docId);
      expect(hasChunks).toBe(true);

      // Get chunks needing embeddings
      const chunksToEmbed = await postgresAdapter.getChunksToEmbed();
      expect(chunksToEmbed.length).toBeGreaterThanOrEqual(testChunks.length);

      // Verify chunk content retrieval
      const relevantChunks = chunksToEmbed.filter((c) =>
        testChunks.some((tc) => tc.content === c.content),
      );
      expect(relevantChunks.length).toBeGreaterThan(0);

      const firstChunk = relevantChunks[0]!;
      const chunkContent = await postgresAdapter.getChunkContent(firstChunk.id);
      expect(chunkContent).not.toBeNull();
      if (chunkContent) {
        expect(chunkContent.content).toBe(firstChunk.content);
        expect(chunkContent.source).toBe('file');
      }
    });

    it('should handle embedding operations consistently', async () => {
      const chunksToEmbed = await postgresAdapter.getChunksToEmbed();
      const relevantChunks = chunksToEmbed.filter((c) =>
        testChunks.some((tc) => tc.content === c.content),
      );

      const embeddings = relevantChunks.map((chunk, index) => ({
        id: chunk.id,
        embedding: testEmbeddings[index] || testEmbeddings[0]!,
      }));

      // Insert embeddings
      await postgresAdapter.insertEmbeddings(embeddings as { id: number; embedding: number[] }[]);

      // Verify no more chunks need embeddings for our test chunks
      const remainingChunks = await postgresAdapter.getChunksToEmbed();
      const remainingRelevant = remainingChunks.filter((c) =>
        testChunks.some((tc) => tc.content === c.content),
      );
      expect(remainingRelevant).toHaveLength(0);
    });

    it('should handle search operations consistently', async () => {
      // Test keyword search
      const keywordResults = await postgresAdapter.keywordSearch('machine learning', 5, {});
      expect(keywordResults.length).toBeGreaterThan(0);
      expect(keywordResults[0]!.snippet).toMatch(/machine learning/i);

      // Test vector search
      const queryEmbedding = [0.15, 0.25, 0.35, 0.45, 0.55];
      const vectorResults = await postgresAdapter.vectorSearch(queryEmbedding, 5, {});
      expect(vectorResults.length).toBeGreaterThan(0);
      expect(vectorResults[0]!.score).toBeGreaterThan(0);

      // Test filtered search
      const filteredResults = await postgresAdapter.keywordSearch('database', 5, {
        source: 'file',
        repo: 'test-repo',
      });
      expect(filteredResults.every((r) => r.source === 'file')).toBe(true);
    });

    it('should handle metadata operations consistently', async () => {
      const key = 'postgresql.test';
      const value = 'test-value';

      await postgresAdapter.setMeta(key, value);
      const retrieved = await postgresAdapter.getMeta(key);
      expect(retrieved).toBe(value);

      // Test non-existent key
      const nonExistent = await postgresAdapter.getMeta('nonexistent');
      expect(nonExistent).toBeUndefined();
    });
  });

  describe('Cross-Adapter Consistency', () => {
    it('should produce similar search results across both adapters', async () => {
      // Set up identical data in both adapters
      const sqliteDocId = await sqliteAdapter.upsertDocument({
        ...testDoc,
        uri: 'file:///cross-test.md',
      });
      const postgresDocId = await postgresAdapter.upsertDocument({
        ...testDoc,
        uri: 'file:///cross-test.md',
      });

      await sqliteAdapter.insertChunks(sqliteDocId, testChunks);
      await postgresAdapter.insertChunks(postgresDocId, testChunks);

      // Add embeddings to both
      const sqliteChunks = await sqliteAdapter.getChunksToEmbed();
      const postgresChunks = await postgresAdapter.getChunksToEmbed();

      const sqliteEmbeddings = sqliteChunks
        .filter((c) => testChunks.some((tc) => tc.content === c.content))
        .map((chunk, index) => ({
          id: chunk.id,
          embedding: testEmbeddings[index % testEmbeddings.length]!,
        }));

      const postgresEmbeddings = postgresChunks
        .filter((c) => testChunks.some((tc) => tc.content === c.content))
        .map((chunk, index) => ({
          id: chunk.id,
          embedding: testEmbeddings[index % testEmbeddings.length]!,
        }));

      await sqliteAdapter.insertEmbeddings(sqliteEmbeddings);
      await postgresAdapter.insertEmbeddings(postgresEmbeddings);

      // Compare keyword search results
      const sqliteKeywordResults = await sqliteAdapter.keywordSearch('algorithms data', 3, {});
      const postgresKeywordResults = await postgresAdapter.keywordSearch('algorithms data', 3, {});

      expect(sqliteKeywordResults.length).toBeGreaterThan(0);
      expect(postgresKeywordResults.length).toBeGreaterThan(0);

      // Both should find the chunk with "algorithms" and "data"
      const sqliteFoundRelevant = sqliteKeywordResults.some(
        (r) => r.snippet.includes('algorithms') && r.snippet.includes('data'),
      );
      const postgresFoundRelevant = postgresKeywordResults.some(
        (r) => r.snippet.includes('algorithms') && r.snippet.includes('data'),
      );

      expect(sqliteFoundRelevant).toBe(true);
      expect(postgresFoundRelevant).toBe(true);

      // Compare vector search results (should find similar chunks)
      const queryVector = [0.15, 0.25, 0.35, 0.45, 0.55];
      const sqliteVectorResults = await sqliteAdapter.vectorSearch(queryVector, 3, {});
      const postgresVectorResults = await postgresAdapter.vectorSearch(queryVector, 3, {});

      expect(sqliteVectorResults.length).toBeGreaterThan(0);
      expect(postgresVectorResults.length).toBeGreaterThan(0);

      // Both should return chunks (exact ordering may differ due to different scoring)
      expect(sqliteVectorResults.every((r) => r.score > 0)).toBe(true);
      expect(postgresVectorResults.every((r) => r.score > 0)).toBe(true);
    });

    it('should handle edge cases consistently', async () => {
      // Test empty search
      const sqliteEmpty = await sqliteAdapter.keywordSearch('nonexistentterm12345', 5, {});
      const postgresEmpty = await postgresAdapter.keywordSearch('nonexistentterm12345', 5, {});

      expect(sqliteEmpty).toHaveLength(0);
      expect(postgresEmpty).toHaveLength(0);

      // Test empty embeddings
      await expect(sqliteAdapter.insertEmbeddings([])).resolves.not.toThrow();
      await expect(postgresAdapter.insertEmbeddings([])).resolves.not.toThrow();

      // Test metadata with special characters
      const specialKey = 'test.key.with-special_chars';
      const specialValue = 'value with spaces and símb0ls!';

      await sqliteAdapter.setMeta(specialKey, specialValue);
      await postgresAdapter.setMeta(specialKey, specialValue);

      const sqliteSpecial = await sqliteAdapter.getMeta(specialKey);
      const postgresSpecial = await postgresAdapter.getMeta(specialKey);

      expect(sqliteSpecial).toBe(specialValue);
      expect(postgresSpecial).toBe(specialValue);
    });
  });
});
