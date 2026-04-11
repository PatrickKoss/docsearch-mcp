import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { DoclingParser, isDoclingSupported } from '../../src/ingest/parsers/docling.js';

const { fetch: mockFetch } = await import('undici');

describe('DoclingParser', () => {
  let parser: DoclingParser;

  beforeEach(() => {
    parser = new DoclingParser('http://localhost:5001');
    vi.clearAllMocks();
  });

  it('should convert a PDF file and return markdown', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        document: {
          md_content: '# Test Document\n\nThis is the content.',
        },
      }),
      text: vi.fn(),
    };
    vi.mocked(mockFetch).mockResolvedValue(mockResponse as never);

    const buffer = Buffer.from('fake pdf content');
    const result = await parser.parse('/path/to/test.pdf', buffer, '.pdf');

    expect(result.text).toBe('# Test Document\n\nThis is the content.');
    expect(result.contentType).toBe('markdown');
    expect(result.metadata).toEqual({ parser: 'docling', sourceFormat: 'pdf' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5001/v1alpha/convert/file',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should handle alternative response format with md_content at top level', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        md_content: '# Direct Content',
      }),
      text: vi.fn(),
    };
    vi.mocked(mockFetch).mockResolvedValue(mockResponse as never);

    const buffer = Buffer.from('fake content');
    const result = await parser.parse('/path/to/test.docx', buffer, '.docx');

    expect(result.text).toBe('# Direct Content');
    expect(result.contentType).toBe('markdown');
  });

  it('should throw on HTTP error response', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: vi.fn(),
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    };
    vi.mocked(mockFetch).mockResolvedValue(mockResponse as never);

    const buffer = Buffer.from('fake content');
    await expect(parser.parse('/path/to/test.pdf', buffer, '.pdf')).rejects.toThrow(
      'Docling conversion failed (500)',
    );
  });

  it('should throw on network error', async () => {
    vi.mocked(mockFetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const buffer = Buffer.from('fake content');
    await expect(parser.parse('/path/to/test.pdf', buffer, '.pdf')).rejects.toThrow('ECONNREFUSED');
  });

  it('should strip trailing slash from base URL', async () => {
    const parserWithSlash = new DoclingParser('http://localhost:5001/');
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ content: 'text' }),
      text: vi.fn(),
    };
    vi.mocked(mockFetch).mockResolvedValue(mockResponse as never);

    const buffer = Buffer.from('fake content');
    await parserWithSlash.parse('/path/to/test.pdf', buffer, '.pdf');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5001/v1alpha/convert/file',
      expect.anything(),
    );
  });
});

describe('isDoclingSupported', () => {
  it('should return true for supported formats', () => {
    expect(isDoclingSupported('.pdf')).toBe(true);
    expect(isDoclingSupported('.docx')).toBe(true);
    expect(isDoclingSupported('.pptx')).toBe(true);
    expect(isDoclingSupported('.xlsx')).toBe(true);
    expect(isDoclingSupported('.html')).toBe(true);
    expect(isDoclingSupported('.epub')).toBe(true);
    expect(isDoclingSupported('.png')).toBe(true);
    expect(isDoclingSupported('.jpg')).toBe(true);
  });

  it('should return false for unsupported formats', () => {
    expect(isDoclingSupported('.mp3')).toBe(false);
    expect(isDoclingSupported('.mp4')).toBe(false);
    expect(isDoclingSupported('.ts')).toBe(false);
    expect(isDoclingSupported('.go')).toBe(false);
    expect(isDoclingSupported('.wav')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isDoclingSupported('.PDF')).toBe(true);
    expect(isDoclingSupported('.DOCX')).toBe(true);
  });
});
