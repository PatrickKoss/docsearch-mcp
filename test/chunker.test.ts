import { describe, it, expect } from 'vitest';

import { chunkCode, chunkDoc } from '../src/ingest/chunker.ts';

describe('Chunker', () => {
  describe('chunkCode', () => {
    it('should handle empty input', () => {
      const result = chunkCode('');
      expect(result).toEqual([]);
    });

    it('should handle single line', () => {
      const result = chunkCode('const x = 1;');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('const x = 1;');
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(1);
      expect(result[0].tokenCount).toBeGreaterThan(0);
    });

    it('should chunk small code into single chunk', () => {
      const code = `function hello() {
  console.log("world");
  return true;
}`;
      const result = chunkCode(code);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(code);
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(4);
    });

    it('should split large code at natural boundaries', () => {
      const lines = [
        'function first() {',
        '  console.log("first");',
        '}',
        '',
        'function second() {',
        '  console.log("second");',
        '}',
      ];

      const code = lines.join('\n');
      const result = chunkCode(code);

      expect(result.length).toBeGreaterThan(0);

      const firstChunk = result[0];
      expect(firstChunk.content).toContain('function first()');
      expect(firstChunk.startLine).toBe(1);
    });

    it('should respect maximum character limit', () => {
      const largeLine = 'a'.repeat(1500);
      const result = chunkCode(largeLine);

      expect(result).toHaveLength(1);
      expect(result[0].content.length).toBeLessThanOrEqual(1500);
    });

    it('should handle mixed line endings', () => {
      const code = 'line1\r\nline2\nline3\r\nline4';
      const result = chunkCode(code);

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('line1');
      expect(result[0].content).toContain('line4');
    });

    it('should prefer to break at closing braces', () => {
      const code = `function test() {
  const x = 1;
  const y = 2;
}
function another() {
  const z = 3;
}`;

      const result = chunkCode(code);

      if (result.length > 1) {
        expect(result[0].content).toMatch(/\}\s*$/);
      }
    });

    it('should handle empty lines correctly', () => {
      const code = `line1

line3


line6`;

      const result = chunkCode(code);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(code);
    });
  });

  describe('chunkDoc', () => {
    it('should handle empty input', () => {
      const result = chunkDoc('');
      expect(result).toEqual([]);
    });

    it('should handle short text in single chunk', () => {
      const text = 'Short text that fits in one chunk.';
      const result = chunkDoc(text);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(text);
      expect(result[0].tokenCount).toBeGreaterThan(0);
      expect(result[0].startLine).toBeUndefined();
      expect(result[0].endLine).toBeUndefined();
    });

    it('should split long text into multiple chunks with overlap', () => {
      const text = 'a'.repeat(2000);
      const result = chunkDoc(text);

      expect(result.length).toBeGreaterThan(1);

      for (const chunk of result) {
        expect(chunk.content.length).toBeLessThanOrEqual(1200);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    });

    it('should create overlapping chunks', () => {
      const text = 'a'.repeat(1300);
      const result = chunkDoc(text);

      expect(result).toHaveLength(2);

      const firstChunk = result[0];
      const secondChunk = result[1];

      expect(firstChunk.content.length).toBe(1200);
      expect(secondChunk.content.length).toBe(250); // remaining 100 + 150 overlap

      const overlapStart = firstChunk.content.slice(-150);
      const overlapEnd = secondChunk.content.slice(0, 150);
      expect(overlapStart).toBe(overlapEnd);
    });

    it('should handle exact boundary cases', () => {
      const text = 'a'.repeat(1200);
      const result = chunkDoc(text);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(text);
    });

    it('should handle text slightly over boundary', () => {
      const text = 'a'.repeat(1201);
      const result = chunkDoc(text);

      expect(result).toHaveLength(2);
      expect(result[0].content.length).toBe(1200);
      expect(result[1].content.length).toBe(151); // 1 remaining + 150 overlap
    });
  });

  describe('Token counting', () => {
    it('should approximate tokens for simple text', () => {
      const chunk = chunkDoc('hello world test')[0];
      expect(chunk.tokenCount).toBe(Math.round(3 * 1.05 + 5)); // 3 words
    });

    it('should handle empty token counting', () => {
      const result = chunkDoc('   ');
      expect(result).toEqual([]);
    });

    it('should count tokens in code chunks', () => {
      const code = 'function test() { return true; }';
      const result = chunkCode(code);

      expect(result[0].tokenCount).toBeGreaterThan(5);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long single lines in code', () => {
      const longLine = `const x = ${'a'.repeat(2000)};`;
      const result = chunkCode(longLine);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(longLine);
    });

    it('should handle text with only whitespace', () => {
      const whitespace = '   \n  \t  \n   ';
      const result = chunkCode(whitespace);

      expect(result).toEqual([]);
    });

    it('should handle mixed content types', () => {
      const mixed = 'Text content\n\nfunction code() {\n  return "mixed";\n}';
      const result = chunkCode(mixed);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(mixed);
    });
  });
});
