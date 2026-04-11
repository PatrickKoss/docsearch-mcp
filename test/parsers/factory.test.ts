import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getDocumentParser', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return BuiltinParser with default config', async () => {
    const { getDocumentParser, resetDocumentParser } =
      await import('../../src/ingest/parsers/factory.js');
    const { BuiltinParser } = await import('../../src/ingest/parsers/builtin.js');
    resetDocumentParser();
    const parser = getDocumentParser();
    expect(parser).toBeInstanceOf(BuiltinParser);
    resetDocumentParser();
  });

  it('should cache the parser instance', async () => {
    const { getDocumentParser, resetDocumentParser } =
      await import('../../src/ingest/parsers/factory.js');
    resetDocumentParser();
    const parser1 = getDocumentParser();
    const parser2 = getDocumentParser();
    expect(parser1).toBe(parser2);
    resetDocumentParser();
  });

  it('should return a fresh instance after reset', async () => {
    const { getDocumentParser, resetDocumentParser } =
      await import('../../src/ingest/parsers/factory.js');
    resetDocumentParser();
    const parser1 = getDocumentParser();
    resetDocumentParser();
    const parser2 = getDocumentParser();
    expect(parser1).not.toBe(parser2);
    resetDocumentParser();
  });

  it('should throw when DOCUMENT_PARSER is docling but DOCLING_URL is not set', async () => {
    vi.doMock('../../src/shared/config.js', () => ({
      CONFIG: {
        DOCUMENT_PARSER: 'docling',
        DOCLING_URL: '',
      },
    }));

    const { getDocumentParser, resetDocumentParser } =
      await import('../../src/ingest/parsers/factory.js');
    resetDocumentParser();
    expect(() => getDocumentParser()).toThrow('DOCLING_URL is required');
    resetDocumentParser();
  });

  it('should return DoclingWithFallback when DOCUMENT_PARSER is docling with URL', async () => {
    vi.doMock('../../src/shared/config.js', () => ({
      CONFIG: {
        DOCUMENT_PARSER: 'docling',
        DOCLING_URL: 'http://localhost:5001',
      },
    }));

    const { getDocumentParser, resetDocumentParser } =
      await import('../../src/ingest/parsers/factory.js');
    const { BuiltinParser } = await import('../../src/ingest/parsers/builtin.js');
    resetDocumentParser();
    const parser = getDocumentParser();
    expect(parser).not.toBeInstanceOf(BuiltinParser);
    expect(parser).toHaveProperty('parse');
    resetDocumentParser();
  });
});
