import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  VectorChordAdapter,
  type VectorChordConfig,
} from '../../src/ingest/adapters/vectorchord.js';

// Mock dotenv to prevent it from loading .env file
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(() => ({ parsed: {} })),
  },
}));

const defaultConfig: VectorChordConfig = {
  connectionString: 'postgresql://test:test@localhost:5432/testdb',
  embeddingDim: 1536,
  residualQuantization: true,
  lists: 100,
  sphericalCentroids: true,
  buildThreads: 4,
  probes: 10,
};

describe('VectorChordAdapter', () => {
  describe('buildIndexOptions', () => {
    it('should generate correct index options with default config', () => {
      const adapter = new VectorChordAdapter(defaultConfig);
      const options = adapter.buildIndexOptions();

      expect(options).toContain('residual_quantization = true');
      expect(options).toContain('[build.internal]');
      expect(options).toContain('lists = [100]');
      expect(options).toContain('spherical_centroids = true');
      expect(options).toContain('build_threads = 4');
    });

    it('should generate correct index options with custom config', () => {
      const customConfig: VectorChordConfig = {
        ...defaultConfig,
        residualQuantization: false,
        lists: 500,
        sphericalCentroids: false,
        buildThreads: 8,
      };

      const adapter = new VectorChordAdapter(customConfig);
      const options = adapter.buildIndexOptions();

      expect(options).toContain('residual_quantization = false');
      expect(options).toContain('lists = [500]');
      expect(options).toContain('spherical_centroids = false');
      expect(options).toContain('build_threads = 8');
    });

    it('should generate valid TOML-like format', () => {
      const adapter = new VectorChordAdapter(defaultConfig);
      const options = adapter.buildIndexOptions();

      // Should start and end with newlines for proper $$ delimiters
      expect(options.startsWith('\n')).toBe(true);
      expect(options.endsWith('\n')).toBe(true);

      // Should have section header
      const lines = options.trim().split('\n');
      expect(lines).toContain('[build.internal]');
    });
  });

  describe('Configuration', () => {
    it('should accept VectorChordConfig with all required fields', () => {
      const adapter = new VectorChordAdapter(defaultConfig);
      expect(adapter).toBeInstanceOf(VectorChordAdapter);
    });

    it('should extend PostgresAdapter', async () => {
      const { PostgresAdapter } = await import('../../src/ingest/adapters/postgresql.js');
      const adapter = new VectorChordAdapter(defaultConfig);
      expect(adapter).toBeInstanceOf(PostgresAdapter);
    });
  });
});

describe('VectorChord Config Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should accept vectorchord as a valid DB_TYPE', async () => {
    process.env.DB_TYPE = 'vectorchord';
    const { CONFIG } = await import('../../src/shared/config.js');
    expect(CONFIG.DB_TYPE).toBe('vectorchord');
  });

  it('should use default VectorChord config values', async () => {
    const { CONFIG } = await import('../../src/shared/config.js');
    expect(CONFIG.VECTORCHORD_RESIDUAL_QUANTIZATION).toBe(true);
    expect(CONFIG.VECTORCHORD_LISTS).toBe(100);
    expect(CONFIG.VECTORCHORD_SPHERICAL_CENTROIDS).toBe(true);
    expect(CONFIG.VECTORCHORD_BUILD_THREADS).toBe(4);
    expect(CONFIG.VECTORCHORD_PROBES).toBe(10);
  });

  it('should read custom VectorChord config from env vars', async () => {
    process.env.VECTORCHORD_RESIDUAL_QUANTIZATION = 'false';
    process.env.VECTORCHORD_LISTS = '500';
    process.env.VECTORCHORD_SPHERICAL_CENTROIDS = 'false';
    process.env.VECTORCHORD_BUILD_THREADS = '8';
    process.env.VECTORCHORD_PROBES = '20';

    const { CONFIG } = await import('../../src/shared/config.js');
    expect(CONFIG.VECTORCHORD_RESIDUAL_QUANTIZATION).toBe(false);
    expect(CONFIG.VECTORCHORD_LISTS).toBe(500);
    expect(CONFIG.VECTORCHORD_SPHERICAL_CENTROIDS).toBe(false);
    expect(CONFIG.VECTORCHORD_BUILD_THREADS).toBe(8);
    expect(CONFIG.VECTORCHORD_PROBES).toBe(20);
  });
});

describe('VectorChord Factory', () => {
  it('should create VectorChordAdapter when type is vectorchord', async () => {
    const { createDatabaseAdapter } = await import('../../src/ingest/adapters/factory.js');

    const adapter = createDatabaseAdapter({
      type: 'vectorchord',
      vectorchord: {
        connectionString: 'postgresql://test:test@localhost:5432/testdb',
        embeddingDim: 4,
        residualQuantization: true,
        lists: 100,
        sphericalCentroids: true,
        buildThreads: 4,
        probes: 10,
      },
    });

    // Use constructor name check since dynamic imports create separate module instances
    expect(adapter.constructor.name).toBe('VectorChordAdapter');
  });

  it('should still create PostgresAdapter when type is postgresql', async () => {
    const { createDatabaseAdapter } = await import('../../src/ingest/adapters/factory.js');

    const adapter = createDatabaseAdapter({
      type: 'postgresql',
      postgresql: {
        connectionString: 'postgresql://test:test@localhost:5432/testdb',
        embeddingDim: 4,
      },
    });

    expect(adapter.constructor.name).toBe('PostgresAdapter');
  });
});
