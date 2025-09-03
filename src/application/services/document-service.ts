import type { SearchResultEntity, SourceType } from '../../domain/entities/document.js';
import type { SearchMode } from '../../domain/value-objects/search-criteria.js';
import type { Application } from '../factories/application-factory.js';

export interface DocumentSearchRequest {
  readonly query: string;
  readonly limit: number;
  readonly mode: SearchMode;
  readonly source?: SourceType | undefined;
  readonly repository?: string | undefined;
  readonly pathPrefix?: string | undefined;
}

export interface DocumentSearchResult {
  readonly id: number;
  readonly chunkId: number;
  readonly documentId: number;
  readonly title: string;
  readonly content: string;
  readonly snippet: string;
  readonly source: SourceType;
  readonly uri: string;
  readonly repo: string | null;
  readonly path: string | null;
  readonly startLine: number | null;
  readonly endLine: number | null;
  readonly score: number;
}

export interface DocumentIngestRequest {
  readonly sources: ReadonlyArray<SourceType | 'all'>;
  readonly watch?: boolean;
}

export interface DocumentIngestResponse {
  readonly success: boolean;
  readonly message: string;
  readonly sourcesProcessed: readonly string[];
}

export class DocumentService {
  constructor(private readonly app: Application) {}

  async ingestDocuments(request: DocumentIngestRequest): Promise<DocumentIngestResponse> {
    const sourcesToProcess: string[] = [];

    // Determine which sources to process
    const sources = request.sources.includes('all')
      ? (['file', 'confluence'] as const)
      : request.sources.filter((s): s is SourceType => s !== 'all');

    try {
      for (const source of sources) {
        switch (source) {
          case 'file':
            await this.app.useCases.ingestFiles.execute(
              request.watch ? { watch: request.watch } : {},
            );
            sourcesToProcess.push('files');
            break;
          case 'confluence':
            await this.app.useCases.ingestConfluence.execute();
            sourcesToProcess.push('confluence');
            break;
        }
      }

      return {
        success: true,
        message: `Successfully ingested: ${sourcesToProcess.join(', ')}`,
        sourcesProcessed: sourcesToProcess,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Ingestion failed: ${errorMessage}`,
        sourcesProcessed: sourcesToProcess,
      };
    }
  }

  async searchDocuments(request: DocumentSearchRequest): Promise<readonly DocumentSearchResult[]> {
    const searchResponse = await this.app.useCases.searchDocuments.execute({
      query: request.query,
      limit: request.limit,
      mode: request.mode,
      source: request.source,
      repository: request.repository,
      pathPrefix: request.pathPrefix,
    });

    return searchResponse.results.map(this.mapSearchResult);
  }

  async getDocumentChunk(chunkId: number): Promise<DocumentSearchResult | null> {
    const response = await this.app.useCases.getChunkContent.execute({ chunkId });

    if (!response.chunk) {
      return null;
    }

    const chunk = response.chunk;
    return {
      id: chunk.id,
      chunkId: chunk.id,
      documentId: chunk.documentId,
      title: chunk.title || chunk.path || chunk.uri,
      content: chunk.content,
      snippet: chunk.content.slice(0, 400),
      source: chunk.source,
      uri: chunk.uri,
      repo: chunk.repo || null,
      path: chunk.path || null,
      startLine: chunk.startLine || null,
      endLine: chunk.endLine || null,
      score: 1.0, // Not applicable for direct chunk retrieval
    };
  }

  private mapSearchResult(result: SearchResultEntity): DocumentSearchResult {
    return {
      id: result.chunkId,
      chunkId: result.chunkId,
      documentId: result.documentId,
      title: result.title || result.path || result.uri,
      content: result.snippet,
      snippet: result.snippet,
      source: result.source,
      uri: result.uri,
      repo: result.repo || null,
      path: result.path || null,
      startLine: result.startLine || null,
      endLine: result.endLine || null,
      score: result.score,
    };
  }
}
