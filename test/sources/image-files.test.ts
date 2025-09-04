import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';
import { getImageToTextProvider } from '../../src/ingest/image-to-text.js';
import { ingestFiles } from '../../src/ingest/sources/files.js';
import { testDbPath } from '../setup.js';

// Mock the image-to-text module
vi.mock('../../src/ingest/image-to-text.js', () => ({
  getImageToTextProvider: vi.fn(),
}));

// Mock the config to point to test fixtures
vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    FILE_ROOTS: ['./test/fixtures-images'],
    FILE_INCLUDE_GLOBS: ['**/*.{png,jpg,jpeg,gif,svg,webp}'],
    FILE_EXCLUDE_GLOBS: ['**/node_modules/**', '**/.git/**'],
  },
}));

describe('Image File Ingestion', () => {
  let adapter: SqliteAdapter;
  const fixturesDir = './test/fixtures-images';

  const createTestImages = {
    'architecture.png': Buffer.from('fake-png-data'),
    'flowchart.jpg': Buffer.from('fake-jpg-data'),
    'diagram.svg': Buffer.from('<svg><rect width="100" height="100"/></svg>'),
    'screenshot.webp': Buffer.from('fake-webp-data'),
  };

  beforeEach(async () => {
    // Clean up and create test directory
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true });
    }
    mkdirSync(fixturesDir, { recursive: true });

    // Create test image files
    for (const [filename, content] of Object.entries(createTestImages)) {
      const filePath = path.join(fixturesDir, filename);
      if (typeof content === 'string') {
        writeFileSync(filePath, content, 'utf8');
      } else {
        writeFileSync(filePath, content);
      }
    }

    // Initialize database adapter
    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();
  });

  afterEach(async () => {
    await adapter?.close();
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true });
    }
    vi.clearAllMocks();
  });

  describe('with image-to-text enabled', () => {
    beforeEach(() => {
      vi.doMock('../../src/shared/config.js', () => ({
        CONFIG: {
          FILE_ROOTS: [fixturesDir],
          FILE_INCLUDE_GLOBS: ['**/*.{png,jpg,jpeg,gif,svg,webp}'],
          FILE_EXCLUDE_GLOBS: ['**/node_modules/**', '**/.git/**'],
        },
      }));

      // Mock image-to-text provider
      const mockProvider = {
        describeImage: vi.fn().mockImplementation((imagePath: string) => {
          const filename = path.basename(imagePath);
          if (filename === 'architecture.png') {
            return Promise.resolve(
              'A system architecture diagram showing microservices communication with API gateway, load balancer, and database clusters.',
            );
          } else if (filename === 'flowchart.jpg') {
            return Promise.resolve(
              'A process flowchart illustrating user authentication workflow with decision points and error handling.',
            );
          } else if (filename === 'diagram.svg') {
            return Promise.resolve(
              'A simple SVG diagram with geometric shapes representing system components.',
            );
          } else if (filename === 'screenshot.webp') {
            return Promise.resolve(
              'A screenshot of a user interface showing a dashboard with metrics and charts.',
            );
          }
          return Promise.resolve('Generic image description');
        }),
      };

      vi.mocked(getImageToTextProvider).mockReturnValue(mockProvider);
    });

    it('should ingest image files with AI descriptions', async () => {
      await ingestFiles(adapter);

      // Check that documents were created for each image
      const documents = await adapter.rawQuery(
        "SELECT * FROM documents WHERE lang = 'image' ORDER BY path",
      );
      expect(documents).toHaveLength(4);

      // Verify document metadata
      expect(documents[0]).toMatchObject({
        source: 'file',
        lang: 'image',
        title: 'architecture.png',
      });

      expect(documents[0]!.uri).toContain('architecture.png');
      expect(documents[0]!.extra_json).toBeDefined();

      const extraJson = JSON.parse(documents[0]!.extra_json as string);
      expect(extraJson.isImage).toBe(true);
      expect(extraJson.imagePath).toContain('architecture.png');
      expect(extraJson.description).toContain('system architecture diagram');

      // Check that chunks were created with AI descriptions
      const chunks = await adapter.rawQuery(`
        SELECT c.*, d.path 
        FROM chunks c 
        JOIN documents d ON d.id = c.document_id 
        WHERE d.lang = 'image' 
        ORDER BY d.path
      `);
      expect(chunks).toHaveLength(4);

      // Verify chunk content contains AI descriptions
      const architectureChunk = chunks.find((c: any) => c.path.includes('architecture.png'));
      expect(architectureChunk?.content).toContain('system architecture diagram');
      expect(architectureChunk?.content).toContain('microservices communication');

      const flowchartChunk = chunks.find((c: any) => c.path.includes('flowchart.jpg'));
      expect(flowchartChunk?.content).toContain('process flowchart');
      expect(flowchartChunk?.content).toContain('authentication workflow');
    });

    it('should handle image-to-text provider errors gracefully', async () => {
      // Mock provider to throw error for one image
      const mockProvider = {
        describeImage: vi.fn().mockImplementation((imagePath: string) => {
          if (imagePath.includes('architecture.png')) {
            throw new Error('Vision API error');
          }
          return Promise.resolve('Successfully described image');
        }),
      };

      vi.mocked(getImageToTextProvider).mockReturnValue(mockProvider);

      await ingestFiles(adapter);

      const documents = await adapter.rawQuery("SELECT * FROM documents WHERE lang = 'image'");
      expect(documents).toHaveLength(4); // All images should still be indexed

      // Check that the failed image still has a fallback description
      const failedDoc = documents.find((d: any) => d.path.includes('architecture.png'));
      expect(failedDoc).toBeDefined();

      const chunk = await adapter.rawQuery('SELECT content FROM chunks WHERE document_id = ?', [
        failedDoc!.id,
      ]);
      expect(chunk[0]?.content).toContain('architecture.png'); // Should fallback to filename
    });
  });

  describe('with image-to-text disabled', () => {
    beforeEach(() => {
      vi.doMock('../../src/shared/config.js', () => ({
        CONFIG: {
          FILE_ROOTS: [fixturesDir],
          FILE_INCLUDE_GLOBS: ['**/*.{png,jpg,jpeg,gif,svg,webp}'],
          FILE_EXCLUDE_GLOBS: ['**/node_modules/**', '**/.git/**'],
        },
      }));

      // Mock no provider available
      vi.mocked(getImageToTextProvider).mockReturnValue(null);
    });

    it('should ingest image files with filename-based descriptions', async () => {
      await ingestFiles(adapter);

      // Check that documents were still created
      const documents = await adapter.rawQuery(
        "SELECT * FROM documents WHERE lang = 'image' ORDER BY path",
      );
      expect(documents).toHaveLength(4);

      // Check that chunks use filename-based content
      const chunks = await adapter.rawQuery(`
        SELECT c.*, d.path 
        FROM chunks c 
        JOIN documents d ON d.id = c.document_id 
        WHERE d.lang = 'image' 
        ORDER BY d.path
      `);
      expect(chunks).toHaveLength(4);

      // Verify chunk content is filename-based
      const architectureChunk = chunks.find((c: any) => c.path.includes('architecture.png'));
      expect(architectureChunk?.content).toBe('Image: architecture.png');

      const flowchartChunk = chunks.find((c: any) => c.path.includes('flowchart.jpg'));
      expect(flowchartChunk?.content).toBe('Image: flowchart.jpg');
    });

    it('should store image metadata even without descriptions', async () => {
      await ingestFiles(adapter);

      const documents = await adapter.rawQuery("SELECT * FROM documents WHERE lang = 'image'");

      for (const doc of documents) {
        expect(doc.extra_json).toBeDefined();
        const extraJson = JSON.parse(doc.extra_json as string);
        expect(extraJson.isImage).toBe(true);
        expect(extraJson.imagePath).toBeDefined();
        expect(extraJson.fileSize).toBeGreaterThan(0);
        expect(extraJson.description).toBe(''); // Empty when disabled
      }
    });
  });

  describe('file type detection', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/shared/config.js', () => ({
        CONFIG: {
          FILE_ROOTS: [fixturesDir],
          FILE_INCLUDE_GLOBS: ['**/*'], // Include all files
          FILE_EXCLUDE_GLOBS: ['**/node_modules/**'],
        },
      }));

      vi.mocked(getImageToTextProvider).mockReturnValue(null);
    });

    it('should only process files with image extensions', async () => {
      // Add non-image files
      writeFileSync(path.join(fixturesDir, 'document.txt'), 'This is a text file');
      writeFileSync(path.join(fixturesDir, 'script.js'), 'console.log("hello");');

      // Re-import ingestFiles after mocking config
      const { ingestFiles: dynamicIngestFiles } = await import('../../src/ingest/sources/files.js');
      await dynamicIngestFiles(adapter);

      const imageDocuments = await adapter.rawQuery("SELECT * FROM documents WHERE lang = 'image'");
      const otherDocuments = await adapter.rawQuery(
        "SELECT * FROM documents WHERE lang != 'image'",
      );

      expect(imageDocuments).toHaveLength(4); // Only image files
      expect(otherDocuments).toHaveLength(2); // Text and JS files

      // Verify image documents have correct language
      for (const doc of imageDocuments) {
        expect(doc.lang).toBe('image');
      }
    });

    it('should handle mixed case extensions', async () => {
      // Create files with mixed case extensions
      writeFileSync(path.join(fixturesDir, 'test.PNG'), Buffer.from('fake-png-data'));
      writeFileSync(path.join(fixturesDir, 'test.JPG'), Buffer.from('fake-jpg-data'));

      await ingestFiles(adapter);

      const documents = await adapter.rawQuery(
        "SELECT * FROM documents WHERE lang = 'image' AND (path LIKE '%.PNG' OR path LIKE '%.JPG')",
      );
      expect(documents).toHaveLength(2);
    });
  });

  describe('chunking behavior', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/shared/config.js', () => ({
        CONFIG: {
          FILE_ROOTS: [fixturesDir],
          FILE_INCLUDE_GLOBS: ['**/*.png'],
          FILE_EXCLUDE_GLOBS: [],
        },
      }));
    });

    it('should create single chunk per image', async () => {
      const mockProvider = {
        describeImage: vi
          .fn()
          .mockResolvedValue(
            'A very long description of the image that could potentially be split into multiple chunks but should remain as a single chunk for images since they represent a single visual entity.',
          ),
      };

      vi.mocked(getImageToTextProvider).mockReturnValue(mockProvider);

      // Re-import ingestFiles after mocking config
      const { ingestFiles: dynamicIngestFiles } = await import('../../src/ingest/sources/files.js');
      await dynamicIngestFiles(adapter);

      // Should only have one PNG file
      const documents = await adapter.rawQuery("SELECT * FROM documents WHERE lang = 'image'");
      expect(documents).toHaveLength(1);

      // Should have exactly one chunk per image
      const chunks = await adapter.rawQuery(
        "SELECT * FROM chunks c JOIN documents d ON d.id = c.document_id WHERE d.lang = 'image'",
      );
      expect(chunks).toHaveLength(1);

      // Chunk should have no line numbers (start_line and end_line should be null)
      expect(chunks[0]!.start_line).toBeNull();
      expect(chunks[0]!.end_line).toBeNull();
    });
  });
});
