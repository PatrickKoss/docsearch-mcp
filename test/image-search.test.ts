import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { testDbPath } from './setup.js';
import { SqliteAdapter } from '../src/ingest/adapters/sqlite.js';
import { Indexer } from '../src/ingest/indexer.js';
import { performSearch } from '../src/ingest/search.js';

import type { SearchParams } from '../src/ingest/search.js';
import type { DocumentInput, ChunkInput } from '../src/shared/types.js';

// Mock the embeddings module
vi.mock('../src/ingest/embeddings.js', () => ({
  getEmbedder: () => ({
    embed: vi
      .fn()
      .mockImplementation((inputs: string[]) =>
        Promise.resolve(inputs.map(() => Array(1536).fill(0.1))),
      ),
  }),
}));

describe('Image Search', () => {
  let adapter: SqliteAdapter;
  let indexer: Indexer;

  beforeEach(async () => {
    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();
    indexer = new Indexer(adapter);

    // Create test documents: text files and images
    const docs: DocumentInput[] = [
      {
        source: 'file',
        uri: 'file:///path/to/document.md',
        repo: 'project-a',
        path: 'docs/architecture.md',
        title: 'Architecture Documentation',
        lang: 'md',
        hash: 'hash1',
        mtime: Date.now(),
        version: '1.0',
        extraJson: null,
      },
      {
        source: 'file',
        uri: 'file:///path/to/architecture.png',
        repo: 'project-a',
        path: 'docs/images/architecture.png',
        title: 'architecture.png',
        lang: 'image',
        hash: 'hash2',
        mtime: Date.now(),
        version: '1.0',
        extraJson: JSON.stringify({
          isImage: true,
          imagePath: '/path/to/architecture.png',
          fileSize: 245760,
          description:
            'A system architecture diagram showing microservices with API gateway, load balancer, and database clusters. The diagram includes service mesh connectivity and monitoring components.',
        }),
      },
      {
        source: 'file',
        uri: 'file:///path/to/flowchart.jpg',
        repo: 'project-b',
        path: 'diagrams/user-flow.jpg',
        title: 'flowchart.jpg',
        lang: 'image',
        hash: 'hash3',
        mtime: Date.now(),
        version: '1.0',
        extraJson: JSON.stringify({
          isImage: true,
          imagePath: '/path/to/flowchart.jpg',
          fileSize: 180000,
          description:
            'A user authentication flowchart diagram with decision points, error handling, and success paths. Shows login, registration, and password reset processes.',
        }),
      },
      {
        source: 'confluence',
        uri: 'confluence://wiki/deployment',
        repo: 'wiki',
        path: 'deployment-guide',
        title: 'Deployment Guide',
        lang: 'md',
        hash: 'hash4',
        mtime: Date.now(),
        version: '2.0',
        extraJson: null,
      },
      {
        source: 'file',
        uri: 'file:///path/to/screenshot.png',
        repo: 'project-a',
        path: 'docs/ui-screenshot.png',
        title: 'screenshot.png',
        lang: 'image',
        hash: 'hash5',
        mtime: Date.now(),
        version: '1.0',
        extraJson: JSON.stringify({
          isImage: true,
          imagePath: '/path/to/screenshot.png',
          fileSize: 128000,
          description:
            'A screenshot of the user dashboard interface showing metrics, charts, and navigation menu. Includes performance graphs and user activity data.',
        }),
      },
    ];

    // Insert documents
    const docIds = [];
    for (const doc of docs) {
      const docId = await indexer.upsertDocument(doc);
      docIds.push(docId);
    }

    // Create chunks
    const chunks: Array<{ docId: number; chunks: ChunkInput[] }> = [
      {
        docId: docIds[0]!, // architecture.md
        chunks: [
          {
            content:
              'This document describes our microservices architecture with API gateway and load balancing.',
            startLine: 1,
            endLine: 5,
          },
          {
            content: 'The system uses Docker containers orchestrated by Kubernetes for deployment.',
            startLine: 6,
            endLine: 10,
          },
        ],
      },
      {
        docId: docIds[1]!, // architecture.png
        chunks: [
          {
            content:
              'A system architecture diagram showing microservices with API gateway, load balancer, and database clusters. The diagram includes service mesh connectivity and monitoring components.',
            startLine: undefined,
            endLine: undefined,
          },
        ],
      },
      {
        docId: docIds[2]!, // flowchart.jpg
        chunks: [
          {
            content:
              'A user authentication flowchart diagram with decision points, error handling, and success paths. Shows login, registration, and password reset processes.',
            startLine: undefined,
            endLine: undefined,
          },
        ],
      },
      {
        docId: docIds[3]!, // deployment guide
        chunks: [
          {
            content:
              'Steps for deploying applications using our CI/CD pipeline and Kubernetes infrastructure.',
            startLine: 1,
            endLine: 3,
          },
        ],
      },
      {
        docId: docIds[4]!, // screenshot.png
        chunks: [
          {
            content:
              'A screenshot of the user dashboard interface showing metrics, charts, and navigation menu. Includes performance graphs and user activity data.',
            startLine: undefined,
            endLine: undefined,
          },
        ],
      },
    ];

    // Insert chunks
    for (const { docId, chunks: docChunks } of chunks) {
      await indexer.insertChunks(docId, docChunks);
    }

    // Mock embeddings for the chunks
    await indexer.embedNewChunks();
  });

  afterEach(async () => {
    await adapter?.close();
  });

  describe('basic search functionality', () => {
    it('should find all documents by default', async () => {
      const searchParams: SearchParams = {
        query: 'architecture',
        topK: 10,
      };

      const results = await performSearch(adapter, searchParams);

      // Should find both text documents and images containing "architecture"
      expect(results.length).toBeGreaterThan(0);

      const imageResults = results.filter((r) => r.uri.includes('.png') || r.uri.includes('.jpg'));
      const textResults = results.filter((r) => !r.uri.includes('.png') && !r.uri.includes('.jpg'));

      expect(imageResults.length).toBeGreaterThan(0);
      expect(textResults.length).toBeGreaterThan(0);
    });

    it('should include images by default when no filter specified', async () => {
      const searchParams: SearchParams = {
        query: 'dashboard',
        topK: 10,
      };

      const results = await performSearch(adapter, searchParams);

      // Should find the dashboard screenshot
      expect(results.length).toBeGreaterThan(0);
      const dashboardResult = results.find((r) => r.snippet.includes('dashboard interface'));
      expect(dashboardResult).toBeDefined();
      expect(dashboardResult?.uri).toContain('screenshot.png');
    });
  });

  describe('image filtering', () => {
    it('should only return images when imagesOnly is true', async () => {
      const searchParams: SearchParams = {
        query: 'architecture',
        topK: 10,
        imagesOnly: true,
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);

      // All results should be images
      for (const result of results) {
        const doc = await adapter.rawQuery('SELECT lang FROM documents WHERE id = ?', [
          result.document_id,
        ]);
        expect(doc[0]?.lang).toBe('image');
      }

      // Should find the architecture diagram
      const archResult = results.find((r) => r.uri.includes('architecture.png'));
      expect(archResult).toBeDefined();
    });

    it('should exclude images when includeImages is false', async () => {
      const searchParams: SearchParams = {
        query: 'architecture',
        topK: 10,
        includeImages: false,
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);

      // No results should be images
      for (const result of results) {
        const doc = await adapter.rawQuery('SELECT lang FROM documents WHERE id = ?', [
          result.document_id,
        ]);
        expect(doc[0]?.lang).not.toBe('image');
      }

      // Should not find any image files
      const imageResults = results.filter(
        (r) =>
          r.uri.includes('.png') ||
          r.uri.includes('.jpg') ||
          r.uri.includes('.gif') ||
          r.uri.includes('.svg'),
      );
      expect(imageResults).toHaveLength(0);
    });

    it('should include images when includeImages is explicitly true', async () => {
      const searchParams: SearchParams = {
        query: 'flowchart',
        topK: 10,
        includeImages: true,
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);

      // Should find the flowchart image
      const flowchartResult = results.find((r) => r.uri.includes('flowchart.jpg'));
      expect(flowchartResult).toBeDefined();
      expect(flowchartResult?.snippet).toContain('authentication flowchart');
    });
  });

  describe('search modes with images', () => {
    it('should work with keyword search mode for images', async () => {
      const searchParams: SearchParams = {
        query: 'dashboard metrics',
        topK: 5,
        mode: 'keyword',
        imagesOnly: true,
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);
      const result = results.find((r) => r.uri.includes('screenshot.png'));
      expect(result).toBeDefined();
    });

    it('should work with vector search mode for images', async () => {
      const searchParams: SearchParams = {
        query: 'user interface visualization',
        topK: 5,
        mode: 'vector',
        imagesOnly: true,
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);
      // Should find images based on semantic similarity
      const hasImageResults = results.length > 0;
      expect(hasImageResults).toBeTruthy();
    });

    it('should work with auto mode combining images and text', async () => {
      const searchParams: SearchParams = {
        query: 'microservices architecture',
        topK: 10,
        mode: 'auto',
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);

      // Should find both text documents and images
      const imageResults = results.filter((r) => r.uri.includes('.png') || r.uri.includes('.jpg'));
      const textResults = results.filter((r) => !r.uri.includes('.png') && !r.uri.includes('.jpg'));

      expect(imageResults.length).toBeGreaterThan(0);
      expect(textResults.length).toBeGreaterThan(0);
    });
  });

  describe('combined filters', () => {
    it('should combine image filtering with source filtering', async () => {
      const searchParams: SearchParams = {
        query: 'architecture',
        topK: 10,
        source: 'file',
        imagesOnly: true,
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);

      // All results should be from file source and be images
      for (const result of results) {
        expect(result.source).toBe('file');
        const doc = await adapter.rawQuery('SELECT lang FROM documents WHERE id = ?', [
          result.document_id,
        ]);
        expect(doc[0]?.lang).toBe('image');
      }
    });

    it('should combine image filtering with repo filtering', async () => {
      const searchParams: SearchParams = {
        query: 'diagram',
        topK: 10,
        repo: 'project-a',
        imagesOnly: true,
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);

      // All results should be from project-a repo and be images
      for (const result of results) {
        expect(result.repo).toBe('project-a');
        const doc = await adapter.rawQuery('SELECT lang FROM documents WHERE id = ?', [
          result.document_id,
        ]);
        expect(doc[0]?.lang).toBe('image');
      }

      // Should find architecture.png and screenshot.png from project-a, but not flowchart.jpg from project-b
      const archResult = results.find((r) => r.uri.includes('architecture.png'));
      const screenshotResult = results.find((r) => r.uri.includes('screenshot.png'));
      const flowchartResult = results.find((r) => r.uri.includes('flowchart.jpg'));

      expect(archResult || screenshotResult).toBeDefined(); // At least one should match
      expect(flowchartResult).toBeUndefined(); // Should not find project-b image
    });

    it('should combine image filtering with path prefix filtering', async () => {
      const searchParams: SearchParams = {
        query: 'interface',
        topK: 10,
        pathPrefix: 'docs/',
        imagesOnly: true,
      };

      const results = await performSearch(adapter, searchParams);

      for (const result of results) {
        expect(result.path).toMatch(/^docs\//);
        const doc = await adapter.rawQuery('SELECT lang FROM documents WHERE id = ?', [
          result.document_id,
        ]);
        expect(doc[0]?.lang).toBe('image');
      }
    });
  });

  describe('edge cases', () => {
    it('should return empty results when no images match imagesOnly query', async () => {
      const searchParams: SearchParams = {
        query: 'nonexistent',
        topK: 10,
        imagesOnly: true,
        mode: 'keyword',
      };

      const results = await performSearch(adapter, searchParams);
      expect(results).toHaveLength(0);
    });

    it('should handle conflicting filters gracefully', async () => {
      const searchParams: SearchParams = {
        query: 'architecture',
        topK: 10,
        includeImages: false,
        imagesOnly: true, // Conflicting with includeImages: false
      };

      const results = await performSearch(adapter, searchParams);

      // imagesOnly should take precedence and return only images
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        const doc = await adapter.rawQuery('SELECT lang FROM documents WHERE id = ?', [
          result.document_id,
        ]);
        expect(doc[0]?.lang).toBe('image');
      }
    });

    it('should handle empty query with image filters', async () => {
      const searchParams: SearchParams = {
        query: 'a',
        topK: 10,
        imagesOnly: true,
      };

      const results = await performSearch(adapter, searchParams);

      // Should return all images even with empty query (or handle gracefully)
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('result format', () => {
    it('should return image results with proper metadata', async () => {
      const searchParams: SearchParams = {
        query: 'dashboard screenshot',
        topK: 5,
        imagesOnly: true,
      };

      const results = await performSearch(adapter, searchParams);

      expect(results.length).toBeGreaterThan(0);
      const result = results[0];

      // Check standard search result fields
      expect(result).toHaveProperty('chunk_id');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('document_id');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('uri');
      expect(result).toHaveProperty('snippet');

      // URI should point to image file
      expect(result!.uri).toMatch(/\.(png|jpg|jpeg|gif|svg|webp)$/);

      // Snippet should contain image description
      expect(typeof result!.snippet).toBe('string');
      expect(result!.snippet.length).toBeGreaterThan(0);
    });
  });
});
