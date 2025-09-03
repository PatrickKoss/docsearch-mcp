import { DefaultDocumentChunkingService } from '../../domain/services/document-chunking-service.js';
import { CryptoHashService } from '../../domain/services/hash-service.js';
import { LEGACY_CONFIG } from '../../shared/config/legacy-config.js';
import { RestConfluenceAdapter } from '../adapters/content/confluence-adapter.js';

import type { DocumentEntity } from '../../domain/entities/document.js';
import type { ConfluenceConfig } from '../adapters/content/confluence-adapter.js';
import type { Application } from '../factories/application-factory.js';

export interface IngestConfluenceRequest {
  readonly spaces?: readonly string[];
  readonly config?: ConfluenceConfig;
}

export interface IngestConfluenceResponse {
  readonly success: boolean;
  readonly message: string;
  readonly documentsProcessed: number;
}

export class IngestConfluenceUseCase {
  private readonly confluenceAdapter = new RestConfluenceAdapter();
  private readonly chunkingService = new DefaultDocumentChunkingService();
  private readonly hashService = new CryptoHashService();

  constructor(private readonly app: Application) {}

  async execute(request: IngestConfluenceRequest = {}): Promise<IngestConfluenceResponse> {
    try {
      const config = request.config ?? this.buildConfigFromLegacy(request.spaces);

      if (!config.baseUrl || !config.email || !config.apiToken) {
        return {
          success: false,
          message: 'Confluence configuration is missing. Please check environment variables.',
          documentsProcessed: 0,
        };
      }

      const pages = await this.confluenceAdapter.getPages(config);
      let documentsProcessed = 0;

      for (const page of pages) {
        try {
          await this.processConfluencePage(page);
          documentsProcessed++;
        } catch (error) {
          console.error(`Error processing Confluence page ${page.title}:`, error);
        }
      }

      // Generate embeddings for newly ingested chunks
      await this.app.useCases.generateEmbeddings.execute();

      return {
        success: true,
        message: `Successfully processed ${documentsProcessed} Confluence pages`,
        documentsProcessed,
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

  private buildConfigFromLegacy(customSpaces?: readonly string[]): ConfluenceConfig {
    return {
      baseUrl: LEGACY_CONFIG.CONFLUENCE_BASE_URL,
      email: LEGACY_CONFIG.CONFLUENCE_EMAIL,
      apiToken: LEGACY_CONFIG.CONFLUENCE_API_TOKEN,
      spaces: customSpaces ?? LEGACY_CONFIG.CONFLUENCE_SPACES,
    };
  }

  private async processConfluencePage(page: {
    id: string;
    title: string;
    spaceKey: string;
    htmlContent: string;
    version: string;
    lastModified: Date;
    webUrl: string;
  }) {
    // Convert HTML to markdown
    const markdownContent = this.confluenceAdapter.convertHtmlToMarkdown(page.htmlContent);
    const contentHash = this.hashService.generateContentHash(markdownContent);

    // Create document entity
    const document: Omit<DocumentEntity, 'id'> = {
      source: 'confluence',
      uri: page.webUrl,
      repo: page.spaceKey,
      path: null,
      title: page.title,
      lang: 'markdown',
      hash: contentHash,
      mtime: page.lastModified.getTime(),
      version: page.version,
      extraJson: JSON.stringify({
        confluenceId: page.id,
        spaceKey: page.spaceKey,
      }),
      metadata: null,
    };

    // Generate chunks for the content
    const chunks = this.chunkingService.chunkDocument(markdownContent);

    // Index the document with its chunks
    await this.app.useCases.indexDocument.execute({ document, chunks });
  }
}
