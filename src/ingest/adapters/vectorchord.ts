import { toSql } from 'pgvector/pg';

import { PostgresAdapter, type PostgresConfig } from './postgresql.js';

import type { SearchResult, SearchFilters } from './types.js';

export interface VectorChordConfig extends PostgresConfig {
  readonly residualQuantization: boolean;
  readonly lists: number;
  readonly sphericalCentroids: boolean;
  readonly buildThreads: number;
  readonly probes: number;
}

export class VectorChordAdapter extends PostgresAdapter {
  private readonly vcConfig: VectorChordConfig;

  constructor(config: VectorChordConfig) {
    super(config);
    this.vcConfig = config;
  }

  protected override async ensureSchema(): Promise<void> {
    // Enable vchord extension (CASCADE also creates pgvector's vector extension)
    await this.client.query('CREATE EXTENSION IF NOT EXISTS vchord CASCADE');

    // Create documents table
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        uri TEXT NOT NULL UNIQUE,
        repo TEXT,
        path TEXT,
        title TEXT,
        lang TEXT,
        hash TEXT NOT NULL,
        mtime BIGINT,
        version TEXT,
        extra_json TEXT
      )
    `);

    // Create chunks table
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER,
        end_line INTEGER,
        token_count INTEGER
      )
    `);

    // Create embeddings table with vector column
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
        embedding vector(${this.vcConfig.embeddingDim})
      )
    `);

    // Create metadata table
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Create indexes
    await this.client.query('CREATE INDEX IF NOT EXISTS idx_documents_uri ON documents(uri)');
    await this.client.query('CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source)');
    await this.client.query('CREATE INDEX IF NOT EXISTS idx_documents_repo ON documents(repo)');
    await this.client.query('CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)');
    await this.client.query('CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash)');
    await this.client.query(
      'CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)',
    );
    await this.client.query(
      "CREATE INDEX IF NOT EXISTS idx_chunks_content_gin ON chunks USING gin(to_tsvector('english', content))",
    );
  }

  protected override async ensureVectorIndex(): Promise<void> {
    const indexExists = await this.client.query(`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'idx_chunk_embeddings_vchordrq'
    `);

    if (indexExists.rows.length === 0) {
      const hasData = await this.client.query('SELECT 1 FROM chunk_embeddings LIMIT 1');

      if (hasData.rows.length > 0) {
        try {
          const options = this.buildIndexOptions();
          await this.client.query(
            `CREATE INDEX idx_chunk_embeddings_vchordrq ON chunk_embeddings USING vchordrq (embedding vector_cosine_ops) WITH (options = $$${options}$$)`,
          );
        } catch (error) {
          console.warn('Failed to create VectorChord index:', error);
        }
      }
    }
  }

  buildIndexOptions(): string {
    const lines: string[] = [];
    lines.push(`residual_quantization = ${this.vcConfig.residualQuantization}`);
    lines.push('');
    lines.push('[build.internal]');
    lines.push(`lists = [${this.vcConfig.lists}]`);
    lines.push(`spherical_centroids = ${this.vcConfig.sphericalCentroids}`);
    lines.push(`build_threads = ${this.vcConfig.buildThreads}`);
    return `\n${lines.join('\n')}\n`;
  }

  override async vectorSearch(
    embedding: number[],
    limit: number,
    filters: SearchFilters,
  ): Promise<SearchResult[]> {
    const conditions: string[] = [];
    const params: unknown[] = [toSql(embedding)];
    let paramIndex = 2;

    if (filters.source) {
      conditions.push(`d.source = $${paramIndex}`);
      params.push(filters.source);
      paramIndex++;
    }

    if (filters.repo) {
      conditions.push(`d.repo = $${paramIndex}`);
      params.push(filters.repo);
      paramIndex++;
    }

    if (filters.pathPrefix) {
      conditions.push(`d.path LIKE $${paramIndex}`);
      params.push(`${filters.pathPrefix}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // SET LOCAL requires a transaction to take effect
    await this.client.query('BEGIN');

    try {
      // Set VectorChord probes for this query
      await this.client.query(`SET LOCAL vchordrq.probes = ${this.vcConfig.probes}`);

      const result = await this.client.query(
        `
        SELECT c.id as chunk_id,
               (e.embedding <=> $1) as score,
               d.id as document_id, d.source, d.uri, d.repo, d.path, d.title,
               c.start_line, c.end_line,
               LEFT(c.content, 400) as snippet, d.extra_json
        FROM chunk_embeddings e
        JOIN chunks c ON c.id = e.chunk_id
        JOIN documents d ON d.id = c.document_id
        ${whereClause}
        ORDER BY e.embedding <=> $1
        LIMIT $${paramIndex}
        `,
        [...params, limit],
      );

      await this.client.query('COMMIT');
      return result.rows;
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }
}
