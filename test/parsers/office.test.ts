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

// Mock exceljs
vi.mock('exceljs', () => {
  const mockSheet1Rows = [
    ['Name', 'Age', 'City'],
    ['Alice', 30, 'New York'],
    ['Bob', 25, 'London'],
  ];

  const mockSheet2Rows = [
    ['Product', 'Price'],
    ['Widget', 9.99],
  ];

  class MockWorksheet {
    name: string;
    _rows: unknown[][];
    rowCount: number;

    constructor(name: string, rows: unknown[][]) {
      this.name = name;
      this._rows = rows;
      this.rowCount = rows.length;
    }

    eachRow(callback: (row: { values: unknown[] }, rowNumber: number) => void) {
      this._rows.forEach((row, index) => {
        // ExcelJS row.values is 1-indexed: [undefined, cell1, cell2, ...]
        callback({ values: [undefined, ...row] }, index + 1);
      });
    }
  }

  class MockWorkbook {
    worksheets: MockWorksheet[] = [];

    xlsx = {
      readFile: vi.fn().mockImplementation((filePath: string) => {
        if (filePath.includes('empty')) {
          this.worksheets = [new MockWorksheet('Sheet1', [])];
        } else if (filePath.includes('multi')) {
          this.worksheets = [
            new MockWorksheet('Data', mockSheet1Rows),
            new MockWorksheet('Summary', mockSheet2Rows),
          ];
        } else {
          this.worksheets = [new MockWorksheet('Sheet1', mockSheet1Rows)];
        }
        return Promise.resolve();
      }),
    };
  }

  return {
    Workbook: MockWorkbook,
  };
});

// Mock jszip
vi.mock('jszip', () => {
  const mockSlide1Xml = `<?xml version="1.0"?>
<p:sld>
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>Welcome to the Presentation</a:t></a:r></a:p><a:p><a:r><a:t>Subtitle here</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  const mockSlide2Xml = `<?xml version="1.0"?>
<p:sld>
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>Key Points</a:t></a:r></a:p><a:p><a:r><a:t>Point 1: Testing</a:t></a:r></a:p><a:p><a:r><a:t>Point 2: Quality</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  const emptySlideXml = `<?xml version="1.0"?>
<p:sld><p:cSld><p:spTree></p:spTree></p:cSld></p:sld>`;

  return {
    default: {
      loadAsync: vi.fn().mockImplementation(async (buffer: Buffer) => {
        const text = buffer.toString();
        if (text.includes('pptx-empty')) {
          return {
            files: {
              'ppt/slides/slide1.xml': {
                async: () => Promise.resolve(emptySlideXml),
              },
            },
          };
        }
        return {
          files: {
            'ppt/slides/slide1.xml': {
              async: () => Promise.resolve(mockSlide1Xml),
            },
            'ppt/slides/slide2.xml': {
              async: () => Promise.resolve(mockSlide2Xml),
            },
          },
        };
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
