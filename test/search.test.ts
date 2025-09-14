import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { testDbPath } from './setup.js';
import { SqliteAdapter } from '../src/ingest/adapters/sqlite.js';
import { Indexer } from '../src/ingest/indexer.js';
import { performSearch } from '../src/ingest/search.js';

import type { SearchParams } from '../src/ingest/search.js';
import type { DocumentInput, ChunkInput } from '../src/shared/types.js';

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
    it('should handle SQL injection attempts safely', async () => {
      const params: SearchParams = {
        query: "'; DROP TABLE documents; --",
        mode: 'keyword',
      };

      // With proper escaping, this should not throw and should be treated as a literal search
      await expect(performSearch(adapter, params)).resolves.not.toThrow();

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

  describe('Special characters in search queries', () => {
    beforeEach(async () => {
      // Add documents with special characters for testing
      const specialDocs: DocumentInput[] = [
        {
          source: 'file',
          uri: 'test://special-chars.md',
          repo: 'test-repo',
          path: 'docs/special-chars.md',
          title: 'Special Characters Test',
          lang: 'markdown',
          hash: 'hash-special',
          mtime: Date.now(),
          version: '1.0',
          extraJson: null,
        },
      ];

      const specialChunks: ChunkInput[] = [
        {
          content: 'What are core components of model-serving?',
          startLine: 1,
          endLine: 1,
          tokenCount: 10,
        },
        {
          content: 'The model-serving system has multiple sub-components.',
          startLine: 2,
          endLine: 2,
          tokenCount: 10,
        },
        {
          content: 'Is this a yes/no question?',
          startLine: 3,
          endLine: 3,
          tokenCount: 8,
        },
        {
          content: 'Use the --verbose flag for more output.',
          startLine: 4,
          endLine: 4,
          tokenCount: 9,
        },
        {
          content: 'The function add(2+3) returns 5.',
          startLine: 5,
          endLine: 5,
          tokenCount: 8,
        },
        {
          content: 'Search for files with *.ts extension.',
          startLine: 6,
          endLine: 6,
          tokenCount: 8,
        },
        {
          content: 'The path is /usr/local/bin:$PATH.',
          startLine: 7,
          endLine: 7,
          tokenCount: 8,
        },
      ];

      for (const doc of specialDocs) {
        const docId = await indexer.upsertDocument(doc);
        await indexer.insertChunks(docId, specialChunks);
      }
    });

    it('should handle queries with hyphens', async () => {
      const params: SearchParams = {
        query: 'model-serving',
        mode: 'keyword',
      };

      const results = await performSearch(adapter, params);
      expect(results.length).toBeGreaterThan(0);

      // Should find documents containing "model-serving"
      const found = results.some((r) => r.snippet.toLowerCase().includes('model-serving'));
      expect(found).toBe(true);
    });

    it('should handle the exact failing query from the bug report', async () => {
      const params: SearchParams = {
        query: 'what are core components of model-serving',
        mode: 'keyword',
      };

      // This should not throw an error
      const results = await performSearch(adapter, params);
      expect(Array.isArray(results)).toBe(true);

      // Should find relevant results
      if (results.length > 0) {
        const found = results.some(
          (r) =>
            r.snippet.toLowerCase().includes('model-serving') ||
            r.snippet.toLowerCase().includes('components'),
        );
        expect(found).toBe(true);
      }
    });

    it('should handle queries with question marks', async () => {
      const params: SearchParams = {
        query: 'yes/no question?',
        mode: 'keyword',
      };

      const results = await performSearch(adapter, params);
      expect(Array.isArray(results)).toBe(true);

      // Should find the question
      if (results.length > 0) {
        const found = results.some((r) => r.snippet.toLowerCase().includes('question'));
        expect(found).toBe(true);
      }
    });

    it('should handle queries with double hyphens', async () => {
      const params: SearchParams = {
        query: '--verbose',
        mode: 'keyword',
      };

      const results = await performSearch(adapter, params);
      expect(Array.isArray(results)).toBe(true);

      // Should find the flag reference
      if (results.length > 0) {
        const found = results.some((r) => r.snippet.toLowerCase().includes('verbose'));
        expect(found).toBe(true);
      }
    });

    it('should handle queries with parentheses', async () => {
      const params: SearchParams = {
        query: 'add(2+3)',
        mode: 'keyword',
      };

      const results = await performSearch(adapter, params);
      expect(Array.isArray(results)).toBe(true);

      // Should find the function reference
      if (results.length > 0) {
        const found = results.some((r) => r.snippet.toLowerCase().includes('add'));
        expect(found).toBe(true);
      }
    });

    it('should handle queries with asterisks', async () => {
      const params: SearchParams = {
        query: '*.ts',
        mode: 'keyword',
      };

      const results = await performSearch(adapter, params);
      expect(Array.isArray(results)).toBe(true);

      // Should find file extension reference
      if (results.length > 0) {
        const found = results.some((r) => r.snippet.toLowerCase().includes('.ts'));
        expect(found).toBe(true);
      }
    });

    it('should handle queries with colons', async () => {
      const params: SearchParams = {
        query: '/usr/local/bin:',
        mode: 'keyword',
      };

      const results = await performSearch(adapter, params);
      expect(Array.isArray(results)).toBe(true);

      // Should find path reference
      if (results.length > 0) {
        const found = results.some((r) => r.snippet.toLowerCase().includes('/usr/local/bin'));
        expect(found).toBe(true);
      }
    });

    it('should handle queries with double quotes', async () => {
      const params: SearchParams = {
        query: '"exact phrase"',
        mode: 'keyword',
      };

      // Should not throw an error
      await expect(performSearch(adapter, params)).resolves.not.toThrow();
      const results = await performSearch(adapter, params);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle mixed special characters', async () => {
      const params: SearchParams = {
        query: 'model-serving: "what are core components?"',
        mode: 'keyword',
      };

      // Should not throw an error
      await expect(performSearch(adapter, params)).resolves.not.toThrow();
      const results = await performSearch(adapter, params);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
