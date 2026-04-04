import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';
import { ingestFiles } from '../../src/ingest/sources/files.js';
import { testDbPath } from '../setup.js';

// Mock mammoth
vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockImplementation(({ buffer }: { buffer: Buffer }) => {
    const text = buffer.toString();
    if (text.includes('empty-docx')) {
      return Promise.resolve({ value: '' });
    }
    return Promise.resolve({
      value:
        'Project Proposal\n\nThis document outlines the key objectives and timeline for the project. The main goals include improving search functionality and adding support for more file formats.',
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
      readFile: vi.fn().mockImplementation((filePath: string) => {
        if (filePath.includes('empty')) {
          this.worksheets = [new MockWorksheet('Sheet1', [])];
        } else {
          this.worksheets = [
            new MockWorksheet('Revenue', [
              ['Month', 'Amount'],
              ['January', 50000],
              ['February', 55000],
            ]),
            new MockWorksheet('Expenses', [
              ['Category', 'Amount'],
              ['Salaries', 30000],
              ['Infrastructure', 10000],
            ]),
          ];
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
<p:sld><p:cSld><p:spTree>
  <p:sp><p:txBody><a:p><a:r><a:t>Quarterly Review</a:t></a:r></a:p><a:p><a:r><a:t>Q4 2024</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;

  const mockSlide2Xml = `<?xml version="1.0"?>
<p:sld><p:cSld><p:spTree>
  <p:sp><p:txBody><a:p><a:r><a:t>Revenue grew 15%</a:t></a:r></a:p><a:p><a:r><a:t>Customer satisfaction at 92%</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;

  return {
    default: {
      loadAsync: vi.fn().mockImplementation(async () => ({
        files: {
          'ppt/slides/slide1.xml': {
            async: () => Promise.resolve(mockSlide1Xml),
          },
          'ppt/slides/slide2.xml': {
            async: () => Promise.resolve(mockSlide2Xml),
          },
        },
      })),
    },
  };
});

// Mock epub2
vi.mock('epub2', () => {
  const createMockEpub = () => ({
    metadata: { title: 'The Great Gatsby', creator: 'F. Scott Fitzgerald', language: 'en' },
    flow: [
      { id: 'ch1', title: 'Chapter 1' },
      { id: 'ch2', title: 'Chapter 2' },
    ],
    getChapterAsync: vi.fn().mockImplementation((id: string) => {
      if (id === 'ch1') {
        return Promise.resolve('<p>In my younger and more vulnerable years.</p>');
      }
      if (id === 'ch2') {
        return Promise.resolve('<p>The valley of ashes is bounded on one side.</p>');
      }
      return Promise.reject(new Error('not found'));
    }),
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
    format: { duration: 180, bitrate: 128000, sampleRate: 44100, codec: 'MP3' },
    common: {
      artist: 'Test Band',
      album: 'Test Album',
      title: 'Test Song',
      track: { no: 1 },
      genre: ['Pop'],
    },
  }),
}));

// Mock undici for Whisper
vi.mock('undici', () => ({
  fetch: vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        text: 'Transcribed audio content about search functionality.',
        segments: [
          { start: 0, end: 5, text: 'Transcribed audio content' },
          { start: 5, end: 10, text: 'about search functionality.' },
        ],
      }),
  }),
}));

vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    FILE_ROOTS: ['./test/fixtures-integration'],
    FILE_INCLUDE_GLOBS: ['**/*.{ts,js,md,txt,pdf,docx,xlsx,pptx,epub,mp3}'],
    FILE_EXCLUDE_GLOBS: ['**/node_modules/**', '**/.git/**'],
    ENABLE_IMAGE_TO_TEXT: false,
    ENABLE_AUDIO_TRANSCRIPTION: false,
    WHISPER_API_KEY: '',
    WHISPER_BASE_URL: '',
    WHISPER_MODEL: 'whisper-1',
  },
}));

const fixturesDir = './test/fixtures-integration';

describe('Multi-format file ingestion', () => {
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

  describe('DOCX ingestion', () => {
    it('should ingest DOCX file and create searchable chunks', async () => {
      writeFileSync(path.join(fixturesDir, 'proposal.docx'), 'mock-docx-content');

      await ingestFiles(adapter);

      const doc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/proposal.docx')}`,
      );
      expect(doc).toBeTruthy();

      // @ts-expect-error - accessing private property for testing
      const dbDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%proposal.docx'")
        .get() as any;
      expect(dbDoc.lang).toBe('docx');
      expect(dbDoc.title).toBe('proposal');

      const hasChunks = await adapter.hasChunks(doc!.id);
      expect(hasChunks).toBe(true);

      // @ts-expect-error - accessing private property for testing
      const chunks = adapter.db
        .prepare('SELECT * FROM chunks WHERE document_id = ?')
        .all(doc!.id) as any[];
      expect(chunks.length).toBeGreaterThan(0);
      const allContent = chunks.map((c: any) => c.content).join(' ');
      expect(allContent).toContain('Project Proposal');
    });

    it('should skip empty DOCX files', async () => {
      writeFileSync(path.join(fixturesDir, 'empty.docx'), 'empty-docx');

      await ingestFiles(adapter);

      const doc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/empty.docx')}`,
      );
      expect(doc).toBeFalsy();
    });
  });

  describe('XLSX ingestion', () => {
    it('should ingest XLSX file and search for cell content', async () => {
      writeFileSync(path.join(fixturesDir, 'financials.xlsx'), 'mock-xlsx-content');

      await ingestFiles(adapter);

      const doc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/financials.xlsx')}`,
      );
      expect(doc).toBeTruthy();

      // @ts-expect-error - accessing private property for testing
      const dbDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%financials.xlsx'")
        .get() as any;
      expect(dbDoc.lang).toBe('xlsx');
      expect(dbDoc.extra_json).toBeTruthy();
      const extra = JSON.parse(dbDoc.extra_json);
      expect(extra.format).toBe('xlsx');
      expect(extra.sheetCount).toBe(2);

      // @ts-expect-error - accessing private property for testing
      const chunks = adapter.db
        .prepare('SELECT * FROM chunks WHERE document_id = ?')
        .all(doc!.id) as any[];
      const allContent = chunks.map((c: any) => c.content).join(' ');
      expect(allContent).toContain('Revenue');
      expect(allContent).toContain('Expenses');
    });
  });

  describe('PPTX ingestion', () => {
    it('should ingest PPTX file with slide text', async () => {
      writeFileSync(path.join(fixturesDir, 'review.pptx'), 'pptx-content');

      await ingestFiles(adapter);

      const doc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/review.pptx')}`,
      );
      expect(doc).toBeTruthy();

      // @ts-expect-error - accessing private property for testing
      const dbDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%review.pptx'")
        .get() as any;
      expect(dbDoc.lang).toBe('pptx');

      const hasChunks = await adapter.hasChunks(doc!.id);
      expect(hasChunks).toBe(true);
    });
  });

  describe('EPUB ingestion', () => {
    it('should ingest EPUB file and search across chapters', async () => {
      writeFileSync(path.join(fixturesDir, 'novel.epub'), 'mock-epub-content');

      await ingestFiles(adapter);

      const doc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/novel.epub')}`,
      );
      expect(doc).toBeTruthy();

      // @ts-expect-error - accessing private property for testing
      const dbDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%novel.epub'")
        .get() as any;
      expect(dbDoc.lang).toBe('epub');
      expect(dbDoc.title).toBe('novel');

      const extra = JSON.parse(dbDoc.extra_json);
      expect(extra.format).toBe('epub');
      expect(extra.title).toBe('The Great Gatsby');
      expect(extra.author).toBe('F. Scott Fitzgerald');
      expect(extra.chapterCount).toBe(2);

      const hasChunks = await adapter.hasChunks(doc!.id);
      expect(hasChunks).toBe(true);

      // @ts-expect-error - accessing private property for testing
      const chunks = adapter.db
        .prepare('SELECT * FROM chunks WHERE document_id = ?')
        .all(doc!.id) as any[];
      const allContent = chunks.map((c: any) => c.content).join(' ');
      expect(allContent).toContain('younger and more vulnerable');
    });
  });

  describe('Audio file ingestion (transcription disabled)', () => {
    it('should ingest audio file with metadata only', async () => {
      writeFileSync(path.join(fixturesDir, 'song.mp3'), 'fake-mp3-data');

      await ingestFiles(adapter);

      const doc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/song.mp3')}`,
      );
      expect(doc).toBeTruthy();

      // @ts-expect-error - accessing private property for testing
      const dbDoc = adapter.db
        .prepare("SELECT * FROM documents WHERE uri LIKE '%song.mp3'")
        .get() as any;
      expect(dbDoc.lang).toBe('audio');

      const extra = JSON.parse(dbDoc.extra_json);
      expect(extra.duration).toBe(180);
      expect(extra.artist).toBe('Test Band');
      expect(extra.isAudio).toBe(true);
    });
  });

  describe('Mixed format ingestion', () => {
    it('should ingest code, docs, office, epub, and audio together', async () => {
      writeFileSync(path.join(fixturesDir, 'code.ts'), 'const x = 1;');
      writeFileSync(path.join(fixturesDir, 'readme.md'), '# Hello World');
      writeFileSync(path.join(fixturesDir, 'doc.docx'), 'mock-docx-content');
      writeFileSync(path.join(fixturesDir, 'data.xlsx'), 'mock-xlsx-content');
      writeFileSync(path.join(fixturesDir, 'book.epub'), 'mock-epub-content');
      writeFileSync(path.join(fixturesDir, 'track.mp3'), 'fake-mp3-data');

      await ingestFiles(adapter);

      // All files should be indexed
      const tsDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/code.ts')}`,
      );
      const mdDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/readme.md')}`,
      );
      const docxDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/doc.docx')}`,
      );
      const xlsxDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/data.xlsx')}`,
      );
      const epubDoc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/book.epub')}`,
      );
      const mp3Doc = await adapter.getDocument(
        `file://${path.resolve('./test/fixtures-integration/track.mp3')}`,
      );

      expect(tsDoc).toBeTruthy();
      expect(mdDoc).toBeTruthy();
      expect(docxDoc).toBeTruthy();
      expect(xlsxDoc).toBeTruthy();
      expect(epubDoc).toBeTruthy();
      expect(mp3Doc).toBeTruthy();
    });
  });
});
