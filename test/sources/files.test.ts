import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';
import { ingestFiles } from '../../src/ingest/sources/files.js';
import { testDbPath } from '../setup.js';

vi.mock('../../src/infrastructure/config/legacy-config.js', () => ({
  CONFIG: {
    FILE_ROOTS: ['./test/fixtures'],
    FILE_INCLUDE_GLOBS: ['**/*.{ts,js,py,md,txt}'],
    FILE_EXCLUDE_GLOBS: ['**/node_modules/**', '**/.git/**'],
  },
}));

describe('File Source Ingestion', () => {
  let adapter: SqliteAdapter;
  const fixturesDir = './test/fixtures';
  const testFiles = {
    'sample.ts': `function hello(name: string) {
  return \`Hello, \${name}!\`;
}

export default hello;`,
    'README.md': `# Test Project

This is a test project for demonstration.

## Features

- Feature 1
- Feature 2`,
    'script.py': `def calculate(x, y):
    return x + y

if __name__ == "__main__":
    print(calculate(2, 3))`,
    'data.txt': 'Simple text file content for testing purposes.',
    'nested/deep.js': `const config = {
  debug: true,
  version: "1.0.0"
};

module.exports = config;`,
  };

  beforeEach(async () => {
    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();

    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }

    mkdirSync(fixturesDir, { recursive: true });
    mkdirSync(path.join(fixturesDir, 'nested'), { recursive: true });

    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = path.join(fixturesDir, filePath);
      const dir = path.dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, content, 'utf8');
    }
  });

  afterEach(async () => {
    await adapter?.close();
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  describe('ingestFiles', () => {
    it('should ingest all matching files', async () => {
      await ingestFiles(adapter);

      // Verify documents were ingested by checking for specific URIs
      const sampleDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/sample.ts')}`,
      );
      const readmeDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/README.md')}`,
      );
      const scriptDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/script.py')}`,
      );
      const dataDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/data.txt')}`,
      );
      const deepDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures/nested/deep.js')}`,
      );

      expect(sampleDoc).toBeTruthy();
      expect(readmeDoc).toBeTruthy();
      expect(scriptDoc).toBeTruthy();
      expect(dataDoc).toBeTruthy();
      expect(deepDoc).toBeTruthy();
    });

    it('should set correct document metadata', async () => {
      await ingestFiles(adapter);

      // Get the document directly from adapter - we'll need to access the internal db for metadata validation
      const sampleUri = `file://${path.resolve('./test/fixtures/sample.ts')}`;
      const sampleDoc = await adapter.getDocument(sampleUri);
      expect(sampleDoc).toBeTruthy();
      if (sampleDoc) {
        expect(sampleDoc.hash).toBeTruthy();
      }

      // For detailed metadata, we need to access the internal database
      // @ts-expect-error - accessing private property for testing
      const tsDoc = adapter.db.prepare("SELECT * FROM documents WHERE uri LIKE '%sample.ts'").get();
      expect(tsDoc).toBeTruthy();
      expect(tsDoc.source).toBe('file');
      expect(tsDoc.title).toBe('sample.ts');
      expect(tsDoc.lang).toBe('ts');
      expect(tsDoc.hash).toBeTruthy();
      expect(tsDoc.mtime).toBeGreaterThan(0);
      expect(tsDoc.path).toContain('sample.ts');
    });

    it('should create chunks for ingested files', async () => {
      await ingestFiles(adapter);

      // Check if any document has chunks
      const sampleUri = `file://${path.resolve('./test/fixtures/sample.ts')}`;
      const sampleDoc = await adapter.getDocument(sampleUri);
      expect(sampleDoc).toBeTruthy();
      if (sampleDoc) {
        const hasChunks = await adapter.hasChunks(sampleDoc.id);
        expect(hasChunks).toBe(true);
      } else {
        throw new Error('Sample document not found');
      }

      // Check for chunks containing 'hello'
      // @ts-expect-error - accessing private property for testing
      const chunkWithContent = adapter.db
        .prepare("SELECT * FROM chunks WHERE content LIKE '%hello%'")
        .get();
      expect(chunkWithContent).toBeTruthy();
    });

    it('should handle different file types appropriately', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const tsDoc = adapter.db.prepare("SELECT * FROM documents WHERE uri LIKE '%sample.ts'").get();
      // @ts-expect-error - accessing private property for testing
      const mdDoc = adapter.db.prepare("SELECT * FROM documents WHERE uri LIKE '%README.md'").get();
      // @ts-expect-error - accessing private property for testing
      const pyDoc = adapter.db.prepare("SELECT * FROM documents WHERE uri LIKE '%script.py'").get();

      expect(tsDoc.lang).toBe('ts');
      expect(mdDoc.lang).toBe('md');
      expect(pyDoc.lang).toBe('py');
    });

    it('should use code chunking for code files', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const tsDoc = adapter.db.prepare("SELECT * FROM documents WHERE uri LIKE '%sample.ts'").get();
      // @ts-expect-error - accessing private property for testing
      const chunks = adapter.db.prepare('SELECT * FROM chunks WHERE document_id = ?').all(tsDoc.id);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.start_line).toBeGreaterThan(0);
        expect(chunk.end_line).toBeGreaterThanOrEqual(chunk.start_line);
      });
    });

    it('should use document chunking for markdown files', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const mdDoc = adapter.db.prepare("SELECT * FROM documents WHERE uri LIKE '%README.md'").get();
      // @ts-expect-error - accessing private property for testing
      const chunks = adapter.db.prepare('SELECT * FROM chunks WHERE document_id = ?').all(mdDoc.id);

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should not re-chunk unchanged files', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const initialChunks = adapter.db.prepare('SELECT COUNT(*) as count FROM chunks').get();

      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const finalChunks = adapter.db.prepare('SELECT COUNT(*) as count FROM chunks').get();
      expect(finalChunks.count).toBe(initialChunks.count);
    });

    it('should handle file read errors gracefully', async () => {
      writeFileSync(path.join(fixturesDir, 'invalid.ts'), 'test content');

      const originalReadFile = fs.readFile;
      vi.spyOn(fs, 'readFile').mockImplementation(async (filePath, encoding) => {
        if (filePath.toString().includes('invalid.ts')) {
          throw new Error('Permission denied');
        }
        return originalReadFile(filePath, encoding);
      });

      await expect(ingestFiles(adapter)).resolves.not.toThrow();

      // @ts-expect-error - accessing private property for testing
      const documents = adapter.db.prepare('SELECT * FROM documents').all();
      expect(documents.some((d) => d.uri.includes('invalid.ts'))).toBe(false);
    });

    it('should generate proper file URIs', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const documents = adapter.db.prepare('SELECT * FROM documents').all();
      documents.forEach((doc) => {
        expect(doc.uri).toMatch(/^file:\/\/.*/);
      });
    });

    it('should set relative paths correctly', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const nestedDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%deep.js'")
        .get();
      expect(nestedDoc.path).toContain('nested/deep.js');
    });

    it('should handle nested directories', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const nestedDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%deep.js'")
        .get();
      expect(nestedDoc).toBeTruthy();
      expect(nestedDoc.title).toBe('deep.js');
    });

    it('should detect file changes and re-chunk', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const _originalChunks = adapter.db
        .prepare(
          'SELECT * FROM chunks JOIN documents ON chunks.document_id = documents.id WHERE documents.uri LIKE ?',
        )
        .all('%sample.ts%');

      const modifiedContent = `${testFiles['sample.ts']}\n\n// Modified content`;
      writeFileSync(path.join(fixturesDir, 'sample.ts'), modifiedContent);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const newChunks = adapter.db
        .prepare(
          'SELECT * FROM chunks JOIN documents ON chunks.document_id = documents.id WHERE documents.uri LIKE ?',
        )
        .all('%sample.ts%');

      expect(newChunks.some((c) => c.content.includes('Modified content'))).toBe(true);
    });
  });

  describe('File type detection', () => {
    it('should identify code files correctly', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const codeFiles = adapter.db
        .prepare("SELECT * FROM documents WHERE lang IN ('ts', 'js', 'py')")
        .all();
      expect(codeFiles.length).toBeGreaterThan(0);
    });

    it('should identify document files correctly', async () => {
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const docFiles = adapter.db
        .prepare("SELECT * FROM documents WHERE lang IN ('md', 'txt')")
        .all();
      expect(docFiles.length).toBeGreaterThan(0);
    });

    it('should handle unknown extensions within configured globs', async () => {
      // Create a file with an extension that matches the glob but isn't in CODE_EXT or DOC_EXT
      writeFileSync(path.join(fixturesDir, 'config.txt'), 'config file content');

      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const txtFile = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%config.txt'")
        .get();
      expect(txtFile).toBeTruthy();
      expect(txtFile.lang).toBe('txt');

      // Verify that files outside the glob pattern are NOT ingested
      writeFileSync(path.join(fixturesDir, 'unknown.xyz'), 'unknown file type content');
      await ingestFiles(adapter);

      // @ts-expect-error - accessing private property for testing
      const unknownFile = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%unknown.xyz'")
        .get();
      expect(unknownFile).toBeFalsy(); // Should not be ingested as it doesn't match the glob
    });
  });

  describe('Error handling', () => {
    it('should continue ingestion even if individual files fail', async () => {
      writeFileSync(path.join(fixturesDir, 'good.ts'), 'const x = 1;');

      const originalReadFile = fs.readFile;
      vi.spyOn(fs, 'readFile').mockImplementation(async (filePath, encoding) => {
        if (filePath.toString().includes('sample.ts')) {
          throw new Error('Read error');
        }
        return originalReadFile(filePath, encoding);
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await ingestFiles(adapter);

      expect(consoleSpy).toHaveBeenCalled();

      // @ts-expect-error - accessing private property for testing
      const goodDoc = adapter.db.prepare("SELECT * FROM documents WHERE uri LIKE '%good.ts'").get();
      expect(goodDoc).toBeTruthy();
    });
  });
});
