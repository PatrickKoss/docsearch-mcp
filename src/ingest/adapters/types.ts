import type { DocumentInput, ChunkInput } from '../../shared/types.js';

export interface ChunkToEmbed {
  readonly id: number;
  readonly content: string;
}

export interface SearchResult {
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
  readonly extra_json: string | null;
}

export interface ChunkContent {
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

export interface DatabaseAdapter {
  init(): Promise<void>;
  close(): Promise<void>;

  // Document operations
  getDocument(uri: string): Promise<{ id: number; hash: string } | null>;
  upsertDocument(doc: DocumentInput): Promise<number>;
  updateDocumentHash(documentId: number, hash: string): Promise<void>;

  // Chunk operations
  insertChunks(documentId: number, chunks: readonly ChunkInput[]): Promise<void>;
  insertChunk(documentId: number, chunk: ChunkInput, index: number): Promise<void>;
  updateChunk(chunkId: number, chunk: ChunkInput): Promise<void>;
  deleteChunk(chunkId: number): Promise<void>;
  deleteDocumentChunks(documentId: number): Promise<void>;
  getChunksToEmbed(limit?: number): Promise<ChunkToEmbed[]>;
  getChunkContent(chunkId: number): Promise<ChunkContent | null>;
  getDocumentChunks(
    documentId: number,
  ): Promise<Array<{ id: number; content: string; startLine: number; endLine: number }>>;
  getChunkCount(documentId: number): Promise<number>;
  hasChunks(documentId: number): Promise<boolean>;

  // Vector operations
  insertEmbeddings(chunks: Array<{ id: number; embedding: number[] }>): Promise<void>;
  deleteEmbedding(chunkId: number): Promise<void>;

  // Search operations
  keywordSearch(query: string, limit: number, filters: SearchFilters): Promise<SearchResult[]>;
  vectorSearch(embedding: number[], limit: number, filters: SearchFilters): Promise<SearchResult[]>;

  // Metadata operations
  setMeta(key: string, value: string): Promise<void>;
  getMeta(key: string): Promise<string | undefined>;

  // Cleanup operations
  cleanupDocumentChunks(documentId: number): Promise<void>;

  // Raw query for statistics (adapter specific)
  rawQuery(sql: string): Promise<Record<string, unknown>[]>;
}

export interface SearchFilters {
  readonly source?: string;
  readonly repo?: string;
  readonly pathPrefix?: string;
  readonly includeImages?: boolean;
  readonly imagesOnly?: boolean;
}
