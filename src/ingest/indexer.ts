import { getEmbedder } from './embeddings.js';

import type { DB } from './db.js';
import type { DocumentInput, ChunkInput } from '../shared/types.js';
import type Database from 'better-sqlite3';

interface ChunkToEmbed {
  readonly [key: string]: unknown;
  readonly id: number;
  readonly content: string;
}

export class Indexer {
  private readonly getDocumentStmt: Database.Statement;
  private readonly upsertDocumentStmt: Database.Statement;
  private readonly insertChunkStmt: Database.Statement;
  private readonly getChunksToEmbedStmt: Database.Statement;
  private readonly insertVecStmt: Database.Statement;
  private readonly insertMapStmt: Database.Statement;
  private readonly setMetaStmt: Database.Statement;
  private readonly getMetaStmt: Database.Statement;

  constructor(private readonly db: DB) {
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
      limit 10000
    `);
    this.insertVecStmt = this.db.prepare('insert into vec_chunks (embedding) values (?)');
    this.insertMapStmt = this.db.prepare(
      'insert or replace into chunk_vec_map (chunk_id, vec_rowid) values (?, ?)',
    );
    this.setMetaStmt = this.db.prepare(
      'insert into meta(key, value) values (?, ?) on conflict(key) do update set value=excluded.value',
    );
    this.getMetaStmt = this.db.prepare('select value from meta where key = ?');
  }

  upsertDocument(doc: DocumentInput): number {
    const row = this.getDocumentStmt.get(doc.uri);
    const isSame = row && row.hash === doc.hash;
    const result = this.upsertDocumentStmt.get(doc);

    if (!result) {
      throw new Error(`Failed to upsert document: ${doc.uri}`);
    }

    if (!isSame && row) {
      this.cleanupDocumentChunks(result.id);
    }

    return result.id;
  }

  private cleanupDocumentChunks(documentId: number): void {
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

  insertChunks(documentId: number, chunks: readonly ChunkInput[]): void {
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

  async embedNewChunks(batchSize: number = 64): Promise<void> {
    const embedder = getEmbedder();
    const toEmbed = this.getChunksToEmbedStmt.all();

    for (let i = 0; i < toEmbed.length; i += batchSize) {
      const batch = toEmbed.slice(i, i + batchSize);
      const vecs = await embedder.embed(batch.map((b: ChunkToEmbed) => b.content));

      const transaction = this.db.transaction(() => {
        batch.forEach((item: ChunkToEmbed, j: number) => {
          const vec = vecs[j];
          if (!vec) {
            throw new Error(`Missing embedding vector for chunk ${item.id}`);
          }
          const embedding = JSON.stringify(Array.from(vec));
          const result = this.insertVecStmt.run(embedding);
          this.insertMapStmt.run(item.id, result.lastInsertRowid);
        });
      });

      transaction();
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  setMeta(key: string, value: string): void {
    this.setMetaStmt.run(key, value);
  }

  getMeta(key: string): string | undefined {
    const row = this.getMetaStmt.get(key);
    return row?.value;
  }
}
