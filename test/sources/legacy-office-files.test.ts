import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the OnlyOffice converter
const mockConvertLegacyOffice = vi.fn();
vi.mock('../../src/ingest/parsers/onlyoffice.js', () => ({
  convertLegacyOffice: (...args: unknown[]) => mockConvertLegacyOffice(...args),
  isLegacyOffice: (p: string) => {
    const ext = p.toLowerCase();
    return ext.endsWith('.doc') || ext.endsWith('.xls') || ext.endsWith('.ppt');
  },
  getLegacyOutputExt: (p: string) => {
    const ext = path.extname(p).toLowerCase();
    const map: Record<string, string> = { '.doc': '.docx', '.xls': '.xlsx', '.ppt': '.pptx' };
    return map[ext];
  },
}));

// Mock mammoth (for parsing converted docx)
vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockImplementation(() => {
    return Promise.resolve({
      value: 'Converted document content from legacy DOC file.',
    });
  }),
}));

// Mock exceljs
vi.mock('exceljs', () => {
  class MockWorksheet {
    name = 'Sheet1';
    _rows = [
      ['Data', 'Value'],
      ['A', '1'],
    ];
    rowCount = 2;
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
        this.worksheets = [new MockWorksheet()];
        return Promise.resolve();
      }),
    };
  }
  return { Workbook: MockWorkbook };
});

// Mock jszip
vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn().mockResolvedValue({
      files: {
        'ppt/slides/slide1.xml': {
          async: () =>
            '<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide content</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
        },
      },
    }),
  },
}));

// Mock config
vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    FILE_ROOTS: ['./test/fixtures-legacy-office'],
    FILE_INCLUDE_GLOBS: ['**/*.{doc,xls,ppt,docx,xlsx,pptx,txt}'],
    FILE_EXCLUDE_GLOBS: ['**/{.git,node_modules}/**'],
    ONLYOFFICE_URL: 'http://localhost:8080',
    ONLYOFFICE_JWT_SECRET: '',
    ONLYOFFICE_TIMEOUT: 30000,
    EMBEDDINGS_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: '',
    OPENAI_EMBED_MODEL: 'text-embedding-3-small',
    OPENAI_EMBED_DIM: 1536,
    TEI_ENDPOINT: '',
    ENABLE_IMAGE_TO_TEXT: false,
    IMAGE_TO_TEXT_PROVIDER: 'openai',
    IMAGE_TO_TEXT_MODEL: 'gpt-4o-mini',
    ENABLE_AUDIO_TRANSCRIPTION: false,
    DB_TYPE: 'sqlite',
    DB_PATH: './test/legacy-office-test.db',
    POSTGRES_CONNECTION_STRING: '',
  },
}));

// Mock embeddings
vi.mock('../../src/ingest/embeddings.js', () => ({
  embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

// Mock image-to-text
vi.mock('../../src/ingest/image-to-text.js', () => ({
  getImageToTextProvider: vi.fn().mockReturnValue(null),
}));

import { SqliteAdapter } from '../../src/ingest/adapters/sqlite.js';
import { ingestFiles } from '../../src/ingest/sources/files.js';
import { CONFIG } from '../../src/shared/config.js';
import { testDbPath } from '../setup.js';

const fixturesDir = './test/fixtures-legacy-office';

describe('Legacy Office File Routing', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
    mkdirSync(fixturesDir, { recursive: true });

    adapter = new SqliteAdapter({ path: testDbPath, embeddingDim: 1536 });
    await adapter.init();

    mockConvertLegacyOffice.mockReset();
  });

  afterEach(async () => {
    await adapter.close();
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('should route .doc files through OnlyOffice conversion then parse as docx', async () => {
    writeFileSync(path.join(fixturesDir, 'report.doc'), 'legacy doc content');

    // Mock conversion: create a temp file that mammoth will parse
    const tempConvertedPath = path.join(fixturesDir, 'converted.docx');
    writeFileSync(tempConvertedPath, 'converted-docx');
    mockConvertLegacyOffice.mockResolvedValue(tempConvertedPath);

    await ingestFiles(adapter);

    expect(mockConvertLegacyOffice).toHaveBeenCalledWith(expect.stringContaining('report.doc'));

    // Verify document was indexed
    const docs = await adapter.rawQuery("SELECT * FROM documents WHERE uri LIKE '%report.doc'");
    expect(docs.length).toBe(1);
    expect(docs[0].lang).toBe('doc');
  });

  it('should skip legacy files when ONLYOFFICE_URL is not configured', async () => {
    writeFileSync(path.join(fixturesDir, 'report.doc'), 'legacy doc content');

    const mutableConfig = CONFIG as { ONLYOFFICE_URL: string };
    const originalUrl = mutableConfig.ONLYOFFICE_URL;
    mutableConfig.ONLYOFFICE_URL = '';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await ingestFiles(adapter);

      expect(mockConvertLegacyOffice).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ONLYOFFICE_URL not configured'),
      );

      // Verify no document was indexed
      const docs = await adapter.rawQuery("SELECT * FROM documents WHERE uri LIKE '%report.doc'");
      expect(docs.length).toBe(0);
    } finally {
      mutableConfig.ONLYOFFICE_URL = originalUrl;
      warnSpy.mockRestore();
    }
  });

  it('should continue processing other files when conversion fails', async () => {
    writeFileSync(path.join(fixturesDir, 'bad.doc'), 'legacy doc content');
    writeFileSync(path.join(fixturesDir, 'good.txt'), 'regular text content');

    mockConvertLegacyOffice.mockRejectedValue(new Error('Conversion failed'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await ingestFiles(adapter);

      // The .doc should have failed but .txt should still be indexed
      const txtDocs = await adapter.rawQuery("SELECT * FROM documents WHERE uri LIKE '%good.txt'");
      expect(txtDocs.length).toBe(1);

      const docDocs = await adapter.rawQuery("SELECT * FROM documents WHERE uri LIKE '%bad.doc'");
      expect(docDocs.length).toBe(0);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
