import { describe, it, expect } from 'vitest';

import { chunkCode, chunkDoc } from '../src/ingest/chunker.js';

describe('Chunker (Working)', () => {
  describe('chunkCode', () => {
    it('should handle empty input', () => {
      const result = chunkCode('');
      expect(result).toEqual([]);
    });

    it('should handle single line', () => {
      const result = chunkCode('const x = 1;');
      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe('const x = 1;');
      expect(result[0]?.startLine).toBe(1);
      expect(result[0]?.endLine).toBe(1);
      expect(result[0]?.tokenCount).toBeGreaterThan(0);
    });

    it('should chunk small code', () => {
      const code = 'function hello() {\n  return "world";\n}';
      const result = chunkCode(code);
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe(code);
    });
  });

  describe('chunkDoc', () => {
    it('should handle empty input', () => {
      const result = chunkDoc('');
      expect(result).toEqual([]);
    });

    it('should handle short text', () => {
      const text = 'Short document text';
      const result = chunkDoc(text);
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe(text);
    });

    it('should split long text', () => {
      const text = 'a'.repeat(2000);
      const result = chunkDoc(text);
      expect(result.length).toBeGreaterThan(1);
    });
  });
});
