import { ingestConfluence } from '../../ingest/sources/confluence.js';

import type { Application } from '../factories/application-factory.js';

export interface IngestConfluenceRequest {
  readonly spaces?: readonly string[];
}

export interface IngestConfluenceResponse {
  readonly success: boolean;
  readonly message: string;
  readonly documentsProcessed: number;
}

export class IngestConfluenceUseCase {
  constructor(private readonly app: Application) {}

  async execute(_request: IngestConfluenceRequest = {}): Promise<IngestConfluenceResponse> {
    try {
      // For now, we still use the legacy ingest function but through our adapter system
      // TODO: This should be refactored to use pure domain services in the future
      const adapter = await this.getLegacyAdapter();

      await ingestConfluence(adapter);

      // Generate embeddings for newly ingested chunks
      await this.app.useCases.generateEmbeddings.execute();

      return {
        success: true,
        message: 'Confluence pages ingested successfully',
        documentsProcessed: 0, // TODO: Return actual count
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Confluence ingestion failed: ${errorMessage}`,
        documentsProcessed: 0,
      };
    }
  }

  private async getLegacyAdapter() {
    // This is a temporary bridge to the legacy system
    // In the future, this should be replaced with proper domain services
    const { getDatabase } = await import('../../ingest/database.js');
    return await getDatabase();
  }
}
