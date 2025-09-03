import { describe, it, expect } from 'vitest';

import { sha256 } from '../src/infrastructure/legacy/hash.js';

describe('Hash utility', () => {
  describe('sha256', () => {
    it('should generate consistent hashes for the same input', () => {
      const text = 'Hello, world!';
      const hash1 = sha256(text);
      const hash2 = sha256(text);

      expect(hash1).toBe(hash2);
      expect(hash1).toBe('315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3');
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = sha256('text1');
      const hash2 = sha256('text2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = sha256('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(hash).toHaveLength(64);
    });

    it('should handle unicode characters', () => {
      const text = 'Hello 世界! 🌍';
      const hash = sha256(text);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(10000);
      const hash = sha256(longText);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be sensitive to small changes', () => {
      const hash1 = sha256('The quick brown fox jumps over the lazy dog');
      const hash2 = sha256('The quick brown fox jumps over the lazy dog.');

      expect(hash1).not.toBe(hash2);
    });

    it('should return lowercase hexadecimal', () => {
      const hash = sha256('test');

      expect(hash).toMatch(/^[a-f0-9]+$/);
      expect(hash).toBe(hash.toLowerCase());
    });

    it('should handle newlines and whitespace', () => {
      const text1 = 'line1\nline2\nline3';
      const text2 = 'line1\r\nline2\r\nline3';

      const hash1 = sha256(text1);
      const hash2 = sha256(text2);

      expect(hash1).not.toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
    });

    it('should handle binary-like content', () => {
      const binaryContent = '\x00\x01\x02\x03\xFF\xFE';
      const hash = sha256(binaryContent);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
