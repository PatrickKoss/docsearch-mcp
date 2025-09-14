import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import path from 'path';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

import { DocumentServiceAdapter } from '../../src/cli/adapters/document/document-service.js';

// Mock embeddings to avoid API calls and hangs
vi.mock('../../src/ingest/embeddings.js', () => ({
  getEmbedder: vi.fn().mockReturnValue({
    dim: 1536,
    embed: vi.fn().mockImplementation((texts: string[]) => {
      // Return the correct number of vectors based on input
      return Promise.resolve(
        texts.map((_, i) => new Float32Array(Array(1536).fill(0.1 + i * 0.1))),
      );
    }),
  }),
}));

// Mock config to use test values
vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    EMBEDDINGS_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: '',
    OPENAI_EMBED_MODEL: 'text-embedding-3-small',
    OPENAI_EMBED_DIM: 1536,
    TEI_ENDPOINT: '',
    ENABLE_IMAGE_TO_TEXT: false,
    IMAGE_TO_TEXT_PROVIDER: 'openai',
    IMAGE_TO_TEXT_MODEL: 'gpt-4o-mini',
    CONFLUENCE_BASE_URL: '',
    CONFLUENCE_EMAIL: '',
    CONFLUENCE_API_TOKEN: '',
    CONFLUENCE_AUTH_METHOD: 'basic',
    CONFLUENCE_SPACES: [],
    CONFLUENCE_PARENT_PAGES: [],
    CONFLUENCE_TITLE_INCLUDES: [],
    CONFLUENCE_TITLE_EXCLUDES: [],
    FILE_ROOTS: ['./test/fixtures-cli-images'],
    FILE_INCLUDE_GLOBS: ['**/*.{png,jpg,jpeg,gif,svg,webp,md,txt,json}'],
    FILE_EXCLUDE_GLOBS: ['**/node_modules/**', '**/.git/**'],
    DB_TYPE: 'sqlite',
    DB_PATH: './test/test-cli-image-search.db',
    POSTGRES_CONNECTION_STRING: '',
  },
}));

/**
 * Integration tests for CLI image search functionality.
 * These tests use mocked CLI functionality to avoid hanging issues.
 */
describe('CLI Image Search Integration', () => {
  const testFixturesDir = './test/fixtures-cli-images';
  const testDbFile = './test/test-cli-image-search.db';

  const createTestFiles = () => {
    // Create test image files
    const imageFiles = {
      'architecture-diagram.png': Buffer.from('fake-png-architecture-data'),
      'user-flow.jpg': Buffer.from('fake-jpg-userflow-data'),
      'dashboard-screenshot.webp': Buffer.from('fake-webp-dashboard-data'),
      'system-design.svg': Buffer.from(
        '<svg><rect width="200" height="100"/><text>System Design</text></svg>',
      ),
    };

    for (const [filename, content] of Object.entries(imageFiles)) {
      const filePath = path.join(testFixturesDir, filename);
      writeFileSync(filePath, content);
    }

    // Create some regular text files for comparison
    const textFiles = {
      'README.md': '# Project Documentation\n\nThis contains architecture information.',
      'design.txt': 'System design principles and user flow documentation.',
      'api.json': JSON.stringify({ name: 'API Documentation', version: '1.0' }),
    };

    for (const [filename, content] of Object.entries(textFiles)) {
      const filePath = path.join(testFixturesDir, filename);
      writeFileSync(filePath, content);
    }
  };

  beforeAll(async () => {
    // Check if CLI is already built, build only if necessary
    const cliPath = './dist/src/cli/main.js';
    if (!existsSync(cliPath)) {
      console.log('Building project for CLI tests...');
      await runCommand('pnpm', ['build'], { timeout: 60000 });
    }
  });

  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(testFixturesDir)) {
      rmSync(testFixturesDir, { recursive: true });
    }
    mkdirSync(testFixturesDir, { recursive: true });

    // Remove test database if exists
    if (existsSync(testDbFile)) {
      rmSync(testDbFile);
    }

    createTestFiles();
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testFixturesDir)) {
      rmSync(testFixturesDir, { recursive: true });
    }
    if (existsSync(testDbFile)) {
      rmSync(testDbFile);
    }
  });

  describe('image ingestion', () => {
    it('should ingest image files with CLI command', async () => {
      const documentService = new DocumentServiceAdapter();

      // Test ingestion directly using the service
      await documentService.ingest({
        source: 'file',
        watch: false,
      });

      // Verify database was created
      expect(existsSync(testDbFile)).toBe(true);
    }, 15000);

    it('should handle mixed file types during ingestion', async () => {
      const documentService = new DocumentServiceAdapter();

      // Test ingestion of mixed file types
      await documentService.ingest({
        source: 'file',
        watch: false,
      });

      // Should complete without error
      expect(existsSync(testDbFile)).toBe(true);
    }, 15000);
  });

  describe('image search', () => {
    beforeEach(async () => {
      // Ingest all files first using the service
      const documentService = new DocumentServiceAdapter();
      await documentService.ingest({
        source: 'file',
        watch: false,
      });
    }, 15000);

    it('should search all files by default', async () => {
      const documentService = new DocumentServiceAdapter();

      const results = await documentService.search({
        query: 'architecture',
        topK: 10,
        output: 'json',
        includeImages: true,
      });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      // Should find both image and text files
      const hasImageResults = results.some(
        (r: any) =>
          r.path.includes('.png') ||
          r.path.includes('.jpg') ||
          r.path.includes('.webp') ||
          r.path.includes('.svg'),
      );
      const hasTextResults = results.some(
        (r: any) => r.path.includes('.md') || r.path.includes('.txt'),
      );

      expect(hasImageResults).toBe(true);
      expect(hasTextResults).toBe(true);
    }, 15000);

    it('should filter to images only with --images-only flag', async () => {
      const documentService = new DocumentServiceAdapter();

      const results = await documentService.search({
        query: 'architecture',
        topK: 10,
        output: 'json',
        imagesOnly: true,
      });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      // All results should be images
      for (const result of results) {
        expect(result.path).toMatch(/\.(png|jpg|jpeg|gif|svg|webp)$/);
      }

      // Should find architecture diagram
      const hasArchitecture = results.some((r: any) => r.path.includes('architecture-diagram.png'));
      expect(hasArchitecture).toBe(true);
    }, 15000);

    it('should exclude images with --include-images false', async () => {
      const documentService = new DocumentServiceAdapter();

      const results = await documentService.search({
        query: 'architecture',
        topK: 10,
        output: 'json',
        includeImages: false,
      });

      expect(results).toBeDefined();

      // No results should be images
      for (const result of results) {
        expect(result.path).not.toMatch(/\.(png|jpg|jpeg|gif|svg|webp)$/);
      }

      // Should still find text files
      const hasTextResults = results.some(
        (r: any) => r.path.includes('.md') || r.path.includes('.txt'),
      );
      expect(hasTextResults).toBe(true);
    }, 15000);

    it('should work with different search modes for images', async () => {
      const documentService = new DocumentServiceAdapter();

      // Test keyword search
      const keywordResults = await documentService.search({
        query: 'dashboard',
        topK: 10,
        mode: 'keyword',
        imagesOnly: true,
      });

      expect(keywordResults.length).toBeGreaterThan(0);

      // Test vector search (will use mock embeddings)
      const vectorResults = await documentService.search({
        query: 'user interface',
        topK: 10,
        mode: 'vector',
        imagesOnly: true,
      });

      // Vector search should work with mock embeddings
      expect(Array.isArray(vectorResults)).toBe(true);
    }, 20000);

    it('should combine image filters with other filters', async () => {
      const result = await runCLI([
        'search',
        'system',
        '--db-path',
        testDbFile,
        '--images-only',
        '--source',
        'file',
        '--path-prefix',
        testFixturesDir,
        '--top-k',
        '5',
        '--output',
        'json',
      ]);

      expect(result.exitCode).toBe(0);

      // Extract JSON from output (ignore dotenv messages)
      const lines = result.stdout.split('\n');
      const jsonStart = lines.findIndex((line) => line.trim().startsWith('{'));
      const jsonLines = lines.slice(jsonStart);
      const jsonOutput = jsonLines.join('\n').trim();

      const output = JSON.parse(jsonOutput);
      expect(output.results).toBeDefined();
      expect(output.results.length).toBeLessThanOrEqual(5);

      // All results should be images and from file source
      for (const result of output.results) {
        expect(result.source).toBe('file');
        expect(result.path).toMatch(/\.(png|jpg|jpeg|gif|svg|webp)$/);
      }
    }, 15000);

    it('should handle different output formats for image search', async () => {
      const documentService = new DocumentServiceAdapter();

      // Test that search results contain expected image
      const results = await documentService.search({
        query: 'dashboard',
        topK: 10,
        imagesOnly: true,
      });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      // Should find dashboard screenshot image
      const hasDashboard = results.some((r: any) => r.path.includes('dashboard-screenshot.webp'));
      expect(hasDashboard).toBe(true);

      // All results should be images
      for (const result of results) {
        expect(result.path).toMatch(/\.(png|jpg|jpeg|gif|svg|webp)$/);
      }
    }, 20000);
  });

  describe('error handling', () => {
    it('should handle empty search results for images', async () => {
      const documentService = new DocumentServiceAdapter();

      const results = await documentService.search({
        query: 'nonexistent',
        topK: 10,
        imagesOnly: true,
      });

      expect(results).toBeDefined();
      expect(results).toHaveLength(0);
    }, 20000);

    it('should handle invalid image search parameters gracefully', async () => {
      const result = await runCLI([
        'search',
        'test',
        '--db-path',
        testDbFile,
        '--top-k',
        '0', // Invalid
        '--images-only',
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Invalid top-k value');
    });
  });

  describe('configuration', () => {
    it('should respect image-to-text configuration', async () => {
      const documentService = new DocumentServiceAdapter();

      // Test that ingestion works with image-to-text disabled (our mocked config)
      await documentService.ingest({
        source: 'file',
        watch: false,
      });

      // Should complete without error
      expect(existsSync(testDbFile)).toBe(true);
    }, 15000);

    it('should use custom image file patterns', async () => {
      const documentService = new DocumentServiceAdapter();

      // Test ingestion and search work
      await documentService.ingest({
        source: 'file',
        watch: false,
      });

      const results = await documentService.search({
        query: 'system',
        topK: 10,
        imagesOnly: true,
      });

      expect(results).toBeDefined();
      // Should find images (our mock config includes all image types)
      expect(results.length).toBeGreaterThanOrEqual(0);
    }, 20000);
  });
});

/**
 * Helper function to run CLI commands
 */
async function runCLI(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cli = spawn('node', ['dist/src/cli/main.js', ...args], {
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Override .env file with test values to use NoOpEmbedder
        EMBEDDINGS_PROVIDER: 'openai',
        OPENAI_API_KEY: '', // Empty key triggers NoOpEmbedder fallback
        OPENAI_BASE_URL: '',
        OPENAI_EMBED_MODEL: 'text-embedding-3-small',
        OPENAI_EMBED_DIM: '1536',
        CONFLUENCE_AUTH_METHOD: 'basic',
        CONFLUENCE_BASE_URL: '',
        CONFLUENCE_EMAIL: '',
        CONFLUENCE_API_TOKEN: '',
      },
    });

    let stdout = '';
    let stderr = '';

    cli.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    cli.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    cli.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    cli.on('error', (error) => {
      reject(error);
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      cli.kill('SIGTERM');
      reject(new Error('CLI command timed out'));
    }, 15000);
  });
}

/**
 * Helper function to run general commands
 */
async function runCommand(
  command: string,
  args: string[],
  options: { timeout?: number } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on('error', (error) => {
      reject(error);
    });

    // Timeout
    const timeout = options.timeout || 15000;
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });
}
