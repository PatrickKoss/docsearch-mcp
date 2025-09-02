import type Database from 'better-sqlite3';
import { DocumentRow } from '../shared/types.js';
import { getEmbedder } from './embeddings.js';

export class Indexer {
  constructor(private db: Database.Database) {}

  upsertDocument(doc: Omit<DocumentRow, 'id'>): number {
    const get = this.db.prepare('select id, hash from documents where uri = ?');
    const row = get.get(doc.uri) as { id: number, hash: string } | undefined;
    const isSame = row && row.hash === doc.hash;
    const up = this.db.prepare(`
      insert into documents (source, uri, repo, path, title, lang, hash, mtime, version, extra_json)
      values (@source, @uri, @repo, @path, @title, @lang, @hash, @mtime, @version, @extra_json)
      on conflict(uri) do update set
        source=excluded.source, repo=excluded.repo, path=excluded.path,
        title=excluded.title, lang=excluded.lang, hash=excluded.hash,
        mtime=excluded.mtime, version=excluded.version, extra_json=excluded.extra_json
      returning id
    `);
    const res = up.get(doc) as { id: number };
    if (!isSame && row) {
      this.db.prepare('delete from vec_chunks where chunk_id in (select id from chunks where document_id=?)').run(res.id);
      this.db.prepare('delete from chunks where document_id = ?').run(res.id);
    }
    return res.id;
  }

  insertChunks(document_id: number, chunks: { content: string; startLine?: number; endLine?: number; tokenCount?: number; }[]) {
    const ins = this.db.prepare(`
      insert into chunks (document_id, chunk_index, content, start_line, end_line, token_count)
      values (?, ?, ?, ?, ?, ?)
    `);
    const t = this.db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        ins.run(document_id, i, c.content, c.startLine ?? null, c.endLine ?? null, c.tokenCount ?? null);
      }
    });
    t();
  }

  async embedNewChunks(batchSize = 64) {
    const embedder = getEmbedder();
    const toEmbed = this.db.prepare(`
      select c.id, c.content
      from chunks c
      left join vec_chunks v on v.chunk_id = c.id
      where v.chunk_id is null
      limit 10000
    `).all() as { id: number, content: string }[];

    for (let i = 0; i < toEmbed.length; i += batchSize) {
      const batch = toEmbed.slice(i, i + batchSize);
      const vecs = await embedder.embed(batch.map(b => b.content));
      const ins = this.db.prepare('insert into vec_chunks (chunk_id, embedding) values (?, ?)');
      const t = this.db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const embedding = JSON.stringify(Array.from(vecs[j]));
          ins.run(batch[j].id, embedding);
        }
      });
      t();
      await new Promise(r => setTimeout(r, 30));
    }
  }

  setMeta(key: string, value: string) {
    this.db.prepare('insert into meta(key, value) values (?, ?) on conflict(key) do update set value=excluded.value').run(key, value);
  }
  getMeta(key: string): string|undefined {
    const row = this.db.prepare('select value from meta where key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }
}
