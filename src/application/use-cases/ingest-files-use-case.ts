import path from 'node:path';

import { DefaultContentTypeDetector } from '../../domain/services/content-processing-service.js';
import { DefaultDocumentChunkingService } from '../../domain/services/document-chunking-service.js';
import { CryptoHashService } from '../../domain/services/hash-service.js';
import { LEGACY_CONFIG } from '../../shared/config/legacy-config.js';
import { NodeFileSystemAdapter } from '../adapters/content/file-system-adapter.js';
import { NodePdfContentAdapter } from '../adapters/content/pdf-content-adapter.js';

import type { DocumentEntity } from '../../domain/entities/document.js';
import type { Application } from '../factories/application-factory.js';

export interface IngestFilesRequest {
  readonly watch?: boolean;
  readonly roots?: readonly string[];
  readonly includeGlobs?: readonly string[];
  readonly excludeGlobs?: readonly string[];
}

export interface IngestFilesResponse {
  readonly success: boolean;
  readonly message: string;
  readonly documentsProcessed: number;
}

export class IngestFilesUseCase {
  private readonly fileSystemAdapter = new NodeFileSystemAdapter();
  private readonly pdfContentAdapter = new NodePdfContentAdapter();
  private readonly contentTypeDetector = new DefaultContentTypeDetector();
  private readonly chunkingService = new DefaultDocumentChunkingService();
  private readonly hashService = new CryptoHashService();

  constructor(private readonly app: Application) {}

  async execute(request: IngestFilesRequest = {}): Promise<IngestFilesResponse> {
    try {
      const roots = request.roots ?? LEGACY_CONFIG.FILE_ROOTS;
      const includeGlobs = request.includeGlobs ?? LEGACY_CONFIG.FILE_INCLUDE_GLOBS;
      const excludeGlobs = request.excludeGlobs ?? LEGACY_CONFIG.FILE_EXCLUDE_GLOBS;

      const files = await this.fileSystemAdapter.findFiles(roots, includeGlobs, excludeGlobs);
      let documentsProcessed = 0;

      for (const fileInfo of files) {
        try {
          await this.processFile(fileInfo);
          documentsProcessed++;
        } catch (error) {
          console.error(`Error processing file ${fileInfo.path}:`, error);
        }
      }

      // Generate embeddings for newly ingested chunks
      await this.app.useCases.generateEmbeddings.execute();

      return {
        success: true,
        message: `Successfully processed ${documentsProcessed} files`,
        documentsProcessed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `File ingestion failed: ${errorMessage}`,
        documentsProcessed: 0,
      };
    }
  }

  private async processFile(fileInfo: {
    path: string;
    absolutePath: string;
    modifiedTime: number;
  }) {
    const contentType = this.contentTypeDetector.detectContentType(fileInfo.path);
    let content: string;
    let extraJson: string | null = null;

    // Read file content based on type
    if (contentType === 'pdf') {
      content = await this.pdfContentAdapter.extractContent(fileInfo.absolutePath);
      const metadata = await this.pdfContentAdapter.extractMetadata(fileInfo.absolutePath);
      extraJson = JSON.stringify(metadata);
    } else {
      content = await this.fileSystemAdapter.readFileContent(fileInfo.absolutePath);
    }

    const contentHash = this.hashService.generateFileHash(content, fileInfo.absolutePath);

    // Create document entity
    const document: Omit<DocumentEntity, 'id'> = {
      source: 'file',
      uri: `file://${fileInfo.absolutePath}`,
      repo: null,
      path: fileInfo.path,
      title: path.basename(fileInfo.path),
      lang: this.detectLanguage(fileInfo.path),
      hash: contentHash,
      mtime: Math.floor(fileInfo.modifiedTime),
      version: null,
      extraJson,
      metadata: null,
    };

    // Generate chunks based on content type
    let chunks;
    if (contentType === 'code') {
      chunks = this.chunkingService.chunkCode(content);
    } else if (contentType === 'pdf') {
      chunks = this.chunkingService.chunkPdf(content);
    } else {
      chunks = this.chunkingService.chunkDocument(content);
    }

    // Index the document with its chunks
    await this.app.useCases.indexDocument.execute({ document, chunks });
  }

  private detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.rb': 'ruby',
      '.php': 'php',
      '.kt': 'kotlin',
      '.swift': 'swift',
      '.md': 'markdown',
      '.mdx': 'markdown',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.json': 'json',
    };

    return languageMap[ext] || null;
  }
}
