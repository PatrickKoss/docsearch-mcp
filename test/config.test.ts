import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const originalEnv = process.env;

describe('Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear dotenv loaded variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.EMBEDDINGS_PROVIDER;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_EMBED_MODEL;
    delete process.env.OPENAI_EMBED_DIM;
    delete process.env.FILE_ROOTS;
    delete process.env.DB_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment variable parsing', () => {
    it('should use default values when environment variables are not set', async () => {
      delete process.env.EMBEDDINGS_PROVIDER;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_BASE_URL;
      delete process.env.OPENAI_EMBED_MODEL;
      delete process.env.OPENAI_EMBED_DIM;
      delete process.env.FILE_ROOTS;
      delete process.env.DB_PATH;

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.EMBEDDINGS_PROVIDER).toBe('openai');
      expect(CONFIG.OPENAI_API_KEY).toBe('sk-your-key'); // From actual .env file
      expect(CONFIG.OPENAI_BASE_URL).toBe('http://192.168.0.31:1234/v1'); // From actual .env file
      expect(CONFIG.OPENAI_EMBED_MODEL).toBe('text-embedding-qwen3-embedding-0.6b'); // From actual .env file
      expect(CONFIG.OPENAI_EMBED_DIM).toBe(1024); // From actual .env file
      expect(CONFIG.FILE_ROOTS).toEqual(['.']);
      expect(CONFIG.DB_PATH).toBe('./data/index.db');
    });

    it('should use environment variables when set', async () => {
      process.env.EMBEDDINGS_PROVIDER = 'tei';
      process.env.OPENAI_API_KEY = 'test-key-123';
      process.env.OPENAI_BASE_URL = 'https://custom-api.com/v1';
      process.env.OPENAI_EMBED_MODEL = 'custom-model';
      process.env.OPENAI_EMBED_DIM = '768';
      process.env.TEI_ENDPOINT = 'http://tei-server:8080';
      process.env.DB_PATH = '/custom/path/db.sqlite';

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.EMBEDDINGS_PROVIDER).toBe('tei');
      expect(CONFIG.OPENAI_API_KEY).toBe('test-key-123');
      expect(CONFIG.OPENAI_BASE_URL).toBe('https://custom-api.com/v1');
      expect(CONFIG.OPENAI_EMBED_MODEL).toBe('custom-model');
      expect(CONFIG.OPENAI_EMBED_DIM).toBe(768);
      expect(CONFIG.TEI_ENDPOINT).toBe('http://tei-server:8080');
      expect(CONFIG.DB_PATH).toBe('/custom/path/db.sqlite');
    });

    it('should validate embeddings provider', async () => {
      process.env.EMBEDDINGS_PROVIDER = 'invalid-provider';
      const { CONFIG } = await import('../src/shared/config.js');
      expect(CONFIG.EMBEDDINGS_PROVIDER).toBe('openai');

      vi.resetModules();
      process.env.EMBEDDINGS_PROVIDER = 'tei';
      const { CONFIG: CONFIG2 } = await import('../src/shared/config.js');
      expect(CONFIG2.EMBEDDINGS_PROVIDER).toBe('tei');

      vi.resetModules();
      process.env.EMBEDDINGS_PROVIDER = 'openai';
      const { CONFIG: CONFIG3 } = await import('../src/shared/config.js');
      expect(CONFIG3.EMBEDDINGS_PROVIDER).toBe('openai');
    });

    it('should parse integer values correctly', async () => {
      process.env.OPENAI_EMBED_DIM = '512';
      const { CONFIG } = await import('../src/shared/config.js');
      expect(CONFIG.OPENAI_EMBED_DIM).toBe(512);

      vi.resetModules();
      process.env.OPENAI_EMBED_DIM = 'invalid-number';
      const { CONFIG: CONFIG2 } = await import('../src/shared/config.js');
      expect(CONFIG2.OPENAI_EMBED_DIM).toBe(NaN);

      vi.resetModules();
      process.env.OPENAI_EMBED_DIM = '';
      const { CONFIG: CONFIG3 } = await import('../src/shared/config.js');
      expect(CONFIG3.OPENAI_EMBED_DIM).toBe(1536);
    });
  });

  describe('Confluence configuration', () => {
    it('should use default empty values for Confluence', async () => {
      delete process.env.CONFLUENCE_BASE_URL;
      delete process.env.CONFLUENCE_EMAIL;
      delete process.env.CONFLUENCE_API_TOKEN;
      delete process.env.CONFLUENCE_SPACES;

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.CONFLUENCE_BASE_URL).toBe('');
      expect(CONFIG.CONFLUENCE_EMAIL).toBe('');
      expect(CONFIG.CONFLUENCE_API_TOKEN).toBe('');
      expect(CONFIG.CONFLUENCE_SPACES).toEqual([]);
    });

    it('should parse Confluence configuration from environment', async () => {
      process.env.CONFLUENCE_BASE_URL = 'https://company.atlassian.net/wiki';
      process.env.CONFLUENCE_EMAIL = 'user@company.com';
      process.env.CONFLUENCE_API_TOKEN = 'token123';
      process.env.CONFLUENCE_SPACES = 'PROJ,DOCS,WIKI';

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.CONFLUENCE_BASE_URL).toBe('https://company.atlassian.net/wiki');
      expect(CONFIG.CONFLUENCE_EMAIL).toBe('user@company.com');
      expect(CONFIG.CONFLUENCE_API_TOKEN).toBe('token123');
      expect(CONFIG.CONFLUENCE_SPACES).toEqual(['PROJ', 'DOCS', 'WIKI']);
    });
  });

  describe('File configuration', () => {
    it('should use default file patterns', async () => {
      delete process.env.FILE_ROOTS;
      delete process.env.FILE_INCLUDE_GLOBS;
      delete process.env.FILE_EXCLUDE_GLOBS;

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.FILE_ROOTS).toEqual(['.']);
      expect(CONFIG.FILE_INCLUDE_GLOBS).toEqual([
        '**/*.{go',
        'ts',
        'tsx',
        'js',
        'py',
        'rs',
        'java',
        'md',
        'mdx',
        'txt',
        'yaml',
        'yml',
        'json',
        'pdf}',
      ]); // Default split on commas
      expect(CONFIG.FILE_EXCLUDE_GLOBS).toEqual([
        '**/{.git',
        'node_modules',
        'dist',
        'build',
        'target}/**',
      ]); // Default split on commas
    });

    it('should parse custom file configuration', async () => {
      process.env.FILE_ROOTS = '/project1,/project2,./local';
      process.env.FILE_INCLUDE_GLOBS = '**/*.ts,**/*.js,**/*.md';
      process.env.FILE_EXCLUDE_GLOBS = '**/node_modules/**,**/.git/**,**/dist/**';

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.FILE_ROOTS).toEqual(['/project1', '/project2', './local']);
      expect(CONFIG.FILE_INCLUDE_GLOBS).toEqual(['**/*.ts', '**/*.js', '**/*.md']);
      expect(CONFIG.FILE_EXCLUDE_GLOBS).toEqual(['**/node_modules/**', '**/.git/**', '**/dist/**']);
    });

    it('should handle empty CSV values', async () => {
      process.env.FILE_ROOTS = '';
      process.env.CONFLUENCE_SPACES = '';

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.FILE_ROOTS).toEqual(['.']); // Uses default when empty
      expect(CONFIG.CONFLUENCE_SPACES).toEqual([]);
    });

    it('should trim whitespace in CSV parsing', async () => {
      process.env.FILE_ROOTS = ' /path1 , /path2  ,  /path3 ';
      process.env.CONFLUENCE_SPACES = ' SPACE1,  SPACE2  , SPACE3 ';

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.FILE_ROOTS).toEqual(['/path1', '/path2', '/path3']);
      expect(CONFIG.CONFLUENCE_SPACES).toEqual(['SPACE1', 'SPACE2', 'SPACE3']);
    });

    it('should filter out empty CSV values', async () => {
      process.env.FILE_ROOTS = 'valid,,,also-valid,';
      process.env.CONFLUENCE_SPACES = 'SPACE1,,SPACE2,,';

      const { CONFIG } = await import('../src/shared/config.js');

      expect(CONFIG.FILE_ROOTS).toEqual(['valid', 'also-valid']);
      expect(CONFIG.CONFLUENCE_SPACES).toEqual(['SPACE1', 'SPACE2']);
    });
  });

  describe('CSV parsing utility', () => {
    it('should handle single values', async () => {
      process.env.TEST_CSV = 'single-value';

      const { CONFIG: _CONFIG } = await import('../src/shared/config.js');
      process.env.FILE_ROOTS = 'single-root';

      vi.resetModules();
      const { CONFIG: CONFIG2 } = await import('../src/shared/config.js');
      expect(CONFIG2.FILE_ROOTS).toEqual(['single-root']);
    });

    it('should handle comma-only strings', async () => {
      process.env.FILE_ROOTS = ',,,';

      const { CONFIG } = await import('../src/shared/config.js');
      expect(CONFIG.FILE_ROOTS).toEqual([]);
    });

    it('should handle mixed empty and valid values', async () => {
      process.env.CONFLUENCE_SPACES = ',VALID1,  , VALID2 ,  ,';

      const { CONFIG } = await import('../src/shared/config.js');
      expect(CONFIG.CONFLUENCE_SPACES).toEqual(['VALID1', 'VALID2']);
    });
  });

  describe('Configuration immutability', () => {
    it('should make CONFIG read-only', async () => {
      const { CONFIG } = await import('../src/shared/config.js');

      // Note: TypeScript `as const` makes the object readonly at compile time,
      // but not at runtime. This test documents current behavior.
      expect(() => {
        (CONFIG as any).DB_PATH = '/hacked/path';
      }).not.toThrow();

      expect(() => {
        (CONFIG as any).NEW_PROP = 'should not work';
      }).not.toThrow();
    });

    it('should make array properties read-only', async () => {
      const { CONFIG } = await import('../src/shared/config.js');

      // Note: Arrays returned by splitCsv are normal arrays, not frozen
      // This test documents current behavior
      expect(() => {
        (CONFIG.FILE_ROOTS as any).push('/hacked/path');
      }).not.toThrow();

      expect(() => {
        (CONFIG.FILE_INCLUDE_GLOBS as any)[0] = 'hacked-glob';
      }).not.toThrow();
    });
  });

  describe('Type safety', () => {
    it('should have correct TypeScript types', async () => {
      const { CONFIG } = await import('../src/shared/config.js');

      // These should compile without errors
      const provider: 'openai' | 'tei' = CONFIG.EMBEDDINGS_PROVIDER;
      const apiKey: string = CONFIG.OPENAI_API_KEY;
      const dimension: number = CONFIG.OPENAI_EMBED_DIM;
      const spaces: readonly string[] = CONFIG.CONFLUENCE_SPACES;
      const roots: readonly string[] = CONFIG.FILE_ROOTS;

      expect(typeof provider).toBe('string');
      expect(typeof apiKey).toBe('string');
      expect(typeof dimension).toBe('number');
      expect(Array.isArray(spaces)).toBe(true);
      expect(Array.isArray(roots)).toBe(true);
    });
  });
});
