import { fetch } from 'undici';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

const mockFetch = vi.mocked(fetch);

describe('Embeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('OpenAIEmbedder', () => {
    beforeEach(() => {
      vi.doMock('../src/infrastructure/config/legacy-config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          OPENAI_EMBED_MODEL: 'text-embedding-3-small',
          OPENAI_EMBED_DIM: 1536,
          TEI_ENDPOINT: 'http://localhost:8080',
          EMBEDDINGS_PROVIDER: 'openai',
        },
      }));
    });

    it('should initialize with correct configuration', async () => {
      const { OpenAIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new OpenAIEmbedder();
      expect(embedder.dim).toBe(1536);
    });

    it('should throw error if API key is missing', async () => {
      vi.doMock('../src/infrastructure/config/legacy-config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: '',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          OPENAI_EMBED_MODEL: 'text-embedding-3-small',
          OPENAI_EMBED_DIM: 1536,
          TEI_ENDPOINT: 'http://localhost:8080',
          EMBEDDINGS_PROVIDER: 'openai',
        },
      }));

      const { OpenAIEmbedder } = await import('../src/ingest/embeddings.js');
      expect(() => new OpenAIEmbedder()).toThrow('OPENAI_API_KEY missing');
    });

    it('should return empty array for empty input', async () => {
      const { OpenAIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new OpenAIEmbedder();
      const result = await embedder.embed([]);
      expect(result).toEqual([]);
    });

    it('should make correct API call and return embeddings', async () => {
      const { OpenAIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new OpenAIEmbedder();

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await embedder.embed(['text1', 'text2']);

      expect(mockFetch).toHaveBeenCalledWith('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: ['text1', 'text2'],
        }),
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Float32Array);
      expect(Array.from(result[0]!)).toEqual(
        expect.arrayContaining([
          expect.closeTo(0.1, 5),
          expect.closeTo(0.2, 5),
          expect.closeTo(0.3, 5),
        ]),
      );
      expect(Array.from(result[1]!)).toEqual(
        expect.arrayContaining([
          expect.closeTo(0.4, 5),
          expect.closeTo(0.5, 5),
          expect.closeTo(0.6, 5),
        ]),
      );
    });

    it('should handle API errors', async () => {
      const { OpenAIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new OpenAIEmbedder();

      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await expect(embedder.embed(['text'])).rejects.toThrow(
        'Embeddings API error 401: Unauthorized',
      );
    });
  });

  describe('TEIEmbedder', () => {
    beforeEach(() => {
      vi.doMock('../src/infrastructure/config/legacy-config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          OPENAI_EMBED_MODEL: 'text-embedding-3-small',
          OPENAI_EMBED_DIM: 1536,
          TEI_ENDPOINT: 'http://localhost:8080',
          EMBEDDINGS_PROVIDER: 'tei',
        },
      }));
    });

    it('should initialize with correct configuration', async () => {
      const { TEIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new TEIEmbedder();
      expect(embedder.dim).toBe(1536);
    });

    it('should throw error if endpoint is missing', async () => {
      vi.doMock('../src/infrastructure/config/legacy-config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          OPENAI_EMBED_MODEL: 'text-embedding-3-small',
          OPENAI_EMBED_DIM: 1536,
          TEI_ENDPOINT: '',
          EMBEDDINGS_PROVIDER: 'tei',
        },
      }));

      const { TEIEmbedder } = await import('../src/ingest/embeddings.js');
      expect(() => new TEIEmbedder()).toThrow('TEI_ENDPOINT missing');
    });

    it('should return empty array for empty input', async () => {
      const { TEIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new TEIEmbedder();
      const result = await embedder.embed([]);
      expect(result).toEqual([]);
    });

    it('should make correct API call and return embeddings', async () => {
      const { TEIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new TEIEmbedder();

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await embedder.embed(['text1', 'text2']);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: ['text1', 'text2'] }),
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Float32Array);
      expect(Array.from(result[0]!)).toEqual(
        expect.arrayContaining([
          expect.closeTo(0.1, 5),
          expect.closeTo(0.2, 5),
          expect.closeTo(0.3, 5),
        ]),
      );
      expect(Array.from(result[1]!)).toEqual(
        expect.arrayContaining([
          expect.closeTo(0.4, 5),
          expect.closeTo(0.5, 5),
          expect.closeTo(0.6, 5),
        ]),
      );
    });

    it('should handle API errors', async () => {
      const { TEIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new TEIEmbedder();

      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await expect(embedder.embed(['text'])).rejects.toThrow(
        'TEI error 500: Internal Server Error',
      );
    });

    it('should strip trailing slash from endpoint', async () => {
      vi.doMock('../src/infrastructure/config/legacy-config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          OPENAI_EMBED_MODEL: 'text-embedding-3-small',
          OPENAI_EMBED_DIM: 1536,
          TEI_ENDPOINT: 'http://localhost:8080/',
          EMBEDDINGS_PROVIDER: 'tei',
        },
      }));

      const { TEIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = new TEIEmbedder();
      expect((embedder as any).endpoint).toBe('http://localhost:8080');
    });
  });

  describe('getEmbedder', () => {
    it('should return OpenAIEmbedder by default', async () => {
      vi.doMock('../src/infrastructure/config/legacy-config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          OPENAI_EMBED_MODEL: 'text-embedding-3-small',
          OPENAI_EMBED_DIM: 1536,
          TEI_ENDPOINT: 'http://localhost:8080',
          EMBEDDINGS_PROVIDER: 'openai',
        },
      }));

      const { getEmbedder, OpenAIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = getEmbedder();
      expect(embedder).toBeInstanceOf(OpenAIEmbedder);
    });

    it('should return TEIEmbedder when configured', async () => {
      vi.doMock('../src/infrastructure/config/legacy-config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          OPENAI_EMBED_MODEL: 'text-embedding-3-small',
          OPENAI_EMBED_DIM: 1536,
          TEI_ENDPOINT: 'http://localhost:8080',
          EMBEDDINGS_PROVIDER: 'tei',
        },
      }));

      const { getEmbedder, TEIEmbedder } = await import('../src/ingest/embeddings.js');
      const embedder = getEmbedder();
      expect(embedder).toBeInstanceOf(TEIEmbedder);
    });
  });
});
