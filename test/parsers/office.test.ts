import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock mammoth
vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockImplementation(({ buffer }: { buffer: Buffer }) => {
    const text = buffer.toString();
    if (text.includes('empty-docx')) {
      return Promise.resolve({ value: '' });
    }
    if (text.includes('corrupt-docx')) {
      throw new Error('Invalid DOCX file');
    }
    return Promise.resolve({
      value:
        'This is a test document.\n\nIt has multiple paragraphs.\n\nHeading: Introduction\n\nSome body text here.',
    });
  }),
}));

// Mock xlsx
vi.mock('xlsx', () => {
  const mockSheet1Data = [
    ['Name', 'Age', 'City'],
    ['Alice', 30, 'New York'],
    ['Bob', 25, 'London'],
  ];

  const mockSheet2Data = [
    ['Product', 'Price'],
    ['Widget', 9.99],
  ];

  return {
    read: vi.fn().mockImplementation((_buffer: Buffer, _opts: unknown) => {
      const text = _buffer.toString();
      if (text.includes('empty-xlsx')) {
        return {
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: {} },
        };
      }
      if (text.includes('multi-sheet')) {
        return {
          SheetNames: ['Data', 'Summary'],
          Sheets: {
            Data: { _mockData: mockSheet1Data },
            Summary: { _mockData: mockSheet2Data },
          },
        };
      }
      if (text.includes('pptx-content')) {
        return {
          SheetNames: ['Slide 1', 'Slide 2'],
          Sheets: {
            'Slide 1': { _mockData: [['Welcome to the Presentation'], ['Subtitle here']] },
            'Slide 2': { _mockData: [['Key Points'], ['Point 1: Testing'], ['Point 2: Quality']] },
          },
        };
      }
      if (text.includes('pptx-empty')) {
        return {
          SheetNames: ['Slide 1'],
          Sheets: { 'Slide 1': {} },
        };
      }
      return {
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: { _mockData: mockSheet1Data },
        },
      };
    }),
    utils: {
      sheet_to_json: vi.fn().mockImplementation((sheet: any, _opts: unknown) => {
        return sheet._mockData || [];
      }),
    },
  };
});

import { parseDocx, parseXlsx, parsePptx } from '../../src/ingest/parsers/office.js';

const fixturesDir = './test/fixtures-office';

describe('Office Document Parsing', () => {
  beforeEach(() => {
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
    mkdirSync(fixturesDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  describe('parseDocx', () => {
    it('should extract text from a DOCX file', async () => {
      const filePath = path.join(fixturesDir, 'test.docx');
      writeFileSync(filePath, 'mock-docx-content');

      const result = await parseDocx(filePath);

      expect(result.text).toContain('This is a test document');
      expect(result.text).toContain('multiple paragraphs');
      expect(result.metadata.format).toBe('docx');
    });

    it('should handle empty DOCX files', async () => {
      const filePath = path.join(fixturesDir, 'empty.docx');
      writeFileSync(filePath, 'empty-docx');

      const result = await parseDocx(filePath);

      expect(result.text).toBe('');
      expect(result.metadata.format).toBe('docx');
    });

    it('should throw on corrupted DOCX files', async () => {
      const filePath = path.join(fixturesDir, 'corrupt.docx');
      writeFileSync(filePath, 'corrupt-docx');

      await expect(parseDocx(filePath)).rejects.toThrow('Invalid DOCX file');
    });
  });

  describe('parseXlsx', () => {
    it('should extract text from an XLSX file', async () => {
      const filePath = path.join(fixturesDir, 'test.xlsx');
      writeFileSync(filePath, 'mock-xlsx-content');

      const result = await parseXlsx(filePath);

      expect(result.text).toContain('Sheet: Sheet1');
      expect(result.text).toContain('Name');
      expect(result.text).toContain('Alice');
      expect(result.metadata.format).toBe('xlsx');
      expect(result.metadata.sheetCount).toBe(1);
    });

    it('should handle multiple sheets', async () => {
      const filePath = path.join(fixturesDir, 'multi.xlsx');
      writeFileSync(filePath, 'multi-sheet');

      const result = await parseXlsx(filePath);

      expect(result.text).toContain('Sheet: Data');
      expect(result.text).toContain('Sheet: Summary');
      expect(result.text).toContain('Alice');
      expect(result.text).toContain('Widget');
      expect(result.metadata.sheetCount).toBe(2);
    });

    it('should handle empty XLSX files', async () => {
      const filePath = path.join(fixturesDir, 'empty.xlsx');
      writeFileSync(filePath, 'empty-xlsx');

      const result = await parseXlsx(filePath);

      expect(result.text).toBe('');
      expect(result.metadata.sheetCount).toBe(1);
    });
  });

  describe('parsePptx', () => {
    it('should extract text from slides', async () => {
      const filePath = path.join(fixturesDir, 'test.pptx');
      writeFileSync(filePath, 'pptx-content');

      const result = await parsePptx(filePath);

      expect(result.text).toContain('Slide 1');
      expect(result.text).toContain('Slide 2');
      expect(result.text).toContain('Welcome to the Presentation');
      expect(result.text).toContain('Key Points');
      expect(result.metadata.format).toBe('pptx');
      expect(result.metadata.slideCount).toBe(2);
    });

    it('should handle PPTX with no text', async () => {
      const filePath = path.join(fixturesDir, 'empty.pptx');
      writeFileSync(filePath, 'pptx-empty');

      const result = await parsePptx(filePath);

      expect(result.text).toBe('');
      expect(result.metadata.slideCount).toBe(1);
    });
  });
});
