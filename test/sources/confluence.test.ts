import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { openDb } from '../../src/ingest/db.js';
import { ingestConfluence } from '../../src/ingest/sources/confluence.js';
import { testDbPath } from '../setup.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    CONFLUENCE_BASE_URL: 'https://test.atlassian.net/wiki',
    CONFLUENCE_EMAIL: 'test@example.com',
    CONFLUENCE_API_TOKEN: 'test-token',
    CONFLUENCE_SPACES: ['PROJ', 'DOCS'],
  },
}));

describe('Confluence Source Ingestion', () => {
  let db: ReturnType<typeof openDb>;
  let consoleSpy: any;

  beforeEach(() => {
    db = openDb({ path: testDbPath, embeddingDim: 1536 });
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    db?.close();
    consoleSpy?.mockRestore();
  });

  const mockSearchResponse = {
    results: [
      {
        content: { id: 'page123' },
      },
      {
        content: { id: 'page456' },
      },
    ],
    _links: {},
  };

  const mockPageResponse = (id: string, title: string, content: string) => ({
    id,
    title,
    body: {
      storage: {
        value: content,
      },
    },
    version: {
      number: 1,
      when: '2024-01-01T00:00:00.000Z',
    },
    space: {
      key: 'PROJ',
    },
    _links: {
      webui: `/pages/viewpage.action?pageId=${id}`,
    },
  });

  describe('ingestConfluence', () => {
    it('should skip when required config is missing', async () => {
      // Save original config
      const { CONFIG } = await import('../../src/shared/config.js');
      const originalConfig = { ...CONFIG };

      // Temporarily modify config
      Object.assign(CONFIG, {
        CONFLUENCE_BASE_URL: '',
        CONFLUENCE_EMAIL: '',
        CONFLUENCE_API_TOKEN: '',
        CONFLUENCE_SPACES: [],
      });

      await ingestConfluence(db);

      expect(consoleSpy).toHaveBeenCalledWith('Confluence env missing; skipping');
      expect(mockFetch).not.toHaveBeenCalled();

      // Restore original config
      Object.assign(CONFIG, originalConfig);
    });

    it('should fetch and ingest pages from configured spaces', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              mockPageResponse('page123', 'Test Page 1', '<h1>Hello World</h1><p>Content here</p>'),
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              mockPageResponse(
                'page456',
                'Test Page 2',
                '<h2>Another Page</h2><p>More content</p>',
              ),
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/search?cql='),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LXRva2Vu',
            Accept: 'application/json',
          }),
        }),
      );

      const documents = db.prepare('SELECT * FROM documents WHERE source = ?').all('confluence');
      expect(documents).toHaveLength(2);

      const doc1 = documents.find((d) => d.title === 'Test Page 1');
      expect(doc1).toBeTruthy();
      expect(doc1.uri).toBe('confluence://page123');
      expect(doc1.source).toBe('confluence');
      expect(doc1.lang).toBe('md');
      expect(doc1.version).toBe('1');
      expect(doc1.hash).toBeTruthy();
    });

    it('should convert HTML to markdown', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              mockPageResponse(
                'page123',
                'HTML Page',
                '<h1>Title</h1><p><strong>Bold</strong> and <em>italic</em> text</p>',
              ),
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(mockPageResponse('page456', 'Simple Page', '<p>Simple content</p>')),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);

      const chunks = db.prepare('SELECT * FROM chunks ORDER BY id').all();
      expect(chunks.length).toBeGreaterThan(0);

      const markdownChunk = chunks.find((c) => c.content.includes('# Title'));
      expect(markdownChunk).toBeTruthy();
      expect(markdownChunk.content).toContain('**Bold**');
      expect(markdownChunk.content).toContain('_italic_');
    });

    it('should handle incremental sync with lastModified filter', async () => {
      const indexer = new (await import('../../src/ingest/indexer.js')).Indexer(db);
      indexer.setMeta('confluence.lastSync.PROJ', '2024-01-01T00:00:00.000Z');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('lastmodified%20%3E%3D%202024-01-01T00%3A00%3A00.000Z'),
        expect.any(Object),
      );
    });

    it('should handle pagination', async () => {
      const page1Response = {
        results: [{ content: { id: 'page1' } }],
        _links: { next: '/next-page' },
      };
      const page2Response = {
        results: [{ content: { id: 'page2' } }],
        _links: {},
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page1Response),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPageResponse('page1', 'Page 1', '<p>Content 1</p>')),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page2Response),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPageResponse('page2', 'Page 2', '<p>Content 2</p>')),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);

      const documents = db
        .prepare('SELECT COUNT(*) as count FROM documents WHERE source = ?')
        .get('confluence');
      expect(documents.count).toBe(2);
    });

    it('should store page metadata correctly', async () => {
      const pageData = {
        id: 'page123',
        title: 'Test Page',
        body: { storage: { value: '<p>Content</p>' } },
        version: { number: 5, when: '2024-01-15T12:00:00.000Z' },
        space: { key: 'PROJ' },
        _links: { webui: '/pages/viewpage.action?pageId=page123' },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [{ content: { id: 'page123' } }], _links: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(pageData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);

      const doc = db.prepare('SELECT * FROM documents WHERE uri = ?').get('confluence://page123');
      expect(doc).toBeTruthy();
      expect(doc.title).toBe('Test Page');
      expect(doc.version).toBe('5');
      expect(doc.mtime).toBe(Date.parse('2024-01-15T12:00:00.000Z'));

      const extraJson = JSON.parse(doc.extra_json);
      expect(extraJson.space).toBe('PROJ');
      expect(extraJson.webui).toBe('/pages/viewpage.action?pageId=page123');
    });

    it('should not re-chunk unchanged pages', async () => {
      const pageData = mockPageResponse('page123', 'Test Page', '<p>Unchanged content</p>');

      // First ingestion
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [{ content: { id: 'page123' } }], _links: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(pageData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);
      const initialChunks = db.prepare('SELECT COUNT(*) as count FROM chunks').get().count;

      // Second ingestion with same content
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [{ content: { id: 'page123' } }], _links: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(pageData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);
      const finalChunks = db.prepare('SELECT COUNT(*) as count FROM chunks').get().count;

      expect(finalChunks).toBe(initialChunks);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(ingestConfluence(db)).rejects.toThrow('Confluence 401: Unauthorized');
    });

    it('should handle missing page content gracefully', async () => {
      const incompleteResult = { content: { id: 'page123' } };
      const pageWithoutBody = {
        id: 'page123',
        title: 'No Body',
        version: { number: 1, when: '2024-01-01T00:00:00.000Z' },
        space: { key: 'PROJ' },
        _links: { webui: '/test' },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [incompleteResult], _links: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(pageWithoutBody),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);

      const doc = db.prepare('SELECT * FROM documents WHERE uri = ?').get('confluence://page123');
      expect(doc).toBeTruthy();
      expect(doc.title).toBe('No Body');
    });

    it('should update sync metadata after successful ingestion', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      const beforeSync = Date.now();
      await ingestConfluence(db);
      const afterSync = Date.now();

      const indexer = new (await import('../../src/ingest/indexer.js')).Indexer(db);
      const syncTime1 = indexer.getMeta('confluence.lastSync.PROJ');
      const syncTime2 = indexer.getMeta('confluence.lastSync.DOCS');

      expect(syncTime1).toBeTruthy();
      expect(syncTime2).toBeTruthy();

      const sync1Timestamp = Date.parse(syncTime1 ?? '');
      const sync2Timestamp = Date.parse(syncTime2 ?? '');

      expect(sync1Timestamp).toBeGreaterThanOrEqual(beforeSync);
      expect(sync1Timestamp).toBeLessThanOrEqual(afterSync);
      expect(sync2Timestamp).toBeGreaterThanOrEqual(beforeSync);
      expect(sync2Timestamp).toBeLessThanOrEqual(afterSync);
    });

    it('should handle pages with alternative ID structure', async () => {
      const resultWithDirectId = { id: 'direct123' };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [resultWithDirectId], _links: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              mockPageResponse('direct123', 'Direct ID Page', '<p>Direct content</p>'),
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);

      const doc = db.prepare('SELECT * FROM documents WHERE uri = ?').get('confluence://direct123');
      expect(doc).toBeTruthy();
      expect(doc.title).toBe('Direct ID Page');
    });
  });

  describe('Authentication', () => {
    it('should use correct basic auth header', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [], _links: {} }),
        });

      await ingestConfluence(db);

      const expectedAuth = Buffer.from('test@example.com:test-token').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedAuth}`,
          }),
        }),
      );
    });
  });
});
