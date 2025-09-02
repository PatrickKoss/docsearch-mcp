export type SourceType = 'file' | 'confluence';

export interface DocumentRow {
  id?: number;
  source: SourceType;
  uri: string;           // file://... or confluence://{id}
  repo?: string | null;
  path?: string | null;
  title?: string | null;
  lang?: string | null;
  hash: string;
  mtime?: number | null;
  version?: string | null;
  extra_json?: string | null;
}

export interface ChunkRow {
  id?: number;
  document_id: number;
  chunk_index: number;
  content: string;
  start_line?: number | null;
  end_line?: number | null;
  token_count?: number | null;
}
