import { mkdirSync } from 'fs';
import { dirname } from 'path';

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

import type {
  DatabaseAdapter,
  ChunkToEmbed,
  SearchResult,
  ChunkContent,
  SearchFilters,
} from './types.js';
import type { DocumentInput, ChunkInput } from '../../shared/types.js';

export interface SqliteConfig {
  readonly path: string;
  readonly embeddingDim: number;
}

export class SqliteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  private getDocumentStmt!: Database.Statement;
  private upsertDocumentStmt!: Database.Statement;
  private insertChunkStmt!: Database.Statement;
  private getChunksToEmbedStmt!: Database.Statement;
  private getChunkContentStmt!: Database.Statement;
  private hasChunksStmt!: Database.Statement;
  private insertVecStmt!: Database.Statement;
  private insertMapStmt!: Database.Statement;
  private setMetaStmt!: Database.Statement;
  private getMetaStmt!: Database.Statement;
  private keywordSearchStmt!: Database.Statement;
  private vectorSearchStmt!: Database.Statement;

  constructor(private readonly config: SqliteConfig) {
    const dir = dirname(config.path);
    mkdirSync(dir, { recursive: true });

    this.db = new Database(config.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sqliteVec.load as any)(this.db);
  }

  async init(): Promise<void> {
    this.ensureSchema();
    this.prepareStatements();
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      create table if not exists documents(
        id integer primary key,
        source text not null,
        uri text not null unique,
        repo text,
        path text,
        title text,
        lang text,
        hash text not null,
        mtime integer,
        version text,
        extra_json text
      );

      create table if not exists chunks(
        id integer primary key,
        document_id integer not null references documents(id) on delete cascade,
        chunk_index integer not null,
        content text not null,
        start_line integer,
        end_line integer,
        token_count integer
      );

      create virtual table if not exists chunks_fts using fts5(
        content,
        content='chunks',
        content_rowid='id'
      );

      create trigger if not exists chunks_ai after insert on chunks begin
        insert into chunks_fts(rowid, content) values (new.id, new.content);
      end;
      create trigger if not exists chunks_ad after delete on chunks begin
        insert into chunks_fts(chunks_fts, rowid, content) values('delete', old.id, old.content);
      end;
      create trigger if not exists chunks_au after update on chunks begin
        insert into chunks_fts(chunks_fts, rowid, content) values('delete', old.id, old.content);
        insert into chunks_fts(rowid, content) values (new.id, new.content);
      end;

      create virtual table if not exists vec_chunks using vec0(
        embedding float[${this.config.embeddingDim}]
      );

      create table if not exists chunk_vec_map(
        chunk_id integer primary key references chunks(id) on delete cascade,
        vec_rowid integer not null
      );

      create table if not exists meta(
        key text primary key,
        value text
      );
    `);
  }

  private prepareStatements(): void {
    this.getDocumentStmt = this.db.prepare('select id, hash from documents where uri = ?');

    this.upsertDocumentStmt = this.db.prepare(`
      insert into documents (source, uri, repo, path, title, lang, hash, mtime, version, extra_json)
      values (@source, @uri, @repo, @path, @title, @lang, @hash, @mtime, @version, @extra_json)
      on conflict(uri) do update set
        source=excluded.source, repo=excluded.repo, path=excluded.path,
        title=excluded.title, lang=excluded.lang, hash=excluded.hash,
        mtime=excluded.mtime, version=excluded.version, extra_json=excluded.extra_json
      returning id
    `);

    this.insertChunkStmt = this.db.prepare(`
      insert into chunks (document_id, chunk_index, content, start_line, end_line, token_count)
      values (?, ?, ?, ?, ?, ?)
    `);

    this.getChunksToEmbedStmt = this.db.prepare(`
      select c.id, c.content
      from chunks c
      left join chunk_vec_map m on m.chunk_id = c.id
      where m.chunk_id is null
      limit ?
    `);

    this.getChunkContentStmt = this.db.prepare(`
      select c.id, c.content, c.document_id, c.start_line, c.end_line,
             d.source, d.uri, d.repo, d.path, d.title
      from chunks c
      join documents d on d.id = c.document_id
      where c.id = ?
    `);

    this.hasChunksStmt = this.db.prepare(
      'select count(*) as count from chunks where document_id = ?',
    );

    this.insertVecStmt = this.db.prepare('insert into vec_chunks (embedding) values (?)');
    this.insertMapStmt = this.db.prepare(
      'insert or replace into chunk_vec_map (chunk_id, vec_rowid) values (?, ?)',
    );

    this.setMetaStmt = this.db.prepare(
      'insert into meta(key, value) values (?, ?) on conflict(key) do update set value=excluded.value',
    );
    this.getMetaStmt = this.db.prepare('select value from meta where key = ?');
  }

  async getDocument(uri: string): Promise<{ id: number; hash: string } | null> {
    const row = this.getDocumentStmt.get(uri) as { id: number; hash: string } | undefined;
    return row || null;
  }

  async upsertDocument(doc: DocumentInput): Promise<number> {
    const row = await this.getDocument(doc.uri);
    const isSame = row && row.hash === doc.hash;

    // Map extraJson to extra_json for SQLite parameter binding
    const docParams = {
      source: doc.source,
      uri: doc.uri,
      repo: doc.repo,
      path: doc.path,
      title: doc.title,
      lang: doc.lang,
      hash: doc.hash,
      mtime: doc.mtime,
      version: doc.version,
      extra_json: doc.extraJson,
    };

    const result = this.upsertDocumentStmt.get(docParams) as { id: number } | undefined;

    if (!result) {
      throw new Error(`Failed to upsert document: ${doc.uri}`);
    }

    if (!isSame && row) {
      await this.cleanupDocumentChunks(result.id);
    }

    return result.id;
  }

  async insertChunks(documentId: number, chunks: readonly ChunkInput[]): Promise<void> {
    const transaction = this.db.transaction(() => {
      chunks.forEach((chunk, index) => {
        this.insertChunkStmt.run(
          documentId,
          index,
          chunk.content,
          chunk.startLine ?? null,
          chunk.endLine ?? null,
          chunk.tokenCount ?? null,
        );
      });
    });

    transaction();
  }

  async getChunksToEmbed(limit: number = 10000): Promise<ChunkToEmbed[]> {
    return this.getChunksToEmbedStmt.all(limit) as ChunkToEmbed[];
  }

  async getChunkContent(chunkId: number): Promise<ChunkContent | null> {
    const row = this.getChunkContentStmt.get(chunkId) as ChunkContent | undefined;
    return row || null;
  }

  async hasChunks(documentId: number): Promise<boolean> {
    const row = this.hasChunksStmt.get(documentId) as { count: number };
    return row.count > 0;
  }

  async insertEmbeddings(chunks: Array<{ id: number; embedding: number[] }>): Promise<void> {
    const transaction = this.db.transaction(() => {
      chunks.forEach(({ id, embedding }) => {
        const embeddingStr = JSON.stringify(Array.from(embedding));
        const result = this.insertVecStmt.run(embeddingStr);
        this.insertMapStmt.run(id, result.lastInsertRowid);
      });
    });

    transaction();
  }

  async keywordSearch(
    query: string,
    limit: number,
    filters: SearchFilters,
  ): Promise<SearchResult[]> {
    const filterConditions: string[] = [];
    const params: Record<string, unknown> = { query, k: limit };

    if (filters.source) {
      filterConditions.push('d.source = @source');
      params.source = filters.source;
    }
    if (filters.repo) {
      filterConditions.push('d.repo = @repo');
      params.repo = filters.repo;
    }
    if (filters.pathPrefix) {
      filterConditions.push('d.path like @pathPrefix');
      params.pathPrefix = `${filters.pathPrefix}%`;
    }

    const filterSql = filterConditions.length ? `and ${filterConditions.join(' and ')}` : '';

    const sql = `
      with kw as (
        select c.id as chunk_id, bm25(chunks_fts) as score
        from chunks_fts
        join chunks c on c.id = chunks_fts.rowid
        where chunks_fts match $query
        limit $k
      )
      select kw.chunk_id, kw.score, d.id as document_id, d.source, d.uri, d.repo, d.path, d.title,
             c.start_line, c.end_line, substr(c.content, 1, 400) as snippet
      from kw
      join chunks c on c.id = kw.chunk_id
      join documents d on d.id = c.document_id
      where 1=1 ${filterSql}
      limit $k
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(params) as SearchResult[];
  }

  async vectorSearch(
    embedding: number[],
    limit: number,
    filters: SearchFilters,
  ): Promise<SearchResult[]> {
    const filterConditions: string[] = [];
    const params: Record<string, unknown> = {
      embedding: JSON.stringify(embedding),
      k: limit,
    };

    if (filters.source) {
      filterConditions.push('d.source = @source');
      params.source = filters.source;
    }
    if (filters.repo) {
      filterConditions.push('d.repo = @repo');
      params.repo = filters.repo;
    }
    if (filters.pathPrefix) {
      filterConditions.push('d.path like @pathPrefix');
      params.pathPrefix = `${filters.pathPrefix}%`;
    }

    const filterSql = filterConditions.length ? `and ${filterConditions.join(' and ')}` : '';

    const sql = `
      with vec as (
        select rowid, distance
        from vec_chunks
        where embedding match $embedding and k = $k
      )
      select m.chunk_id as chunk_id, vec.distance as score, d.id as document_id, d.source, d.uri, d.repo, d.path, d.title,
             c.start_line, c.end_line, substr(c.content, 1, 400) as snippet
      from vec
      join chunk_vec_map m on m.vec_rowid = vec.rowid
      join chunks c on c.id = m.chunk_id
      join documents d on d.id = c.document_id
      where 1=1 ${filterSql}
      limit $k
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(params) as SearchResult[];
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.setMetaStmt.run(key, value);
  }

  async getMeta(key: string): Promise<string | undefined> {
    const row = this.getMetaStmt.get(key) as { value: string } | undefined;
    return row?.value;
  }

  async cleanupDocumentChunks(documentId: number): Promise<void> {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
        delete from vec_chunks where rowid in (
          select m.vec_rowid from chunk_vec_map m 
          join chunks c on c.id = m.chunk_id 
          where c.document_id = ?
        )
      `,
        )
        .run(documentId);

      this.db
        .prepare(
          'delete from chunk_vec_map where chunk_id in (select id from chunks where document_id=?)',
        )
        .run(documentId);
      this.db.prepare('delete from chunks where document_id = ?').run(documentId);
    });

    transaction();
  }
}
