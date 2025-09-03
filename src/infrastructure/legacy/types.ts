// Legacy infrastructure types for backward compatibility
// These are used by the legacy ingest and search system

import type { SourceType } from '../../domain/entities/document.js';

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

// Legacy adapter types - moved from infrastructure/legacy/adapters/types.ts
export interface ChunkToEmbed {
  readonly id: number;
  readonly content: string;
}

export interface LegacySearchResult {
  readonly chunk_id: number;
  readonly score: number;
  readonly document_id: number;
  readonly source: string;
  readonly uri: string;
  readonly repo: string | null;
  readonly path: string | null;
  readonly title: string | null;
  readonly start_line: number | null;
  readonly end_line: number | null;
  readonly snippet: string;
}

export interface LegacyChunkContent {
  readonly id: number;
  readonly content: string;
  readonly document_id: number;
  readonly source: string;
  readonly uri: string;
  readonly repo: string | null;
  readonly path: string | null;
  readonly title: string | null;
  readonly start_line: number | null;
  readonly end_line: number | null;
}

export interface SearchFilters {
  readonly source?: string;
  readonly repo?: string;
  readonly pathPrefix?: string;
}

export interface DatabaseAdapter {
  init(): Promise<void>;
  close(): Promise<void>;

  // Document operations
  getDocument(uri: string): Promise<{ id: number; hash: string } | null>;
  upsertDocument(doc: DocumentInput): Promise<number>;

  // Chunk operations
  insertChunks(documentId: number, chunks: readonly ChunkInput[]): Promise<void>;
  getChunksToEmbed(limit?: number): Promise<ChunkToEmbed[]>;
  getChunkContent(chunkId: number): Promise<LegacyChunkContent | null>;
  hasChunks(documentId: number): Promise<boolean>;

  // Vector operations
  insertEmbeddings(chunks: Array<{ id: number; embedding: number[] }>): Promise<void>;

  // Search operations
  keywordSearch(
    query: string,
    limit: number,
    filters: SearchFilters,
  ): Promise<LegacySearchResult[]>;
  vectorSearch(
    embedding: number[],
    limit: number,
    filters: SearchFilters,
  ): Promise<LegacySearchResult[]>;

  // Metadata operations
  setMeta(key: string, value: string): Promise<void>;
  getMeta(key: string): Promise<string | undefined>;

  // Cleanup operations
  cleanupDocumentChunks(documentId: number): Promise<void>;

  // Raw query for statistics (adapter specific)
  rawQuery(sql: string): Promise<Record<string, unknown>[]>;
}
