export type SourceType = 'file' | 'confluence';

export interface DocumentRow {
  readonly [key: string]: unknown;
  readonly id?: number;
  readonly source: SourceType;
  readonly uri: string;           // file://... or confluence://{id}
  readonly repo?: string | null;
  readonly path?: string | null;
  readonly title?: string | null;
  readonly lang?: string | null;
  readonly hash: string;
  readonly mtime?: number | null;
  readonly version?: string | null;
  readonly extra_json?: string | null;
}

export interface ChunkRow {
  readonly [key: string]: unknown;
  readonly id?: number;
  readonly document_id: number;
  readonly chunk_index: number;
  readonly content: string;
  readonly start_line?: number | null;
  readonly end_line?: number | null;
  readonly token_count?: number | null;
}

export interface ChunkVecMapRow {
  readonly [key: string]: unknown;
  readonly chunk_id: number;
  readonly vec_rowid: number;
}

export interface VecChunkRow {
  readonly [key: string]: unknown;
  readonly rowid?: number;
  readonly embedding: Float32Array;
}

export interface MetaRow {
  readonly [key: string]: unknown;
  readonly key: string;
  readonly value: string;
}

export interface SearchResultRow {
  readonly [key: string]: unknown;
  readonly chunk_id: number;
  readonly score: number;
  readonly document_id: number;
  readonly source: SourceType;
  readonly uri: string;
  readonly repo?: string | null;
  readonly path?: string | null;
  readonly title?: string | null;
  readonly start_line?: number | null;
  readonly end_line?: number | null;
  readonly snippet: string;
}

export interface ChunkInput {
  readonly content: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly tokenCount?: number;
}

export interface DocumentInput extends Omit<DocumentRow, 'id'> {}

export interface ChunkWithMetadata extends ChunkRow {
  readonly document: DocumentRow;
}
