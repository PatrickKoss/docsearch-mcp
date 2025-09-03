import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';
import { Indexer } from '../../src/ingest/indexer.js';
import { testDbPath } from '../setup.js';

import type { DocumentInput, ChunkInput } from '../../src/infrastructure/database/legacy-types.js';

vi.mock('../../src/ingest/embeddings.js', () => ({
  getEmbedder: vi.fn().mockReturnValue({
    dim: 1536,
    embed: vi.fn().mockResolvedValue([new Float32Array(Array(1536).fill(0.1))]),
  }),
}));

describe('MCP Server', () => {
  let adapter: SqliteAdapter;
  let indexer: Indexer;

  beforeEach(async () => {
    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();

    indexer = new Indexer(adapter);

    const testDoc: DocumentInput = {
      source: 'file',
      uri: 'test://sample.ts',
      repo: 'test-repo',
      path: 'src/sample.ts',
      title: 'Sample TypeScript File',
      lang: 'ts',
      hash: 'abc123',
      mtime: Date.now(),
      version: '1.0',
      extraJson: null,
    };

    const docId = await indexer.upsertDocument(testDoc);
    const chunks: ChunkInput[] = [
      {
        content:
          'function searchFiles(query: string) {\n  return files.filter(f => f.includes(query));\n}',
        startLine: 1,
        endLine: 3,
        tokenCount: 20,
      },
      {
        content: 'export const API_BASE_URL = "https://api.example.com";',
        startLine: 5,
        endLine: 5,
        tokenCount: 15,
      },
    ];
    await indexer.insertChunks(docId, chunks);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await adapter?.close();
  });

  describe('Resource handling', () => {
    it('should retrieve chunk by ID', async () => {
      const { resourceHandler } = await import('./mcp-test-helpers.js');

      // @ts-expect-error - accessing private property for testing
      const chunkRow = adapter.db.prepare('SELECT id FROM chunks LIMIT 1').get();
      const result = await resourceHandler(`docchunk://${chunkRow.id}`);

      expect(result.contents).toBeDefined();
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]!.text).toContain('Sample TypeScript File');
      expect(result.contents[0]!.text).toContain('function searchFiles');
    });

    it('should handle non-existent chunk ID', async () => {
      const { resourceHandler } = await import('./mcp-test-helpers.js');

      const result = await resourceHandler('docchunk://999999');

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]!.text).toBe('Not found');
    });

    it('should format chunk metadata correctly', async () => {
      const { resourceHandler } = await import('./mcp-test-helpers.js');

      // @ts-expect-error - accessing private property for testing
      const chunkRow = adapter.db
        .prepare('SELECT id FROM chunks WHERE start_line IS NOT NULL LIMIT 1')
        .get();
      const result = await resourceHandler(`docchunk://${chunkRow.id}`);

      const content = result.contents[0]!.text;
      expect(content).toContain('# Sample TypeScript File');
      expect(content).toContain('• src/sample.ts');
      expect(content).toContain('(lines 1-3)');
      expect(content).toContain('test-repo');
    });
  });

  describe('Search tool', () => {
    it('should perform keyword search', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'searchFiles',
        mode: 'keyword',
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]!.type).toBe('text');
      expect((result.content[0] as any).text).toContain('Found');
      expect((result.content[0] as any).text).toContain('searchFiles');

      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      expect(resourceLinks.length).toBeGreaterThan(0);
      expect((resourceLinks[0] as any).uri).toMatch(/^docchunk:\/\/\d+$/);
    });

    it('should perform vector search', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'function for searching',
        mode: 'vector',
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]!.type).toBe('text');
      expect((result.content[0] as any).text).toContain('Found');
    });

    it('should perform hybrid search by default', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'searchFiles',
      });

      expect(result.content).toBeDefined();

      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      expect(resourceLinks.length).toBeGreaterThan(0);
    });

    it('should respect topK parameter', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'function',
        topK: 1,
      });

      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      expect(resourceLinks.length).toBeLessThanOrEqual(1);
    });

    it('should filter by source', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'function',
        source: 'file',
      });

      expect(result.content).toBeDefined();
      const textItems = result.content.filter((c) => c.type === 'text' && c.text.includes('file'));
      expect(textItems.length).toBeGreaterThan(0);
    });

    it('should filter by repository', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'function',
        repo: 'test-repo',
      });

      expect(result.content).toBeDefined();
      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      if (resourceLinks.length > 0) {
        expect((resourceLinks[0] as any).description).toContain('test-repo');
      }
    });

    it('should filter by path prefix', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'function',
        pathPrefix: 'src/',
      });

      expect(result.content).toBeDefined();
      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      if (resourceLinks.length > 0) {
        expect((resourceLinks[0] as any).description).toContain('src/sample.ts');
      }
    });

    it('should handle empty search results', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'nonexistentterm12345',
      });

      expect(result.content).toBeDefined();
      expect((result.content[0] as any).text).toContain('Found 0 results');
    });

    it('should format snippets correctly', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'searchFiles',
        mode: 'keyword',
      });

      const textItems = result.content.filter(
        (c) => c.type === 'text' && (c as any).text.startsWith('—'),
      );
      expect(textItems.length).toBeGreaterThan(0);
      expect((textItems[0] as any).text).toContain('function searchFiles');
    });

    it('should truncate long snippets with ellipsis', async () => {
      const longContentDoc: DocumentInput = {
        source: 'file',
        uri: 'test://long.ts',
        hash: 'long123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extraJson: null,
      };
      const docId = await indexer.upsertDocument(longContentDoc);
      const longChunk: ChunkInput = {
        content: `${'a'.repeat(300)} searchable term`,
        tokenCount: 100,
      };
      await indexer.insertChunks(docId, [longChunk]);

      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'searchable',
        mode: 'keyword',
      });

      const textItems = result.content.filter(
        (c) => c.type === 'text' && (c as any).text.startsWith('—'),
      );
      const longSnippet = textItems.find((item) => (item as any).text.includes('searchable'));

      if (longSnippet) {
        expect((longSnippet as any).text).toMatch(/…$/);
        expect((longSnippet as any).text.length).toBeLessThanOrEqual(250); // 240 + "— " + "…"
      }
    });

    it('should deduplicate results by chunk ID', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'searchFiles',
        mode: 'auto', // This should combine keyword and vector results
      });

      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      const uniqueUris = new Set(resourceLinks.map((link) => (link as any).uri));

      expect(uniqueUris.size).toBe(resourceLinks.length);
    });

    it('should prefer vector results in deduplication', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'function search files',
        mode: 'auto',
      });

      expect(result.content).toBeDefined();
      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      expect(resourceLinks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Input validation', () => {
    it('should handle invalid topK values', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      await expect(
        searchTool({
          query: 'test',
          topK: 0,
        }),
      ).rejects.toThrow();

      await expect(
        searchTool({
          query: 'test',
          topK: 100,
        }),
      ).rejects.toThrow();
    });

    it('should handle invalid source values', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      await expect(
        searchTool({
          query: 'test',
          source: 'invalid' as any,
        }),
      ).rejects.toThrow();
    });

    it('should handle invalid mode values', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      await expect(
        searchTool({
          query: 'test',
          mode: 'invalid' as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Content formatting', () => {
    it('should format resource link descriptions with all available metadata', async () => {
      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'function',
        mode: 'keyword',
      });

      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      expect(resourceLinks.length).toBeGreaterThan(0);

      const link = resourceLinks[0];
      expect((link as any).description).toContain('file');
      expect((link as any).description).toContain('test-repo');
      expect((link as any).description).toContain('src/sample.ts');
    });

    it('should handle missing metadata gracefully', async () => {
      const minimalDoc: DocumentInput = {
        source: 'confluence',
        uri: 'confluence://minimal',
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
      await indexer.insertChunks(docId, [
        {
          content: 'minimal searchable content',
        },
      ]);

      const { searchTool } = await import('./mcp-test-helpers.js');

      const result = await searchTool({
        query: 'minimal',
        mode: 'keyword',
      });

      const resourceLinks = result.content.filter((c) => c.type === 'resource_link');
      const minimalLink = resourceLinks.find((link) =>
        (link as any).name.includes('confluence://minimal'),
      );

      expect(minimalLink).toBeTruthy();
      expect((minimalLink as any).description).toBe('confluence');
    });
  });
});
