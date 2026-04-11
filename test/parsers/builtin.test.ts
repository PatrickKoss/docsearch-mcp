import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// Mock pdf-parse
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    getText = vi.fn().mockResolvedValue({ text: 'Parsed PDF text content' });
    getInfo = vi.fn().mockResolvedValue({ total: 3, info: { Title: 'Test PDF' } });
    constructor(_opts: { data: Buffer }) {}
  },
}));

// Mock mammoth
vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockResolvedValue({
    value: 'Parsed DOCX text content',
  }),
}));

// Mock exceljs
vi.mock('exceljs', () => {
  class MockWorksheet {
    name = 'Sheet1';
    rowCount = 1;
    _rows = [['A1', 'B1']];
    eachRow(callback: (row: { values: unknown[] }, rowNumber: number) => void) {
      this._rows.forEach((row, index) => {
        callback({ values: [undefined, ...row] }, index + 1);
      });
    }
  }

  class MockWorkbook {
    worksheets = [new MockWorksheet()];
    xlsx = {
      readFile: vi.fn().mockResolvedValue(undefined),
    };
  }

  return {
    Workbook: MockWorkbook,
  };
});

// Mock jszip
vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn().mockResolvedValue({
      files: {
        'ppt/slides/slide1.xml': {
          async: vi.fn().mockResolvedValue('<a:t>Slide text</a:t>'),
        },
      },
    }),
  },
}));

// Mock epub2
vi.mock('epub2', () => ({
  EPub: {
    createAsync: vi.fn().mockResolvedValue({
      metadata: { title: 'Test Book', creator: 'Author', language: 'en' },
      flow: [{ id: 'ch1', title: 'Chapter 1' }],
      getChapterAsync: vi.fn().mockResolvedValue('<p>Chapter content</p>'),
    }),
  },
}));

// Mock onlyoffice
vi.mock('../../src/ingest/parsers/onlyoffice.js', () => ({
  convertLegacyOffice: vi.fn().mockResolvedValue('/tmp/converted.docx'),
  getLegacyOutputExt: vi.fn().mockReturnValue('.docx'),
}));

import { BuiltinParser } from '../../src/ingest/parsers/builtin.js';

const fixturesDir = path.join(process.cwd(), 'test', 'fixtures-builtin-parser');

describe('BuiltinParser', () => {
  let parser: BuiltinParser;

  beforeAll(() => {
    mkdirSync(fixturesDir, { recursive: true });
    writeFileSync(path.join(fixturesDir, 'test.docx'), 'fake docx');
    writeFileSync(path.join(fixturesDir, 'test.xlsx'), 'fake xlsx');
    writeFileSync(path.join(fixturesDir, 'test.pptx'), 'fake pptx');
  });

  afterAll(() => {
    rmSync(fixturesDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    parser = new BuiltinParser();
    vi.clearAllMocks();
  });

  it('should parse PDF files', async () => {
    const buffer = Buffer.from('fake pdf');
    const result = await parser.parse('/test.pdf', buffer, '.pdf');

    expect(result.text).toBe('Parsed PDF text content');
    expect(result.contentType).toBe('text');
    expect(result.metadata).toHaveProperty('pages', 3);
  });

  it('should parse DOCX files', async () => {
    const filePath = path.join(fixturesDir, 'test.docx');
    const buffer = Buffer.from('fake docx');
    const result = await parser.parse(filePath, buffer, '.docx');

    expect(result.text).toBe('Parsed DOCX text content');
    expect(result.contentType).toBe('text');
    expect(result.metadata).toHaveProperty('format', 'docx');
  });

  it('should parse XLSX files', async () => {
    const filePath = path.join(fixturesDir, 'test.xlsx');
    const buffer = Buffer.from('fake xlsx');
    const result = await parser.parse(filePath, buffer, '.xlsx');

    expect(result.text).toContain('Sheet1');
    expect(result.contentType).toBe('text');
    expect(result.metadata).toHaveProperty('format', 'xlsx');
  });

  it('should parse PPTX files', async () => {
    const filePath = path.join(fixturesDir, 'test.pptx');
    const buffer = Buffer.from('fake pptx');
    const result = await parser.parse(filePath, buffer, '.pptx');

    expect(result.text).toContain('Slide text');
    expect(result.contentType).toBe('text');
    expect(result.metadata).toHaveProperty('format', 'pptx');
  });

  it('should parse EPUB files', async () => {
    const buffer = Buffer.from('fake epub');
    const result = await parser.parse('/test.epub', buffer, '.epub');

    expect(result.text).toContain('Chapter content');
    expect(result.contentType).toBe('text');
    expect(result.metadata).toHaveProperty('format', 'epub');
  });

  it('should fall back to plain text for unknown extensions', async () => {
    const buffer = Buffer.from('plain text content');
    const result = await parser.parse('/test.txt', buffer, '.txt');

    expect(result.text).toBe('plain text content');
    expect(result.contentType).toBe('text');
    expect(result.metadata).toEqual({});
  });

  it('should handle case-insensitive extensions', async () => {
    const buffer = Buffer.from('fake pdf');
    const result = await parser.parse('/test.PDF', buffer, '.PDF');

    expect(result.text).toBe('Parsed PDF text content');
    expect(result.contentType).toBe('text');
  });

  it('should warn and return empty text for legacy office without ONLYOFFICE_URL', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const buffer = Buffer.from('legacy doc');
    const result = await parser.parse('/test.doc', buffer, '.doc');

    expect(result.text).toBe('');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ONLYOFFICE_URL not configured'));
    warnSpy.mockRestore();
  });
});
