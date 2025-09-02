import { Client } from 'pg';
import { toSql } from 'pgvector/pg';

import type {
  DatabaseAdapter,
  ChunkToEmbed,
  SearchResult,
  ChunkContent,
  SearchFilters,
} from './types.js';
import type { DocumentInput, ChunkInput } from '../../shared/types.js';

export interface PostgresConfig {
  readonly connectionString: string;
  readonly embeddingDim: number;
}

export class PostgresAdapter implements DatabaseAdapter {
  private client: Client;

  constructor(private readonly config: PostgresConfig) {
    this.client = new Client({
      connectionString: config.connectionString,
    });
  }

  async init(): Promise<void> {
    await this.client.connect();
    await this.ensureSchema();
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  private async ensureSchema(): Promise<void> {
    // Enable pgvector extension
    await this.client.query('CREATE EXTENSION IF NOT EXISTS vector');

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
        embedding vector(${this.config.embeddingDim})
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
    await this.client.query(
      'CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)',
    );
    await this.client.query(
      "CREATE INDEX IF NOT EXISTS idx_chunks_content_gin ON chunks USING gin(to_tsvector('english', content))",
    );

    // Create vector index for embeddings
    await this.client.query(
      'CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_vector ON chunk_embeddings USING ivfflat (embedding vector_cosine_ops)',
    );
  }

  async getDocument(uri: string): Promise<{ id: number; hash: string } | null> {
    const result = await this.client.query('SELECT id, hash FROM documents WHERE uri = $1', [uri]);

    return result.rows[0] || null;
  }

  async upsertDocument(doc: DocumentInput): Promise<number> {
    const existing = await this.getDocument(doc.uri);
    const isSame = existing && existing.hash === doc.hash;

    const result = await this.client.query(
      `
      INSERT INTO documents (source, uri, repo, path, title, lang, hash, mtime, version, extra_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (uri) DO UPDATE SET
        source = EXCLUDED.source,
        repo = EXCLUDED.repo,
        path = EXCLUDED.path,
        title = EXCLUDED.title,
        lang = EXCLUDED.lang,
        hash = EXCLUDED.hash,
        mtime = EXCLUDED.mtime,
        version = EXCLUDED.version,
        extra_json = EXCLUDED.extra_json
      RETURNING id
      `,
      [
        doc.source,
        doc.uri,
        doc.repo || null,
        doc.path || null,
        doc.title || null,
        doc.lang || null,
        doc.hash,
        doc.mtime || null,
        doc.version || null,
        doc.extraJson || null,
      ],
    );

    const documentId = result.rows[0]?.id;

    if (!documentId) {
      throw new Error(`Failed to upsert document: ${doc.uri}`);
    }

    if (!isSame && existing) {
      await this.cleanupDocumentChunks(documentId);
    }

    return documentId;
  }

  async insertChunks(documentId: number, chunks: readonly ChunkInput[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    chunks.forEach((chunk, index) => {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`,
      );
      params.push(
        documentId,
        index,
        chunk.content,
        chunk.startLine || null,
        chunk.endLine || null,
        chunk.tokenCount || null,
      );
      paramIndex += 6;
    });

    await this.client.query(
      `INSERT INTO chunks (document_id, chunk_index, content, start_line, end_line, token_count) VALUES ${values.join(', ')}`,
      params,
    );
  }

  async getChunksToEmbed(limit: number = 10000): Promise<ChunkToEmbed[]> {
    const result = await this.client.query(
      `
      SELECT c.id, c.content
      FROM chunks c
      LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id
      WHERE e.chunk_id IS NULL
      LIMIT $1
      `,
      [limit],
    );

    return result.rows;
  }

  async getChunkContent(chunkId: number): Promise<ChunkContent | null> {
    const result = await this.client.query(
      `
      SELECT c.id, c.content, c.document_id, c.start_line, c.end_line,
             d.source, d.uri, d.repo, d.path, d.title
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.id = $1
      `,
      [chunkId],
    );

    return result.rows[0] || null;
  }

  async hasChunks(documentId: number): Promise<boolean> {
    const result = await this.client.query(
      'SELECT COUNT(*) as count FROM chunks WHERE document_id = $1',
      [documentId],
    );

    return parseInt(result.rows[0].count) > 0;
  }

  async insertEmbeddings(chunks: Array<{ id: number; embedding: number[] }>): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    chunks.forEach(({ id, embedding }) => {
      values.push(`($${paramIndex}, $${paramIndex + 1})`);
      params.push(id, toSql(embedding));
      paramIndex += 2;
    });

    await this.client.query(
      `INSERT INTO chunk_embeddings (chunk_id, embedding) VALUES ${values.join(', ')} ON CONFLICT (chunk_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      params,
    );
  }

  async keywordSearch(
    query: string,
    limit: number,
    filters: SearchFilters,
  ): Promise<SearchResult[]> {
    const conditions: string[] = [
      "to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)",
    ];
    const params: unknown[] = [query];
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

    const result = await this.client.query(
      `
      SELECT c.id as chunk_id,
             ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $1)) as score,
             d.id as document_id, d.source, d.uri, d.repo, d.path, d.title,
             c.start_line, c.end_line,
             LEFT(c.content, 400) as snippet
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY score DESC
      LIMIT $${paramIndex}
      `,
      [...params, limit],
    );

    return result.rows;
  }

  async vectorSearch(
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

    const result = await this.client.query(
      `
      SELECT c.id as chunk_id,
             (e.embedding <=> $1) as score,
             d.id as document_id, d.source, d.uri, d.repo, d.path, d.title,
             c.start_line, c.end_line,
             LEFT(c.content, 400) as snippet
      FROM chunk_embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      JOIN documents d ON d.id = c.document_id
      ${whereClause}
      ORDER BY e.embedding <=> $1
      LIMIT $${paramIndex}
      `,
      [...params, limit],
    );

    return result.rows;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.client.query(
      'INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, value],
    );
  }

  async getMeta(key: string): Promise<string | undefined> {
    const result = await this.client.query('SELECT value FROM meta WHERE key = $1', [key]);

    return result.rows[0]?.value;
  }

  async cleanupDocumentChunks(documentId: number): Promise<void> {
    await this.client.query('BEGIN');

    try {
      // Delete embeddings for chunks belonging to this document
      await this.client.query(
        `DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = $1)`,
        [documentId],
      );

      // Delete chunks for this document
      await this.client.query('DELETE FROM chunks WHERE document_id = $1', [documentId]);

      await this.client.query('COMMIT');
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }
}
