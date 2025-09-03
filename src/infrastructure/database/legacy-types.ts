// Legacy database types - kept for backward compatibility during transition
// These should be removed once the legacy ingest system migration is complete
// TODO: Replace with proper domain entities and repository patterns

// Use domain types instead of duplicating them
import type { SourceType } from '../../domain/entities/document.js';
export type { SourceType };

// Legacy database row types - these contain [key: string]: unknown which violates domain principles
// These are only used by the legacy ingest system and should eventually be removed
export interface DocumentRow {
  readonly [key: string]: unknown;
  readonly id?: number;
  readonly source: SourceType;
  readonly uri: string;
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

export interface ChunkWithMetadata extends ChunkRow {
  readonly document: DocumentRow;
}

export type DocumentInput = Omit<DocumentRow, 'id'>;

// Re-export domain types for convenience during migration
export type { DocumentEntity } from '../../domain/entities/document.js';
export type { ChunkEntity } from '../../domain/entities/document.js';
export type { SearchResultEntity } from '../../domain/entities/document.js';
export type { ChunkContentEntity as ChunkContent } from '../../domain/entities/document.js';
