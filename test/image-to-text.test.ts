import { readFile } from 'fs/promises';

import { fetch } from 'undici';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockFetch = vi.mocked(fetch);
const mockReadFile = vi.mocked(readFile);

describe('Image-to-Text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('OpenAIImageToTextProvider', () => {
    beforeEach(() => {
      vi.doMock('../src/shared/config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          IMAGE_TO_TEXT_MODEL: 'gpt-4o-mini',
          ENABLE_IMAGE_TO_TEXT: true,
          IMAGE_TO_TEXT_PROVIDER: 'openai',
        },
      }));
    });

    it('should create instance with valid config', async () => {
      const { OpenAIImageToTextProvider } = await import('../src/ingest/image-to-text.js');

      expect(() => new OpenAIImageToTextProvider()).not.toThrow();
    });

    it('should throw error when API key is missing', async () => {
      vi.doMock('../src/shared/config.js', () => ({
        CONFIG: {
          OPENAI_API_KEY: '',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          IMAGE_TO_TEXT_MODEL: 'gpt-4o-mini',
          ENABLE_IMAGE_TO_TEXT: true,
          IMAGE_TO_TEXT_PROVIDER: 'openai',
        },
      }));

      const { OpenAIImageToTextProvider } = await import('../src/ingest/image-to-text.js');

      expect(() => new OpenAIImageToTextProvider()).toThrow(
        'OPENAI_API_KEY missing for image-to-text',
      );
    });

    it('should describe image successfully', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content:
                  'This is a detailed description of the image showing a system architecture diagram.',
              },
            },
          ],
        }),
      };

      mockReadFile.mockResolvedValue(mockImageBuffer);
      mockFetch.mockResolvedValue(mockResponse as any);

      const { OpenAIImageToTextProvider } = await import('../src/ingest/image-to-text.js');
      const provider = new OpenAIImageToTextProvider();

      const result = await provider.describeImage('/path/to/image.png');

      expect(result).toBe(
        'This is a detailed description of the image showing a system architecture diagram.',
      );
      expect(mockReadFile).toHaveBeenCalledWith('/path/to/image.png');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
          body: expect.stringContaining('gpt-4o-mini'),
        }),
      );
    });

    it('should handle different image file extensions', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Image description' } }],
        }),
      };

      mockReadFile.mockResolvedValue(mockImageBuffer);
      mockFetch.mockResolvedValue(mockResponse as any);

      const { OpenAIImageToTextProvider } = await import('../src/ingest/image-to-text.js');
      const provider = new OpenAIImageToTextProvider();

      const testCases = [
        { path: '/path/to/image.png', expectedMime: 'image/png' },
        { path: '/path/to/image.jpg', expectedMime: 'image/jpeg' },
        { path: '/path/to/image.jpeg', expectedMime: 'image/jpeg' },
        { path: '/path/to/image.gif', expectedMime: 'image/gif' },
        { path: '/path/to/image.webp', expectedMime: 'image/webp' },
        { path: '/path/to/image.svg', expectedMime: 'image/svg+xml' },
        { path: '/path/to/image.unknown', expectedMime: 'image/png' }, // fallback
      ];

      for (const testCase of testCases) {
        mockFetch.mockClear();
        await provider.describeImage(testCase.path);

        const requestBody = JSON.parse((mockFetch.mock.calls[0]![1] as any).body);
        const imageUrl = requestBody.messages[0].content[1].image_url.url;
        expect(imageUrl).toContain(`data:${testCase.expectedMime};base64,`);
      }
    });

    it('should handle API errors gracefully', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockResponse = {
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('Rate limit exceeded'),
      };

      mockReadFile.mockResolvedValue(mockImageBuffer);
      mockFetch.mockResolvedValue(mockResponse as any);

      const { OpenAIImageToTextProvider } = await import('../src/ingest/image-to-text.js');
      const provider = new OpenAIImageToTextProvider();

      const result = await provider.describeImage('/path/to/image.png');

      expect(result).toBe(''); // Should return empty string on error
    });

    it('should handle file read errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const { OpenAIImageToTextProvider } = await import('../src/ingest/image-to-text.js');
      const provider = new OpenAIImageToTextProvider();

      const result = await provider.describeImage('/path/to/nonexistent.png');

      expect(result).toBe(''); // Should return empty string on error
    });

    it('should handle empty API response', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [],
        }),
      };

      mockReadFile.mockResolvedValue(mockImageBuffer);
      mockFetch.mockResolvedValue(mockResponse as any);

      const { OpenAIImageToTextProvider } = await import('../src/ingest/image-to-text.js');
      const provider = new OpenAIImageToTextProvider();

      const result = await provider.describeImage('/path/to/image.png');

      expect(result).toBe('');
    });

    it('should trim whitespace from response', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: '   This is a description with whitespace   \n\n',
              },
            },
          ],
        }),
      };

      mockReadFile.mockResolvedValue(mockImageBuffer);
      mockFetch.mockResolvedValue(mockResponse as any);

      const { OpenAIImageToTextProvider } = await import('../src/ingest/image-to-text.js');
      const provider = new OpenAIImageToTextProvider();

      const result = await provider.describeImage('/path/to/image.png');

      expect(result).toBe('This is a description with whitespace');
    });
  });

  describe('getImageToTextProvider', () => {
    it('should return null when image-to-text is disabled', async () => {
      vi.doMock('../src/shared/config.js', () => ({
        CONFIG: {
          ENABLE_IMAGE_TO_TEXT: false,
          IMAGE_TO_TEXT_PROVIDER: 'openai',
          OPENAI_API_KEY: 'test-key',
        },
      }));

      const { getImageToTextProvider } = await import('../src/ingest/image-to-text.js');
      const provider = getImageToTextProvider();

      expect(provider).toBeNull();
    });

    it('should return OpenAI provider when configured', async () => {
      vi.doMock('../src/shared/config.js', () => ({
        CONFIG: {
          ENABLE_IMAGE_TO_TEXT: true,
          IMAGE_TO_TEXT_PROVIDER: 'openai',
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          IMAGE_TO_TEXT_MODEL: 'gpt-4o-mini',
        },
      }));

      const { getImageToTextProvider, OpenAIImageToTextProvider: ImportedProvider } =
        await import('../src/ingest/image-to-text.js');
      const provider = getImageToTextProvider();

      expect(provider).toBeInstanceOf(ImportedProvider);
    });

    it('should return null for unknown provider', async () => {
      vi.doMock('../src/shared/config.js', () => ({
        CONFIG: {
          ENABLE_IMAGE_TO_TEXT: true,
          IMAGE_TO_TEXT_PROVIDER: 'unknown-provider',
          OPENAI_API_KEY: 'test-key',
        },
      }));

      const { getImageToTextProvider } = await import('../src/ingest/image-to-text.js');
      const provider = getImageToTextProvider();

      expect(provider).toBeNull();
    });
  });
});
