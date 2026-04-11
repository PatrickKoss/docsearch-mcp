import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SqliteAdapter } from '../src/ingest/adapters/sqlite.js';
import { sha256 } from '../src/ingest/hash.js';
import { IncrementalIndexer } from '../src/ingest/incremental-indexer.js';

describe('Content-based Deduplication', () => {
  let testDir: string;
  let adapter: SqliteAdapter;
  let indexer: IncrementalIndexer;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `test-dedup-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    adapter = new SqliteAdapter({
      path: path.join(testDir, 'test.db'),
      embeddingDim: 1536,
    });
    await adapter.init();

    indexer = new IncrementalIndexer(adapter);
  });

  afterEach(async () => {
    await adapter.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('getDocumentByHash', () => {
    it('should return matching document when hash exists', async () => {
      const hash = sha256('test content');
      await adapter.upsertDocument({
        source: 'file',
        uri: 'file:///old/path.ts',
        repo: null,
        path: 'old/path.ts',
        title: 'path.ts',
        lang: 'ts',
        hash,
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      const result = await adapter.getDocumentByHash(hash);

      expect(result).not.toBeNull();
      expect(result!.hash).toBe(hash);
      expect(result!.uri).toBe('file:///old/path.ts');
    });

    it('should return null when no document matches hash', async () => {
      const result = await adapter.getDocumentByHash('nonexistent-hash');

      expect(result).toBeNull();
    });
  });

  describe('updateDocumentUri', () => {
    it('should update uri, path, title, and mtime in-place', async () => {
      const hash = sha256('content');
      const docId = await adapter.upsertDocument({
        source: 'file',
        uri: 'file:///old/file.ts',
        repo: null,
        path: 'old/file.ts',
        title: 'file.ts',
        lang: 'ts',
        hash,
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      await adapter.updateDocumentUri(
        docId,
        'file:///new/renamed.ts',
        'new/renamed.ts',
        'renamed.ts',
        2000,
      );

      const updated = await adapter.getDocument('file:///new/renamed.ts');
      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(docId);

      const old = await adapter.getDocument('file:///old/file.ts');
      expect(old).toBeNull();
    });
  });

  describe('Move detection in IncrementalIndexer', () => {
    it('should detect file move by hash and update URI without reindexing', async () => {
      const content = 'function hello() {\n  return "world";\n}\n';

      // Index file at original location
      const result1 = await indexer.indexFileIncremental('old/file.ts', content, {
        source: 'file',
        uri: 'file:///old/file.ts',
        repo: null,
        path: 'old/file.ts',
        title: 'file.ts',
        lang: 'ts',
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      expect(result1.chunksAdded).toBeGreaterThan(0);
      const originalDocId = result1.documentId;

      // "Move" the file to a new location (same content, different URI)
      const result2 = await indexer.indexFileIncremental('new/file.ts', content, {
        source: 'file',
        uri: 'file:///new/file.ts',
        repo: null,
        path: 'new/file.ts',
        title: 'file.ts',
        lang: 'ts',
        mtime: 2000,
        version: null,
        extraJson: null,
      });

      // Should detect the move: same document ID, zero chunk changes
      expect(result2.documentId).toBe(originalDocId);
      expect(result2.chunksAdded).toBe(0);
      expect(result2.chunksModified).toBe(0);
      expect(result2.chunksDeleted).toBe(0);
      expect(result2.totalChunks).toBe(result1.totalChunks);

      // Old URI should not resolve
      const oldDoc = await adapter.getDocument('file:///old/file.ts');
      expect(oldDoc).toBeNull();

      // New URI should resolve to same doc
      const newDoc = await adapter.getDocument('file:///new/file.ts');
      expect(newDoc).not.toBeNull();
      expect(newDoc!.id).toBe(originalDocId);
    });

    it('should index independently when same content exists at two paths with existing URIs', async () => {
      const content = 'shared template content\n';

      // Index first copy
      await indexer.indexFileIncremental('docs/template.md', content, {
        source: 'file',
        uri: 'file:///docs/template.md',
        repo: null,
        path: 'docs/template.md',
        title: 'template.md',
        lang: 'md',
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      // Index second copy at different path - since URI lookup finds nothing,
      // hash lookup finds the first, and treats it as a move.
      // To test intentional duplicates, we need to re-index the first so it exists,
      // then index the second. The second won't find its own URI but will find the hash.
      // Per design: this is expected since we pick first match.
      // The real "intentional duplicate" case is when BOTH URIs already exist.

      // Re-index first at original location to restore it
      await indexer.indexFileIncremental('docs/template.md', content, {
        source: 'file',
        uri: 'file:///docs/template.md',
        repo: null,
        path: 'docs/template.md',
        title: 'template.md',
        lang: 'md',
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      // Now manually insert the second document
      await adapter.upsertDocument({
        source: 'file',
        uri: 'file:///examples/template.md',
        repo: null,
        path: 'examples/template.md',
        title: 'template.md',
        lang: 'md',
        hash: sha256(content),
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      // Now re-index the second - URI lookup should find it, so hash-based logic is skipped
      await indexer.indexFileIncremental('examples/template.md', content, {
        source: 'file',
        uri: 'file:///examples/template.md',
        repo: null,
        path: 'examples/template.md',
        title: 'template.md',
        lang: 'md',
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      // Both documents should exist independently
      const doc1 = await adapter.getDocument('file:///docs/template.md');
      const doc2 = await adapter.getDocument('file:///examples/template.md');
      expect(doc1).not.toBeNull();
      expect(doc2).not.toBeNull();
      expect(doc1!.id).not.toBe(doc2!.id);
    });
  });

  describe('Content key rename on move', () => {
    it('should rename stored content key when URI changes', async () => {
      const content = 'some file content\nwith multiple lines\n';

      // Index file and store content
      await indexer.indexFileIncremental('old/path.md', content, {
        source: 'file',
        uri: 'file:///old/path.md',
        repo: null,
        path: 'old/path.md',
        title: 'path.md',
        lang: 'md',
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      // Verify content stored under old key
      const oldContent = await adapter.getMeta('content:file:///old/path.md');
      expect(oldContent).toBe(content);

      // "Move" the file
      await indexer.indexFileIncremental('new/path.md', content, {
        source: 'file',
        uri: 'file:///new/path.md',
        repo: null,
        path: 'new/path.md',
        title: 'path.md',
        lang: 'md',
        mtime: 2000,
        version: null,
        extraJson: null,
      });

      // Content should now be under new key
      const newContent = await adapter.getMeta('content:file:///new/path.md');
      expect(newContent).toBe(content);
    });
  });

  describe('Stale document cleanup', () => {
    it('should delete documents whose URIs are not in the ingested set', async () => {
      // Create two documents
      await adapter.upsertDocument({
        source: 'file',
        uri: 'file:///root/a.ts',
        repo: null,
        path: 'root/a.ts',
        title: 'a.ts',
        lang: 'ts',
        hash: sha256('a'),
        mtime: 1000,
        version: null,
        extraJson: null,
      });
      await adapter.upsertDocument({
        source: 'file',
        uri: 'file:///root/b.ts',
        repo: null,
        path: 'root/b.ts',
        title: 'b.ts',
        lang: 'ts',
        hash: sha256('b'),
        mtime: 1000,
        version: null,
        extraJson: null,
      });

      // Delete only the stale one (b.ts not in ingested set)
      await adapter.deleteDocumentsByUris(['file:///root/b.ts']);

      const docA = await adapter.getDocument('file:///root/a.ts');
      const docB = await adapter.getDocument('file:///root/b.ts');

      expect(docA).not.toBeNull();
      expect(docB).toBeNull();
    });

    it('should handle empty stale URI list', async () => {
      // Should not throw
      await adapter.deleteDocumentsByUris([]);
    });
  });
});
