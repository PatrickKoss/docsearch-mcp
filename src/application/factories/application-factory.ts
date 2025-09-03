import { IndexingService } from '../../domain/services/indexing-service.js';
import { SearchService } from '../../domain/services/search-service.js';
import { DatabaseFactory } from '../../infrastructure/factories/database-factory.js';
import { EmbeddingFactory } from '../../infrastructure/factories/embedding-factory.js';
import { DocumentService } from '../services/document-service.js';
import { GenerateEmbeddingsUseCase } from '../use-cases/generate-embeddings-use-case.js';
import { GetChunkContentUseCase } from '../use-cases/get-chunk-content-use-case.js';
import { IndexDocumentUseCase } from '../use-cases/index-document-use-case.js';
import { IngestConfluenceUseCase } from '../use-cases/ingest-confluence-use-case.js';
import { IngestFilesUseCase } from '../use-cases/ingest-files-use-case.js';
import { SearchDocumentsUseCase } from '../use-cases/search-documents-use-case.js';

import type { ApplicationConfig } from '../config/application-config.js';

export interface ApplicationServices {
  readonly indexingService: IndexingService;
  readonly searchService: SearchService;
  readonly documentService: DocumentService;
}

export interface ApplicationUseCases {
  readonly indexDocument: IndexDocumentUseCase;
  readonly generateEmbeddings: GenerateEmbeddingsUseCase;
  readonly searchDocuments: SearchDocumentsUseCase;
  readonly getChunkContent: GetChunkContentUseCase;
  readonly ingestFiles: IngestFilesUseCase;
  readonly ingestConfluence: IngestConfluenceUseCase;
}

export interface Application {
  readonly services: ApplicationServices;
  readonly useCases: ApplicationUseCases;
  close(): void;
}

export class ApplicationFactory {
  static create(config: ApplicationConfig): Application {
    // Create infrastructure components
    const databaseFactory = new DatabaseFactory();
    const databaseDeps = databaseFactory.create({
      path: config.database.path,
      embeddingDimensions: config.database.embeddingDimensions,
    });

    const embeddingService = EmbeddingFactory.create(config.embedding);

    // Create domain services
    const indexingService = new IndexingService(
      databaseDeps.documentRepository,
      embeddingService,
      databaseDeps.metadataRepository,
    );

    const searchService = new SearchService(databaseDeps.searchRepository, embeddingService);

    // Create use cases first
    const indexDocumentUseCase = new IndexDocumentUseCase(indexingService);
    const generateEmbeddingsUseCase = new GenerateEmbeddingsUseCase(indexingService);
    const searchDocumentsUseCase = new SearchDocumentsUseCase(searchService);
    const getChunkContentUseCase = new GetChunkContentUseCase(searchService);

    const app: Application = {
      services: {
        indexingService,
        searchService,
        documentService: null as unknown as DocumentService, // Will be set below
      },
      useCases: {
        indexDocument: indexDocumentUseCase,
        generateEmbeddings: generateEmbeddingsUseCase,
        searchDocuments: searchDocumentsUseCase,
        getChunkContent: getChunkContentUseCase,
        ingestFiles: null as unknown as IngestFilesUseCase, // Will be set below
        ingestConfluence: null as unknown as IngestConfluenceUseCase, // Will be set below
      },
      close: () => {
        databaseFactory.close();
      },
    };

    // Create remaining use cases that depend on app
    const ingestFilesUseCase = new IngestFilesUseCase(app);
    const ingestConfluenceUseCase = new IngestConfluenceUseCase(app);

    // Create document service
    const documentService = new DocumentService(app);

    // Set remaining references
    (app.services as { documentService: DocumentService }).documentService = documentService;
    (app.useCases as { ingestFiles: IngestFilesUseCase }).ingestFiles = ingestFilesUseCase;
    (app.useCases as { ingestConfluence: IngestConfluenceUseCase }).ingestConfluence =
      ingestConfluenceUseCase;

    return app;
  }
}
