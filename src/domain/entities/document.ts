export type SourceType = 'file' | 'confluence';

export interface DocumentEntity {
  readonly id?: number;
  readonly source: SourceType;
  readonly uri: string;
  readonly repo?: string | null;
  readonly path?: string | null;
  readonly title?: string | null;
  readonly lang?: string | null; // Keep legacy field name for compatibility
  readonly language?: string | null;
  readonly hash: string;
  readonly mtime?: number | null; // Keep legacy field name for compatibility
  readonly modifiedTime?: number | null;
  readonly version?: string | null;
  readonly extraJson?: string | null; // Keep legacy field name for compatibility
  readonly metadata?: Record<string, unknown> | null;
}

export interface ChunkEntity {
  readonly id?: number;
  readonly document_id?: number; // Keep legacy field name for compatibility
  readonly documentId: number;
  readonly chunk_index?: number; // Keep legacy field name for compatibility
  readonly index: number;
  readonly content: string;
  readonly start_line?: number | null; // Keep legacy field name for compatibility
  readonly startLine?: number | null;
  readonly end_line?: number | null; // Keep legacy field name for compatibility
  readonly endLine?: number | null;
  readonly token_count?: number | null; // Keep legacy field name for compatibility
  readonly tokenCount?: number | null;
}

export interface EmbeddingEntity {
  readonly id: number;
  readonly embedding: readonly number[];
}

export interface SearchResultEntity {
  readonly chunk_id?: number; // Keep legacy field name for compatibility
  readonly chunkId: number;
  readonly score: number;
  readonly document_id?: number; // Keep legacy field name for compatibility
  readonly documentId: number;
  readonly source: SourceType;
  readonly uri: string;
  readonly repo?: string | null;
  readonly path?: string | null;
  readonly title?: string | null;
  readonly start_line?: number | null; // Keep legacy field name for compatibility
  readonly startLine?: number | null;
  readonly end_line?: number | null; // Keep legacy field name for compatibility
  readonly endLine?: number | null;
  readonly snippet: string;
}

export interface ChunkContentEntity {
  readonly id: number;
  readonly content: string;
  readonly documentId: number;
  readonly source: SourceType;
  readonly uri: string;
  readonly repo?: string | null;
  readonly path?: string | null;
  readonly title?: string | null;
  readonly startLine?: number | null;
  readonly endLine?: number | null;
}
