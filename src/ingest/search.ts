import type Database from 'better-sqlite3';
import type { DB } from './db.js';
import { SourceType, SearchResultRow } from '../shared/types.js';

export type SearchMode = 'auto' | 'vector' | 'keyword';

export interface SearchParams {
  readonly query: string;
  readonly topK?: number;
  readonly source?: SourceType;
  readonly repo?: string;
  readonly pathPrefix?: string;
  readonly mode?: SearchMode;
}

interface SearchBinds {
  readonly [key: string]: unknown;
  readonly query?: string;
  readonly k: number;
  readonly source?: SourceType;
  readonly repo?: string;
  readonly pathPrefix?: string;
  readonly embedding?: string;
}

interface HybridSearchResult {
  readonly kw: Database.Statement;
  readonly vec: Database.Statement;
  readonly binds: Record<string, unknown>;
  readonly topK: number;
}

export function hybridSearch(db: DB, params: SearchParams): HybridSearchResult {
  const topK = params.topK ?? 8;

  const filters: string[] = [];
  const binds: Record<string, unknown> = {};
  
  if (params.source) { 
    filters.push('d.source = @source'); 
    binds.source = params.source; 
  }
  if (params.repo) { 
    filters.push('d.repo = @repo'); 
    binds.repo = params.repo; 
  }
  if (params.pathPrefix) { 
    filters.push('d.path like @pathPrefix'); 
    binds.pathPrefix = params.pathPrefix + '%'; 
  }
  
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

  return { 
    kw, 
    vec, 
    binds: { ...binds, k: topK }, 
    topK 
  };
}
