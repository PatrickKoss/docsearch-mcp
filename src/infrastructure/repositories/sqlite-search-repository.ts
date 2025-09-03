import type { SearchResultEntity, ChunkContentEntity } from '../../domain/entities/document.js';
import type { SearchRepository } from '../../domain/ports/search-repository.js';
import type { SearchFilters } from '../../domain/value-objects/search-criteria.js';
import type Database from 'better-sqlite3';

export class SqliteSearchRepository implements SearchRepository {
  private readonly db: Database.Database;

  // Prepared statement placeholders (will be prepared dynamically due to filter variations)
  private getChunkContentStmt!: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStaticStatements();
  }

  async searchByKeywords(
    query: string,
    limit: number,
    filters: SearchFilters,
  ): Promise<readonly SearchResultEntity[]> {
    const filterConditions: string[] = [];
    const params: Record<string, unknown> = { query, k: limit };

    if (filters.source) {
      filterConditions.push('d.source = @source');
      params.source = filters.source;
    }
    if (filters.repository) {
      filterConditions.push('d.repo = @repo');
      params.repo = filters.repository;
    }
    if (filters.pathPrefix) {
      filterConditions.push('d.path LIKE @pathPrefix');
      params.pathPrefix = `${filters.pathPrefix}%`;
    }

    const filterSql = filterConditions.length ? `AND ${filterConditions.join(' AND ')}` : '';

    const sql = `
      WITH keyword_results AS (
        SELECT c.id AS chunk_id, bm25(chunks_fts) AS score
        FROM chunks_fts
        JOIN chunks c ON c.id = chunks_fts.rowid
        WHERE chunks_fts MATCH $query
        LIMIT $k
      )
      SELECT 
        kr.chunk_id AS chunkId,
        kr.score,
        d.id AS documentId,
        d.source,
        d.uri,
        d.repo,
        d.path,
        d.title,
        c.start_line AS startLine,
        c.end_line AS endLine,
        SUBSTR(c.content, 1, 400) AS snippet
      FROM keyword_results kr
      JOIN chunks c ON c.id = kr.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE 1=1 ${filterSql}
      LIMIT $k
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(params) as SearchResultEntity[];
  }

  async searchByVector(
    embedding: readonly number[],
    limit: number,
    filters: SearchFilters,
  ): Promise<readonly SearchResultEntity[]> {
    const filterConditions: string[] = [];
    const params: Record<string, unknown> = {
      embedding: JSON.stringify(embedding),
      k: limit,
    };

    if (filters.source) {
      filterConditions.push('d.source = @source');
      params.source = filters.source;
    }
    if (filters.repository) {
      filterConditions.push('d.repo = @repo');
      params.repo = filters.repository;
    }
    if (filters.pathPrefix) {
      filterConditions.push('d.path LIKE @pathPrefix');
      params.pathPrefix = `${filters.pathPrefix}%`;
    }

    const filterSql = filterConditions.length ? `AND ${filterConditions.join(' AND ')}` : '';

    const sql = `
      WITH vector_results AS (
        SELECT rowid, distance
        FROM vec_chunks
        WHERE embedding MATCH $embedding AND k = $k
      )
      SELECT 
        m.chunk_id AS chunkId,
        vr.distance AS score,
        d.id AS documentId,
        d.source,
        d.uri,
        d.repo,
        d.path,
        d.title,
        c.start_line AS startLine,
        c.end_line AS endLine,
        SUBSTR(c.content, 1, 400) AS snippet
      FROM vector_results vr
      JOIN chunk_vec_map m ON m.vec_rowid = vr.rowid
      JOIN chunks c ON c.id = m.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE 1=1 ${filterSql}
      LIMIT $k
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(params) as SearchResultEntity[];
  }

  async getChunkContent(chunkId: number): Promise<ChunkContentEntity | null> {
    const result = this.getChunkContentStmt.get(chunkId) as ChunkContentEntity | undefined;
    return result || null;
  }

  private prepareStaticStatements(): void {
    this.getChunkContentStmt = this.db.prepare(`
      SELECT 
        c.id,
        c.content,
        c.document_id AS documentId,
        c.start_line AS startLine,
        c.end_line AS endLine,
        d.source,
        d.uri,
        d.repo,
        d.path,
        d.title
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.id = ?
    `);
  }
}
