import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { PostgresAdapter } from '../../src/application/adapters/repositories/postgresql-repository.js';

describe('Simple PostgreSQL Integration Test', () => {
  let container: any;
  let adapter: PostgresAdapter;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .start();

    const connectionString = container.getConnectionUri();
    adapter = new PostgresAdapter({
      connectionString,
      embeddingDim: 3,
    });

    await adapter.init();
  }, 120000);

  afterAll(async () => {
    await adapter?.close();
    await container?.stop();
  });

  it('should connect to PostgreSQL and perform basic operations', async () => {
    // Test document insertion
    const docId = await adapter.upsertDocument({
      source: 'file',
      uri: 'test://simple.md',
      repo: 'test',
      path: 'simple.md',
      title: 'Simple Test',
      lang: 'md',
      hash: 'simple123',
      mtime: Date.now(),
      version: '1.0',
      extraJson: null,
    });

    expect(docId).toBeGreaterThan(0);

    // Test metadata operations
    await adapter.setMeta('test.key', 'test.value');
    const value = await adapter.getMeta('test.key');
    expect(value).toBe('test.value');
  });
});
