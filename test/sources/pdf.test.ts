import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';
import { chunkPdf } from '../../src/ingest/chunker.js';
import { ingestFiles } from '../../src/ingest/sources/files.js';
import { testDbPath } from '../setup.js';

// Mock pdf-parse to avoid needing actual PDF files
vi.mock('pdf-parse', () => ({
  default: vi.fn((buffer) => {
    const text = buffer.toString();
    if (text.includes('mock-pdf-content')) {
      return Promise.resolve({
        text: `This is a mock PDF document.

It contains multiple paragraphs with various content.
Some lines might have    excessive   whitespace   or formatting.



There could be multiple line breaks between sections.

Page breaks and other artifacts are common in PDF extraction.
This text represents what would be extracted from a PDF file.

The content should be properly chunked and indexed for search.`,
        numpages: 2,
        info: {
          Title: 'Mock PDF Document',
          Author: 'Test Author',
          CreationDate: new Date().toISOString(),
        },
      });
    }
    if (text.includes('empty-pdf')) {
      return Promise.resolve({
        text: '',
        numpages: 1,
        info: {},
      });
    }
    if (text.includes('error-pdf')) {
      throw new Error('PDF parsing failed');
    }
    return Promise.resolve({
      text: 'Default PDF content for testing.',
      numpages: 1,
      info: {},
    });
  }),
}));

vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    FILE_ROOTS: ['./test/fixtures'],
    FILE_INCLUDE_GLOBS: ['**/*.{ts,js,py,md,txt,pdf}'],
    FILE_EXCLUDE_GLOBS: ['**/node_modules/**', '**/.git/**'],
  },
}));

describe('PDF Ingestion', () => {
  let adapter: SqliteAdapter;
  const fixturesDir = './test/fixtures';
  const testFiles = {
    'document.pdf': 'mock-pdf-content',
    'empty.pdf': 'empty-pdf',
    'report.pdf': 'mock-pdf-content-report',
  };

  beforeEach(async () => {
    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();

    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }

    mkdirSync(fixturesDir, { recursive: true });

    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = path.join(fixturesDir, filePath);
      writeFileSync(fullPath, content, 'utf8');
    }
  });

  afterEach(async () => {
    await adapter?.close();
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  describe('PDF file ingestion', () => {
    it('should ingest PDF files successfully', async () => {
      await ingestFiles(adapter);

      const pdfDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/document.pdf')}`,
      );
      const reportDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/report.pdf')}`,
      );

      expect(pdfDoc).toBeTruthy();
      expect(reportDoc).toBeTruthy();
    });

    it('should set correct metadata for PDF files', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const pdfDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%document.pdf'")
        .get();
      expect(pdfDoc).toBeTruthy();
      expect(pdfDoc.source).toBe('file');
      expect(pdfDoc.title).toBe('document'); // Should strip .pdf extension
      expect(pdfDoc.lang).toBe('pdf');
      expect(pdfDoc.hash).toBeTruthy();
      expect(pdfDoc.mtime).toBeGreaterThan(0);
      expect(pdfDoc.path).toContain('document.pdf');
    });

    it('should store PDF metadata in extraJson', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const pdfDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%document.pdf'")
        .get();
      expect(pdfDoc).toBeTruthy();
      expect(pdfDoc.extra_json).toBeTruthy();

      const extraJson = JSON.parse(pdfDoc.extra_json);
      expect(extraJson.pages).toBe(2);
      expect(extraJson.info).toBeTruthy();
      expect(extraJson.info.Title).toBe('Mock PDF Document');
    });

    it('should create chunks for PDF content', async () => {
      await ingestFiles(adapter);

      const pdfDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/document.pdf')}`,
      );
      expect(pdfDoc).toBeTruthy();
      if (pdfDoc) {
        const hasChunks = await adapter.hasChunks(pdfDoc.id);
        expect(hasChunks).toBe(true);
      }

      // Check that chunks contain expected content
      // @ts-expect-error - accessing private property for testing
      const chunkWithContent = adapter.db
        .prepare("SELECT * FROM chunks WHERE content LIKE '%mock PDF document%'")
        .get();
      expect(chunkWithContent).toBeTruthy();
    });

    it('should handle empty PDF files gracefully', async () => {
      await ingestFiles(adapter);

      // Empty PDF should be skipped (not ingested)
      const emptyDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/empty.pdf')}`,
      );
      expect(emptyDoc).toBeFalsy();
    });

    it('should handle PDF parsing errors gracefully', async () => {
      writeFileSync(path.join(fixturesDir, 'corrupt.pdf'), 'error-pdf');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      await expect(ingestFiles(adapter)).resolves.not.toThrow();

      process.env.NODE_ENV = originalEnv;
      expect(consoleSpy).toHaveBeenCalled();

      // Corrupt PDF should not be ingested
      const corruptDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/corrupt.pdf')}`,
      );
      expect(corruptDoc).toBeFalsy();
    });

    it('should use PDF-specific chunking', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const pdfDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%document.pdf'")
        .get();
      // @ts-expect-error - accessing private property for testing
      const chunks = adapter.db
        .prepare('SELECT * FROM chunks WHERE document_id = ?')
        .all(pdfDoc.id);

      expect(chunks.length).toBeGreaterThan(0);
      // PDF chunks should not have line numbers (unlike code files)
      chunks.forEach((chunk) => {
        expect(chunk.start_line).toBeNull();
        expect(chunk.end_line).toBeNull();
        expect(chunk.token_count).toBeGreaterThan(0);
      });
    });
  });

  describe('chunkPdf function', () => {
    it('should handle empty text', () => {
      const result = chunkPdf('');
      expect(result).toEqual([]);
    });

    it('should clean up whitespace and line breaks', () => {
      const messyText = `This   has   excessive    spaces.


Multiple line breaks.



And more formatting    issues.`;

      const result = chunkPdf(messyText);
      expect(result.length).toBeGreaterThan(0);

      // Check that excessive whitespace is normalized
      const firstChunk = result[0];
      expect(firstChunk).toBeTruthy();
      const content = firstChunk?.content;
      expect(content).not.toMatch(/ {2} +/); // No triple spaces
      expect(content).not.toMatch(/\n{3,}/); // No more than double line breaks
      expect(content!.startsWith('This has excessive spaces')).toBe(true);
    });

    it('should normalize different line ending types', () => {
      const textWithMixedLineEndings = 'Line 1\r\nLine 2\rLine 3\nLine 4';

      const result = chunkPdf(textWithMixedLineEndings);
      expect(result.length).toBeGreaterThan(0);

      // All line endings should be normalized to \n
      const firstChunk = result[0];
      expect(firstChunk).toBeTruthy();
      const content = firstChunk?.content;
      expect(content).not.toMatch(/\r/);
      expect(content).toMatch(/Line 1\nLine 2\nLine 3\nLine 4/);
    });

    it('should create appropriate chunks for long PDF content', () => {
      const longText = Array(100)
        .fill('This is a sample paragraph with enough content to test chunking behavior. ')
        .join('');

      const result = chunkPdf(longText);
      expect(result.length).toBeGreaterThan(1); // Should be split into multiple chunks

      result.forEach((chunk) => {
        expect(chunk.content.length).toBeLessThanOrEqual(1200 + 150); // DOC_MAX_CHARS + overlap
        expect(chunk.tokenCount).toBeGreaterThan(0);
      });
    });

    it('should preserve meaningful content structure', () => {
      const structuredText = `Title: Important Document

Section 1: Introduction
This section introduces the main concepts.

Section 2: Details
Here are the detailed explanations.

Conclusion
This concludes the document.`;

      const result = chunkPdf(structuredText);
      expect(result.length).toBeGreaterThan(0);

      const fullContent = result.map((chunk) => chunk.content).join('');
      expect(fullContent).toContain('Title: Important Document');
      expect(fullContent).toContain('Section 1: Introduction');
      expect(fullContent).toContain('Conclusion');
    });
  });
});
