import path from 'node:path';

import { ChangeTracker, type ChunkChange } from './change-tracker.js';
import { chunkCode, chunkDoc, chunkPdf } from './chunker.js';
import { sha256 } from './hash.js';
import { Indexer } from './indexer.js';

import type { DatabaseAdapter } from './adapters/index.js';
import type { ChunkInput, DocumentInput } from '../shared/types.js';

export interface IncrementalIndexResult {
  documentId: number;
  chunksAdded: number;
  chunksModified: number;
  chunksDeleted: number;
  totalChunks: number;
  processingTime: number;
}

export class IncrementalIndexer extends Indexer {
  constructor(private readonly incrementalAdapter: DatabaseAdapter) {
    super(incrementalAdapter);
  }

  async indexFileIncremental(
    filePath: string,
    fileContent: string,
    documentMetadata: Omit<DocumentInput, 'hash'>,
  ): Promise<IncrementalIndexResult> {
    const startTime = Date.now();
    const newHash = sha256(fileContent);

    const existingDoc = await this.incrementalAdapter.getDocument(documentMetadata.uri as string);

    if (!existingDoc) {
      return this.indexNewFile(fileContent, newHash, documentMetadata, startTime);
    }

    if (existingDoc.hash === newHash) {
      return {
        documentId: existingDoc.id,
        chunksAdded: 0,
        chunksModified: 0,
        chunksDeleted: 0,
        totalChunks: await this.incrementalAdapter.getChunkCount(existingDoc.id),
        processingTime: Date.now() - startTime,
      };
    }

    const oldContent = await this.getOldContent(documentMetadata.uri as string);
    if (!oldContent) {
      return this.reindexFile(existingDoc.id, fileContent, newHash, documentMetadata, startTime);
    }

    const changedLines = ChangeTracker.detectLineChanges(oldContent, fileContent);
    if (changedLines.length === 0) {
      await this.updateDocumentHash(existingDoc.id, newHash);
      return {
        documentId: existingDoc.id,
        chunksAdded: 0,
        chunksModified: 0,
        chunksDeleted: 0,
        totalChunks: await this.incrementalAdapter.getChunkCount(existingDoc.id),
        processingTime: Date.now() - startTime,
      };
    }

    const existingChunks = await this.incrementalAdapter.getDocumentChunks(existingDoc.id);
    const affectedChunkIds = ChangeTracker.identifyAffectedChunks(changedLines, existingChunks);

    const newChunks = this.chunkContent(fileContent, filePath);
    const chunkChanges = ChangeTracker.computeChunkChanges(
      existingChunks,
      newChunks.map((chunk) => ({
        content: chunk.content,
        startLine: chunk.startLine ?? 0,
        endLine: chunk.endLine ?? 0,
        tokenCount: chunk.tokenCount ?? undefined,
      })),
      affectedChunkIds,
    );

    const result = await this.applyChunkChanges(existingDoc.id, chunkChanges);

    await this.updateDocumentHash(existingDoc.id, newHash);
    await this.storeContent(documentMetadata.uri as string, fileContent);

    return {
      documentId: existingDoc.id,
      chunksAdded: result.added,
      chunksModified: result.modified,
      chunksDeleted: result.deleted,
      totalChunks: await this.incrementalAdapter.getChunkCount(existingDoc.id),
      processingTime: Date.now() - startTime,
    };
  }

  private async indexNewFile(
    content: string,
    hash: string,
    metadata: Omit<DocumentInput, 'hash'>,
    startTime: number,
  ): Promise<IncrementalIndexResult> {
    const docId = await this.upsertDocument({ ...metadata, hash } as DocumentInput);
    const chunks = this.chunkContent(content, (metadata.path as string) || '');
    await this.insertChunks(docId, chunks);
    await this.storeContent(metadata.uri as string, content);

    return {
      documentId: docId,
      chunksAdded: chunks.length,
      chunksModified: 0,
      chunksDeleted: 0,
      totalChunks: chunks.length,
      processingTime: Date.now() - startTime,
    };
  }

  private async reindexFile(
    documentId: number,
    content: string,
    hash: string,
    metadata: Omit<DocumentInput, 'hash'>,
    startTime: number,
  ): Promise<IncrementalIndexResult> {
    await this.incrementalAdapter.deleteDocumentChunks(documentId);

    const chunks = this.chunkContent(content, (metadata.path as string) || '');
    await this.insertChunks(documentId, chunks);
    await this.updateDocumentHash(documentId, hash);
    await this.storeContent(metadata.uri as string, content);

    return {
      documentId,
      chunksAdded: chunks.length,
      chunksModified: 0,
      chunksDeleted: 0,
      totalChunks: chunks.length,
      processingTime: Date.now() - startTime,
    };
  }

  private async applyChunkChanges(
    documentId: number,
    changes: ChunkChange[],
  ): Promise<{ added: number; modified: number; deleted: number }> {
    let added = 0;
    let modified = 0;
    let deleted = 0;

    for (const change of changes) {
      switch (change.type) {
        case 'added':
          if (change.content) {
            await this.incrementalAdapter.insertChunk(
              documentId,
              {
                content: change.content,
                startLine: change.startLine ?? undefined,
                endLine: change.endLine ?? undefined,
                tokenCount: change.tokenCount ?? undefined,
              },
              change.chunkIndex,
            );
            added++;
          }
          break;

        case 'modified':
          if (change.chunkId && change.content) {
            await this.incrementalAdapter.updateChunk(change.chunkId, {
              content: change.content,
              startLine: change.startLine ?? undefined,
              endLine: change.endLine ?? undefined,
              tokenCount: change.tokenCount ?? undefined,
            });
            modified++;
          }
          break;

        case 'deleted':
          if (change.chunkId) {
            await this.incrementalAdapter.deleteChunk(change.chunkId);
            deleted++;
          }
          break;
      }
    }

    return { added, modified, deleted };
  }

  private chunkContent(content: string, filePath: string): ChunkInput[] {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
      return [...chunkPdf(content)];
    }

    const CODE_EXT = new Set([
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.cs',
      '.cpp',
      '.c',
      '.rb',
      '.php',
      '.kt',
      '.swift',
    ]);
    const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc', '.yaml', '.yml', '.json']);

    if (CODE_EXT.has(ext) || !DOC_EXT.has(ext)) {
      return [...chunkCode(content)];
    }

    return [...chunkDoc(content)];
  }

  private async getOldContent(uri: string): Promise<string | null> {
    const contentKey = `content:${uri}`;
    const result = await this.getMeta(contentKey);
    return result ?? null;
  }

  private async storeContent(uri: string, content: string): Promise<void> {
    const contentKey = `content:${uri}`;
    await this.setMeta(contentKey, content);
  }

  private async updateDocumentHash(documentId: number, hash: string): Promise<void> {
    await this.incrementalAdapter.updateDocumentHash(documentId, hash);
  }
}
