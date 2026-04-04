import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';
import {
  ingestFilesIncremental,
  ingestSingleFileIncremental,
} from '../../src/ingest/sources/files-incremental.js';
import { testDbPath } from '../setup.js';

// Mock mammoth
vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockImplementation(({ buffer }: { buffer: Buffer }) => {
    const text = buffer.toString();
    return Promise.resolve({
      value: text.includes('v2') ? 'Updated document v2' : 'Original document content',
    });
  }),
}));

// Mock exceljs
vi.mock('exceljs', () => {
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
        callback({ values: [undefined, ...row] }, index + 1);
      });
    }
  }

  class MockWorkbook {
    worksheets: MockWorksheet[] = [];

    xlsx = {
      readFile: vi.fn().mockImplementation(() => {
        this.worksheets = [
          new MockWorksheet('Sheet1', [
            ['Data', 'Value'],
            ['Row1', 100],
          ]),
        ];
        return Promise.resolve();
      }),
    };
  }

  return {
    Workbook: MockWorkbook,
  };
});

// Mock epub2
vi.mock('epub2', () => {
  const createMockEpub = () => ({
    metadata: { title: 'Test Book' },
    flow: [{ id: 'ch1', title: 'Ch1' }],
    getChapterAsync: vi.fn().mockResolvedValue('<p>Chapter content.</p>'),
    getChapter: vi.fn(),
  });
  return {
    default: { createAsync: vi.fn().mockResolvedValue(createMockEpub()) },
    EPub: { createAsync: vi.fn().mockResolvedValue(createMockEpub()) },
  };
});

// Mock music-metadata
vi.mock('music-metadata', () => ({
  parseFile: vi.fn().mockResolvedValue({
    format: { duration: 60 },
    common: { title: 'Track' },
  }),
}));

vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    FILE_ROOTS: ['./test/fixtures-incr'],
    FILE_INCLUDE_GLOBS: ['**/*.{ts,md,docx,xlsx,epub,mp3}'],
    FILE_EXCLUDE_GLOBS: ['**/node_modules/**'],
    ENABLE_AUDIO_TRANSCRIPTION: false,
    WHISPER_API_KEY: '',
    WHISPER_BASE_URL: '',
    WHISPER_MODEL: 'whisper-1',
  },
}));

const fixturesDir = './test/fixtures-incr';

describe('Incremental indexing with new file formats', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();

    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
    mkdirSync(fixturesDir, { recursive: true });
  });

  afterEach(async () => {
    await adapter?.close();
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('should incrementally index DOCX files', async () => {
    writeFileSync(path.join(fixturesDir, 'doc.docx'), 'original');

    const stats1 = await ingestFilesIncremental(adapter);
    expect(stats1.filesProcessed).toBe(1);
    expect(stats1.totalChunksAdded).toBeGreaterThan(0);

    // Re-index without changes - should be skipped
    const stats2 = await ingestFilesIncremental(adapter);
    expect(stats2.filesProcessed).toBe(1);

    // Modify the file
    writeFileSync(path.join(fixturesDir, 'doc.docx'), 'v2-updated');
    const stats3 = await ingestFilesIncremental(adapter);
    expect(stats3.filesProcessed).toBe(1);
  });

  it('should incrementally index new format files added to directory', async () => {
    writeFileSync(path.join(fixturesDir, 'data.xlsx'), 'xlsx-content');

    const stats1 = await ingestFilesIncremental(adapter);
    expect(stats1.filesProcessed).toBe(1);

    // Add another file
    writeFileSync(path.join(fixturesDir, 'book.epub'), 'epub-content');
    const stats2 = await ingestFilesIncremental(adapter);
    expect(stats2.filesProcessed).toBe(2);
  });

  it('should handle single file incremental indexing for DOCX', async () => {
    const filePath = path.join(fixturesDir, 'single.docx');
    writeFileSync(filePath, 'docx-content');

    const result = await ingestSingleFileIncremental(adapter, filePath);
    expect(result).toBeTruthy();
    expect(result!.chunksAdded).toBeGreaterThan(0);
  });

  it('should handle mixed format incremental indexing', async () => {
    writeFileSync(path.join(fixturesDir, 'code.ts'), 'const x = 1;');
    writeFileSync(path.join(fixturesDir, 'doc.docx'), 'docx-content');
    writeFileSync(path.join(fixturesDir, 'notes.md'), '# Notes');

    const stats = await ingestFilesIncremental(adapter);
    expect(stats.filesProcessed).toBe(3);
    expect(stats.filesSkipped).toBe(0);
  });
});
