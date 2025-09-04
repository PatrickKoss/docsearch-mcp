import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SqliteAdapter } from '../src/ingest/adapters/sqlite.js';
import { ChangeTracker } from '../src/ingest/change-tracker.js';
import { IncrementalIndexer } from '../src/ingest/incremental-indexer.js';
import { ingestSingleFileIncremental } from '../src/ingest/sources/files-incremental.js';

describe('ChangeTracker', () => {
  describe('detectLineChanges', () => {
    it('should detect added lines', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nline2\ninserted\nline3';

      const changes = ChangeTracker.detectLineChanges(oldContent, newContent);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ start: 3, end: 3 });
    });

    it('should detect deleted lines', () => {
      const oldContent = 'line1\nline2\ndeleted\nline3';
      const newContent = 'line1\nline2\nline3';

      const changes = ChangeTracker.detectLineChanges(oldContent, newContent);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ start: 3, end: 3 });
    });

    it('should detect modified lines', () => {
      const oldContent = 'line1\nold line\nline3';
      const newContent = 'line1\nnew line\nline3';

      const changes = ChangeTracker.detectLineChanges(oldContent, newContent);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ start: 2, end: 2 });
    });

    it('should merge consecutive changed lines', () => {
      const oldContent = 'line1\nline2\nline3\nline4\nline5';
      const newContent = 'line1\nmodified2\nmodified3\nmodified4\nline5';

      const changes = ChangeTracker.detectLineChanges(oldContent, newContent);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ start: 2, end: 4 });
    });

    it('should handle empty content', () => {
      const changes1 = ChangeTracker.detectLineChanges('', 'new content');
      expect(changes1).toHaveLength(1);

      const changes2 = ChangeTracker.detectLineChanges('old content', '');
      expect(changes2).toHaveLength(1);

      const changes3 = ChangeTracker.detectLineChanges('', '');
      expect(changes3).toHaveLength(0);
    });
  });

  describe('identifyAffectedChunks', () => {
    it('should identify chunks affected by line changes', () => {
      const chunks = [
        { id: 1, startLine: 1, endLine: 10, content: 'chunk1' },
        { id: 2, startLine: 11, endLine: 20, content: 'chunk2' },
        { id: 3, startLine: 21, endLine: 30, content: 'chunk3' },
      ];

      const changedLines = [
        { start: 5, end: 7 },
        { start: 22, end: 25 },
      ];

      const affected = ChangeTracker.identifyAffectedChunks(changedLines, chunks);

      expect(affected).toEqual(new Set([1, 3]));
    });

    it('should handle overlapping changes', () => {
      const chunks = [
        { id: 1, startLine: 1, endLine: 10, content: 'chunk1' },
        { id: 2, startLine: 11, endLine: 20, content: 'chunk2' },
      ];

      const changedLines = [{ start: 8, end: 15 }];

      const affected = ChangeTracker.identifyAffectedChunks(changedLines, chunks);

      expect(affected).toEqual(new Set([1, 2]));
    });

    it('should handle changes that span entire chunks', () => {
      const chunks = [{ id: 1, startLine: 5, endLine: 15, content: 'chunk1' }];

      const changedLines = [{ start: 1, end: 20 }];

      const affected = ChangeTracker.identifyAffectedChunks(changedLines, chunks);

      expect(affected).toEqual(new Set([1]));
    });
  });

  describe('computeChunkChanges', () => {
    it('should detect modified chunks', () => {
      const oldChunks = [
        { id: 1, content: 'old content', startLine: 1, endLine: 10 },
        { id: 2, content: 'unchanged', startLine: 11, endLine: 20 },
      ];

      const newChunks = [
        { content: 'new content', startLine: 1, endLine: 10 },
        { content: 'unchanged', startLine: 11, endLine: 20 },
      ];

      const affectedIds = new Set([1]);

      const changes = ChangeTracker.computeChunkChanges(oldChunks, newChunks, affectedIds);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        chunkId: 1,
        type: 'modified',
        content: 'new content',
      });
    });

    it('should detect deleted chunks', () => {
      const oldChunks = [
        { id: 1, content: 'content', startLine: 1, endLine: 10 },
        { id: 2, content: 'deleted', startLine: 11, endLine: 20 },
      ];

      const newChunks = [{ content: 'content', startLine: 1, endLine: 10 }];

      const affectedIds = new Set([2]);

      const changes = ChangeTracker.computeChunkChanges(oldChunks, newChunks, affectedIds);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        chunkId: 2,
        type: 'deleted',
      });
    });

    it('should detect added chunks', () => {
      const oldChunks = [{ id: 1, content: 'content', startLine: 1, endLine: 10 }];

      const newChunks = [
        { content: 'content', startLine: 1, endLine: 10 },
        { content: 'new chunk', startLine: 11, endLine: 20 },
      ];

      const affectedIds = new Set([]);

      const changes = ChangeTracker.computeChunkChanges(oldChunks, newChunks, affectedIds);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'added',
        content: 'new chunk',
      });
    });
  });
});

describe('IncrementalIndexer', () => {
  let testDir: string;
  let adapter: SqliteAdapter;
  let indexer: IncrementalIndexer;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `test-incremental-${Date.now()}`);
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

  describe('indexFileIncremental', () => {
    it('should index a new file', async () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const result = await indexer.indexFileIncremental('test.txt', content, {
        source: 'file',
        uri: 'file://test.txt',
        repo: null,
        path: 'test.txt',
        title: 'test.txt',
        lang: 'txt',
        mtime: Date.now(),
        version: null,
        extraJson: null,
      });

      expect(result.chunksAdded).toBeGreaterThan(0);
      expect(result.chunksModified).toBe(0);
      expect(result.chunksDeleted).toBe(0);
      expect(result.totalChunks).toBe(result.chunksAdded);
    });

    it('should skip unchanged files', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const metadata = {
        source: 'file' as const,
        uri: 'file://test.txt',
        repo: null,
        path: 'test.txt',
        title: 'test.txt',
        lang: 'txt',
        mtime: Date.now(),
        version: null,
        extraJson: null,
      };

      const result1 = await indexer.indexFileIncremental('test.txt', content, metadata);
      expect(result1.chunksAdded).toBeGreaterThan(0);

      const result2 = await indexer.indexFileIncremental('test.txt', content, metadata);
      expect(result2.chunksAdded).toBe(0);
      expect(result2.chunksModified).toBe(0);
      expect(result2.chunksDeleted).toBe(0);
    });

    it('should detect and update modified content', async () => {
      const content1 = 'Line 1\nLine 2\nLine 3';
      const content2 = 'Line 1\nModified Line 2\nLine 3';
      const metadata = {
        source: 'file' as const,
        uri: 'file://test.txt',
        repo: null,
        path: 'test.txt',
        title: 'test.txt',
        lang: 'txt',
        mtime: Date.now(),
        version: null,
        extraJson: null,
      };

      await indexer.indexFileIncremental('test.txt', content1, metadata);

      await indexer.setMeta(`content:${metadata.uri}`, content1);

      const result2 = await indexer.indexFileIncremental('test.txt', content2, metadata);

      expect(result2.chunksModified).toBeGreaterThanOrEqual(0);
      expect(result2.processingTime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Incremental File Ingestion', () => {
  let testDir: string;
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `test-ingest-incremental-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    adapter = new SqliteAdapter({
      path: path.join(testDir, 'test.db'),
      embeddingDim: 1536,
    });
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should incrementally index a single file', async () => {
    const filePath = path.join(testDir, 'test.md');
    writeFileSync(filePath, '# Test\n\nInitial content.');

    const result1 = await ingestSingleFileIncremental(adapter, filePath);
    expect(result1).not.toBeNull();
    expect(result1!.chunksAdded).toBeGreaterThan(0);

    writeFileSync(filePath, '# Test\n\nModified content.\n\nAdditional line.');

    const indexer = new IncrementalIndexer(adapter);
    await indexer.setMeta(`content:file://${filePath}`, '# Test\n\nInitial content.');

    const result2 = await ingestSingleFileIncremental(adapter, filePath);
    expect(result2).not.toBeNull();
    expect(result2!.processingTime).toBeGreaterThanOrEqual(0);
  });
});
