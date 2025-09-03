import { mkdirSync } from 'fs';
import { dirname } from 'path';

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

import { CONFIG } from '../infrastructure/config/legacy-config.js';

export type DB = Database.Database;

export interface DbConfig {
  readonly path: string;
  readonly embeddingDim: number;
}

export function openDb(config?: Partial<DbConfig>): DB {
  const dbConfig: DbConfig = {
    path: config?.path ?? CONFIG.DB_PATH,
    embeddingDim: config?.embeddingDim ?? CONFIG.OPENAI_EMBED_DIM,
  };

  const dir = dirname(dbConfig.path);
  mkdirSync(dir, { recursive: true });

  const db = new Database(dbConfig.path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 10000');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sqliteVec.load as any)(db);
  ensureSchema(db, dbConfig.embeddingDim);
  return db;
}

function ensureSchema(db: DB, embeddingDim: number): void {
  db.exec(`
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
      embedding float[${embeddingDim}]
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
