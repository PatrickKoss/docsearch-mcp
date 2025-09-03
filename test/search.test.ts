import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { testDbPath } from './setup.js';
import { SqliteAdapter } from '../src/ingest/adapters/sqlite.js';
import { Indexer } from '../src/ingest/indexer.js';
import { performSearch } from '../src/ingest/search.js';

import type { DocumentInput, ChunkInput } from '../src/infrastructure/database/legacy-types.js';
import type { SearchParams } from '../src/ingest/search.js';

// Mock the embeddings module since we don't want to make real API calls in tests
vi.mock('../src/ingest/embeddings.js', () => ({
  getEmbedder: () => ({
    embed: vi.fn().mockResolvedValue([Array(1536).fill(0.1)]),
  }),
}));

describe('Search', () => {
  let adapter: SqliteAdapter;
  let indexer: Indexer;

  beforeEach(async () => {
    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();
    indexer = new Indexer(adapter);

    const docs: DocumentInput[] = [
      {
        source: 'file',
        uri: 'test://doc1.ts',
        repo: 'project-a',
        path: 'src/utils/doc1.ts',
        title: 'Document 1',
        lang: 'typescript',
        hash: 'hash1',
        mtime: Date.now(),
        version: '1.0',
        extraJson: null,
      },
      {
        source: 'confluence',
        uri: 'confluence://page1',
        repo: 'wiki',
        path: 'docs/page1',
        title: 'Confluence Page',
        hash: 'hash2',
        mtime: Date.now(),
        version: '2.0',
        lang: 'md',
        extraJson: null,
      },
      {
        source: 'file',
        uri: 'test://doc2.py',
        repo: 'project-b',
        path: 'src/main.py',
        title: 'Python Script',
        lang: 'python',
        hash: 'hash3',
        mtime: Date.now(),
        version: '1.5',
        extraJson: null,
      },
    ];

    const chunks: ChunkInput[][] = [
      [
        {
          content:
            'function searchFiles(query: string) { return files.filter(f => f.includes(query)); }',
          startLine: 1,
          endLine: 3,
        },
        {
          content: 'export const DATABASE_URL = "postgresql://localhost:5432/mydb";',
          startLine: 5,
          endLine: 5,
        },
      ],
      [
        {
          content:
            'This page describes how to search through documentation and find relevant information.',
          startLine: 1,
          endLine: 1,
        },
        {
          content: 'The search functionality supports both keyword and semantic search modes.',
          startLine: 3,
          endLine: 3,
        },
      ],
      [
        {
          content: 'def search_data(query, database): return database.query(query)',
          startLine: 1,
          endLine: 1,
        },
        { content: 'import sqlite3 as db', startLine: 5, endLine: 5 },
      ],
    ];

    for (let i = 0; i < docs.length; i++) {
      const docId = await indexer.upsertDocument(docs[i]!);
      await indexer.insertChunks(docId, chunks[i]!);
    }
  });

  afterEach(async () => {
    await adapter?.close();
  });

  describe('performSearch', () => {
    it('should perform search with default parameters', async () => {
      const params: SearchParams = { query: 'search' };
      const results = await performSearch(adapter, params);

      expect(Array.isArray(results)).toBe(true);
      // Results may be empty if no embeddings are inserted, but should not error
    });

    it('should respect topK parameter', async () => {
      const params: SearchParams = { query: 'function', topK: 1 };
      const results = await performSearch(adapter, params);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should apply source filter', async () => {
      const params: SearchParams = {
        query: 'search',
        source: 'file',
      };
      const results = await performSearch(adapter, params);

      // All results should be from 'file' source
      results.forEach((result) => {
        expect(result.source).toBe('file');
      });
    });

    it('should apply repo filter', async () => {
      const params: SearchParams = {
        query: 'search',
        repo: 'project-a',
      };
      const results = await performSearch(adapter, params);

      // All results should be from 'project-a' repo
      results.forEach((result) => {
        expect(result.repo).toBe('project-a');
      });
    });

    it('should apply path prefix filter', async () => {
      const params: SearchParams = {
        query: 'function',
        pathPrefix: 'src/',
      };
      const results = await performSearch(adapter, params);

      // All results should have paths starting with 'src/'
      results.forEach((result) => {
        if (result.path) {
          expect(result.path).toMatch(/^src\//);
        }
      });
    });

    it('should support keyword mode', async () => {
      const params: SearchParams = {
        query: 'search',
        mode: 'keyword',
      };
      const results = await performSearch(adapter, params);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should support vector mode', async () => {
      const params: SearchParams = {
        query: 'database',
        mode: 'vector',
      };
      const results = await performSearch(adapter, params);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Search result validation', () => {
    it('should return well-formed search results', async () => {
      const params: SearchParams = { query: 'search', mode: 'keyword' };
      const results = await performSearch(adapter, params);

      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        const firstResult = results[0];
        expect(firstResult).toHaveProperty('chunk_id');
        expect(firstResult).toHaveProperty('score');
        expect(firstResult).toHaveProperty('document_id');
        expect(firstResult).toHaveProperty('source');
        expect(firstResult).toHaveProperty('uri');
        expect(firstResult).toHaveProperty('snippet');
      }
    });

    it('should return snippet with limited length', async () => {
      const params: SearchParams = { query: 'function', mode: 'keyword' };
      const results = await performSearch(adapter, params);

      if (results.length > 0) {
        const result = results[0];
        expect(result!.snippet).toBeTruthy();
        expect(result!.snippet.length).toBeLessThanOrEqual(400);
      }
    });

    it('should include line numbers when available', async () => {
      const params: SearchParams = { query: 'function', mode: 'keyword' };
      const results = await performSearch(adapter, params);

      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty('start_line');
        expect(result).toHaveProperty('end_line');

        if (result!.start_line !== null) {
          expect(typeof result!.start_line).toBe('number');
          expect(result!.start_line).toBeGreaterThan(0);
        }
      }
    });

    it('should handle empty query results', async () => {
      const params: SearchParams = { query: 'nonexistentterm12345', mode: 'keyword' };
      const results = await performSearch(adapter, params);

      expect(results).toEqual([]);
    });
  });

  describe('Security and error handling', () => {
    it('should handle special characters in query safely', async () => {
      const params: SearchParams = {
        query: "'; DROP TABLE documents; --",
        mode: 'keyword',
      };

      // FTS5 should reject malformed queries with special characters - this is the safe behavior
      // It prevents any SQL injection by throwing an error on invalid FTS5 syntax
      await expect(performSearch(adapter, params)).rejects.toThrow(/fts5: syntax error/);

      // Verify the table still exists (injection attempt failed)
      // @ts-expect-error - accessing private property for testing
      const tableExists = adapter.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'")
        .get();
      expect(tableExists).toBeTruthy();
    });

    it('should handle special characters in filters safely', async () => {
      const params: SearchParams = {
        query: 'test',
        repo: "'; DROP TABLE documents; --",
        pathPrefix: '../../../etc/passwd',
        mode: 'keyword',
      };

      // Should not throw - parameterized queries protect against injection in filters
      await expect(performSearch(adapter, params)).resolves.not.toThrow();
    });
  });
});
