import { describe, it, expect } from 'vitest';

import type {
  SourceType,
  DocumentRow,
  ChunkRow,
  ChunkVecMapRow,
  VecChunkRow,
  MetaRow,
  SearchResultRow,
  ChunkInput,
  DocumentInput,
  ChunkWithMetadata,
} from '../src/shared/types.js';

describe('Type definitions', () => {
  describe('SourceType', () => {
    it('should accept valid source types', () => {
      const fileSource: SourceType = 'file';
      const confluenceSource: SourceType = 'confluence';

      expect(fileSource).toBe('file');
      expect(confluenceSource).toBe('confluence');
    });
  });

  describe('DocumentRow', () => {
    it('should create valid document row', () => {
      const doc: DocumentRow = {
        id: 1,
        source: 'file',
        uri: 'file:///test.ts',
        repo: 'test-repo',
        path: 'src/test.ts',
        title: 'Test File',
        lang: 'typescript',
        hash: 'abc123',
        mtime: Date.now(),
        version: '1.0',
        extra_json: '{"key": "value"}',
      };

      expect(doc.source).toBe('file');
      expect(doc.uri).toBe('file:///test.ts');
      expect(doc.hash).toBe('abc123');
    });

    it('should allow null values for optional fields', () => {
      const doc: DocumentRow = {
        source: 'confluence',
        uri: 'confluence://123',
        hash: 'def456',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extra_json: null,
      };

      expect(doc.repo).toBeNull();
      expect(doc.path).toBeNull();
    });

    it('should allow additional unknown properties', () => {
      const doc: DocumentRow = {
        source: 'file',
        uri: 'file:///test.ts',
        hash: 'abc123',
        customField: 'custom value',
        anotherField: 42,
      };

      expect((doc as any).customField).toBe('custom value');
      expect((doc as any).anotherField).toBe(42);
    });
  });

  describe('ChunkRow', () => {
    it('should create valid chunk row', () => {
      const chunk: ChunkRow = {
        id: 1,
        document_id: 1,
        chunk_index: 0,
        content: 'function test() { return true; }',
        start_line: 1,
        end_line: 1,
        token_count: 10,
      };

      expect(chunk.document_id).toBe(1);
      expect(chunk.content).toContain('function test');
      expect(chunk.token_count).toBe(10);
    });

    it('should allow null values for optional fields', () => {
      const chunk: ChunkRow = {
        document_id: 1,
        chunk_index: 0,
        content: 'Some content without line numbers',
        start_line: null,
        end_line: null,
        token_count: null,
      };

      expect(chunk.start_line).toBeNull();
      expect(chunk.end_line).toBeNull();
      expect(chunk.token_count).toBeNull();
    });
  });

  describe('ChunkVecMapRow', () => {
    it('should create valid chunk vector mapping', () => {
      const mapping: ChunkVecMapRow = {
        chunk_id: 1,
        vec_rowid: 42,
      };

      expect(mapping.chunk_id).toBe(1);
      expect(mapping.vec_rowid).toBe(42);
    });
  });

  describe('VecChunkRow', () => {
    it('should create valid vector chunk row', () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      const vecRow: VecChunkRow = {
        rowid: 1,
        embedding,
      };

      expect(vecRow.rowid).toBe(1);
      expect(vecRow.embedding).toBeInstanceOf(Float32Array);
      expect(vecRow.embedding[0]).toBeCloseTo(0.1, 5);
    });
  });

  describe('MetaRow', () => {
    it('should create valid metadata row', () => {
      const meta: MetaRow = {
        key: 'last_sync',
        value: '2024-01-01T00:00:00Z',
      };

      expect(meta.key).toBe('last_sync');
      expect(meta.value).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('SearchResultRow', () => {
    it('should create valid search result', () => {
      const result: SearchResultRow = {
        chunk_id: 1,
        score: 0.95,
        document_id: 1,
        source: 'file',
        uri: 'file:///test.ts',
        repo: 'test-repo',
        path: 'src/test.ts',
        title: 'Test File',
        start_line: 1,
        end_line: 5,
        snippet: 'function test() { return true; }',
      };

      expect(result.chunk_id).toBe(1);
      expect(result.score).toBe(0.95);
      expect(result.source).toBe('file');
      expect(result.snippet).toContain('function test');
    });

    it('should allow null optional fields in search results', () => {
      const result: SearchResultRow = {
        chunk_id: 1,
        score: 0.8,
        document_id: 1,
        source: 'confluence',
        uri: 'confluence://123',
        snippet: 'Some confluence content',
        repo: null,
        path: null,
        title: null,
        start_line: null,
        end_line: null,
      };

      expect(result.repo).toBeNull();
      expect(result.path).toBeNull();
      expect(result.start_line).toBeNull();
    });
  });

  describe('ChunkInput', () => {
    it('should create minimal chunk input', () => {
      const input: ChunkInput = {
        content: 'Simple chunk content',
      };

      expect(input.content).toBe('Simple chunk content');
      expect(input.startLine).toBeUndefined();
      expect(input.endLine).toBeUndefined();
      expect(input.tokenCount).toBeUndefined();
    });

    it('should create complete chunk input', () => {
      const input: ChunkInput = {
        content: 'function test() { return true; }',
        startLine: 1,
        endLine: 1,
        tokenCount: 10,
      };

      expect(input.content).toContain('function test');
      expect(input.startLine).toBe(1);
      expect(input.endLine).toBe(1);
      expect(input.tokenCount).toBe(10);
    });
  });

  describe('DocumentInput', () => {
    it('should create valid document input', () => {
      const input: DocumentInput = {
        source: 'file',
        uri: 'file:///test.ts',
        hash: 'abc123',
        repo: 'test-repo',
        path: 'src/test.ts',
        title: 'Test File',
        lang: 'typescript',
        mtime: Date.now(),
        version: '1.0',
        extra_json: null,
      };

      expect(input.source).toBe('file');
      expect(input.hash).toBe('abc123');
      expect('id' in input).toBe(false); // Should not have id property
    });
  });

  describe('ChunkWithMetadata', () => {
    it('should combine chunk and document data', () => {
      const document: DocumentRow = {
        id: 1,
        source: 'file',
        uri: 'file:///test.ts',
        hash: 'abc123',
      };

      const chunkWithMeta: ChunkWithMetadata = {
        id: 1,
        document_id: 1,
        chunk_index: 0,
        content: 'function test() {}',
        start_line: 1,
        end_line: 1,
        token_count: 10,
        document,
      };

      expect(chunkWithMeta.content).toContain('function test');
      expect(chunkWithMeta.document.id).toBe(1);
      expect(chunkWithMeta.document.source).toBe('file');
      expect(chunkWithMeta.document_id).toBe(chunkWithMeta.document.id);
    });
  });

  describe('Type constraints', () => {
    it('should enforce readonly properties', () => {
      const doc: DocumentRow = {
        source: 'file',
        uri: 'file:///test.ts',
        hash: 'abc123',
      };

      // These should cause TypeScript compilation errors if uncommented:
      // doc.source = 'confluence'  // Cannot assign to readonly property
      // doc.uri = 'different://uri' // Cannot assign to readonly property

      expect(doc.source).toBe('file');
    });

    it('should allow proper source type values only', () => {
      // These should compile fine
      const fileDoc: DocumentRow = { source: 'file', uri: 'test', hash: 'hash' };
      const confluenceDoc: DocumentRow = { source: 'confluence', uri: 'test', hash: 'hash' };

      expect(fileDoc.source).toBe('file');
      expect(confluenceDoc.source).toBe('confluence');

      // This should cause a TypeScript error if uncommented:
      // const invalidDoc: DocumentRow = { source: 'invalid', uri: 'test', hash: 'hash' }
    });
  });
});
