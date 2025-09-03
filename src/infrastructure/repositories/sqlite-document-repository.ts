import { mkdirSync } from 'fs';
import { dirname } from 'path';

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

import type {
  DocumentEntity,
  ChunkEntity,
  EmbeddingEntity,
} from '../../domain/entities/document.js';
import type { DocumentRepository } from '../../domain/ports/document-repository.js';

export interface SqliteDatabaseConfig {
  readonly path: string;
  readonly embeddingDimensions: number;
}

export class SqliteDocumentRepository implements DocumentRepository {
  private db: Database.Database;
  private readonly config: SqliteDatabaseConfig;

  // Prepared statements
  private getDocumentByUriStmt!: Database.Statement;
  private saveDocumentStmt!: Database.Statement;
  private saveChunkStmt!: Database.Statement;
  private getUnembeddedChunksStmt!: Database.Statement;
  private hasChunksStmt!: Database.Statement;
  private insertVectorStmt!: Database.Statement;
  private insertVectorMapStmt!: Database.Statement;
  private removeDocumentChunksStmt!: Database.Statement;
  private removeVectorMappingsStmt!: Database.Statement;
  private removeVectorsStmt!: Database.Statement;

  constructor(config: SqliteDatabaseConfig) {
    this.config = config;

    const dir = dirname(config.path);
    mkdirSync(dir, { recursive: true });

    this.db = new Database(config.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');

    // Load sqlite-vec extension
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sqliteVec.load as any)(this.db);

    this.initializeSchema();
    this.prepareStatements();
  }

  async getDocumentByUri(uri: string): Promise<{ id: number; hash: string } | null> {
    const result = this.getDocumentByUriStmt.get(uri) as { id: number; hash: string } | undefined;
    return result || null;
  }

  async saveDocument(document: Omit<DocumentEntity, 'id'>): Promise<number> {
    const existing = await this.getDocumentByUri(document.uri);
    const isSameHash = existing && existing.hash === document.hash;

    const params = {
      source: document.source,
      uri: document.uri,
      repo: document.repo || null,
      path: document.path || null,
      title: document.title || null,
      lang: document.language || null,
      hash: document.hash,
      mtime: document.modifiedTime || null,
      version: document.version || null,
      extra_json: document.metadata ? JSON.stringify(document.metadata) : null,
    };

    const result = this.saveDocumentStmt.get(params) as { id: number };

    if (!result) {
      throw new Error(`Failed to save document: ${document.uri}`);
    }

    // If the document changed, clean up old chunks
    if (!isSameHash && existing) {
      await this.removeDocumentChunks(result.id);
    }

    return result.id;
  }

  async saveChunks(
    documentId: number,
    chunks: readonly Omit<ChunkEntity, 'id' | 'documentId'>[],
  ): Promise<void> {
    const transaction = this.db.transaction(() => {
      chunks.forEach((chunk, index) => {
        this.saveChunkStmt.run(
          documentId,
          chunk.index ?? index,
          chunk.content,
          chunk.startLine || null,
          chunk.endLine || null,
          chunk.tokenCount || null,
        );
      });
    });

    transaction();
  }

  async getUnembeddedChunks(
    limit: number = 10000,
  ): Promise<Array<{ id: number; content: string }>> {
    return this.getUnembeddedChunksStmt.all(limit) as Array<{ id: number; content: string }>;
  }

  async saveEmbeddings(embeddings: readonly EmbeddingEntity[]): Promise<void> {
    const transaction = this.db.transaction(() => {
      embeddings.forEach(({ id, embedding }) => {
        const embeddingJson = JSON.stringify(embedding);
        const vectorResult = this.insertVectorStmt.run(embeddingJson);
        this.insertVectorMapStmt.run(id, vectorResult.lastInsertRowid);
      });
    });

    transaction();
  }

  async hasChunks(documentId: number): Promise<boolean> {
    const result = this.hasChunksStmt.get(documentId) as { count: number };
    return result.count > 0;
  }

  async removeDocumentChunks(documentId: number): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Remove vectors
      this.removeVectorsStmt.run(documentId);
      // Remove vector mappings
      this.removeVectorMappingsStmt.run(documentId);
      // Remove chunks
      this.removeDocumentChunksStmt.run(documentId);
    });

    transaction();
  }

  close(): void {
    this.db.close();
  }

  getDatabaseInstance(): Database.Database {
    return this.db;
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        uri TEXT NOT NULL UNIQUE,
        repo TEXT,
        path TEXT,
        title TEXT,
        lang TEXT,
        hash TEXT NOT NULL,
        mtime INTEGER,
        version TEXT,
        extra_json TEXT
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER,
        end_line INTEGER,
        token_count INTEGER
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        content='chunks',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
      END;
      
      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
      END;
      
      CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        embedding float[${this.config.embeddingDimensions}]
      );

      CREATE TABLE IF NOT EXISTS chunk_vec_map (
        chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
        vec_rowid INTEGER NOT NULL
      );
    `);
  }

  private prepareStatements(): void {
    this.getDocumentByUriStmt = this.db.prepare('SELECT id, hash FROM documents WHERE uri = ?');

    this.saveDocumentStmt = this.db.prepare(`
      INSERT INTO documents (source, uri, repo, path, title, lang, hash, mtime, version, extra_json)
      VALUES (@source, @uri, @repo, @path, @title, @lang, @hash, @mtime, @version, @extra_json)
      ON CONFLICT(uri) DO UPDATE SET
        source = excluded.source,
        repo = excluded.repo,
        path = excluded.path,
        title = excluded.title,
        lang = excluded.lang,
        hash = excluded.hash,
        mtime = excluded.mtime,
        version = excluded.version,
        extra_json = excluded.extra_json
      RETURNING id
    `);

    this.saveChunkStmt = this.db.prepare(`
      INSERT INTO chunks (document_id, chunk_index, content, start_line, end_line, token_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.getUnembeddedChunksStmt = this.db.prepare(`
      SELECT c.id, c.content
      FROM chunks c
      LEFT JOIN chunk_vec_map m ON m.chunk_id = c.id
      WHERE m.chunk_id IS NULL
      LIMIT ?
    `);

    this.hasChunksStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM chunks WHERE document_id = ?',
    );

    this.insertVectorStmt = this.db.prepare('INSERT INTO vec_chunks (embedding) VALUES (?)');

    this.insertVectorMapStmt = this.db.prepare(
      'INSERT OR REPLACE INTO chunk_vec_map (chunk_id, vec_rowid) VALUES (?, ?)',
    );

    this.removeDocumentChunksStmt = this.db.prepare('DELETE FROM chunks WHERE document_id = ?');

    this.removeVectorMappingsStmt = this.db.prepare(`
      DELETE FROM chunk_vec_map 
      WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)
    `);

    this.removeVectorsStmt = this.db.prepare(`
      DELETE FROM vec_chunks 
      WHERE rowid IN (
        SELECT m.vec_rowid 
        FROM chunk_vec_map m 
        JOIN chunks c ON c.id = m.chunk_id 
        WHERE c.document_id = ?
      )
    `);
  }
}
