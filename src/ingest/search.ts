import type Database from 'better-sqlite3';

export interface SearchParams {
  query: string;
  topK?: number;
  source?: 'file'|'confluence';
  repo?: string;
  pathPrefix?: string;
  mode?: 'auto'|'vector'|'keyword';
}

export function hybridSearch(db: Database.Database, p: SearchParams) {
  const topK = p.topK ?? 8;

  const filters: string[] = [];
  const binds: any = {};
  if (p.source) { filters.push('d.source = @source'); binds.source = p.source; }
  if (p.repo) { filters.push('d.repo = @repo'); binds.repo = p.repo; }
  if (p.pathPrefix) { filters.push('d.path like @pathPrefix'); binds.pathPrefix = p.pathPrefix + '%'; }
  const filterSql = filters.length ? ('where ' + filters.join(' and ')) : '';

  const kw = db.prepare(`
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
    ${filterSql}
    limit $k
  `);

  const vec = db.prepare(`
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
    ${filterSql}
    limit $k
  `);

  return { kw, vec, binds, topK };
}
