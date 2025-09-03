import chokidar from 'chokidar';

import { getDatabase, closeDatabase } from '../../../ingest/database.js';
import { Indexer } from '../../../ingest/indexer.js';
import { performSearch } from '../../../ingest/search.js';
import { ingestConfluence } from '../../../ingest/sources/confluence.js';
import { ingestFiles } from '../../../ingest/sources/files.js';

import type { DatabaseAdapter } from '../../../ingest/adapters/index.js';
import type { SourceType } from '../../../shared/types.js';
import type {
  DocumentService,
  IngestCommand,
  SearchCommand,
  SearchResult,
} from '../../domain/ports.js';

export class DocumentServiceAdapter implements DocumentService {
  private adapter: DatabaseAdapter | null = null;

  async ingest(command: IngestCommand): Promise<void> {
    const adapter = await this.getAdapter();
    const indexer = new Indexer(adapter);

    try {
      if (command.watch) {
        await this.startWatching(adapter, indexer);
      } else {
        await this.performIngest(command.source, adapter, indexer);
      }
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  async search(command: SearchCommand): Promise<SearchResult[]> {
    const adapter = await this.getAdapter();

    try {
      const searchParams = {
        query: command.query,
        topK: command.topK ?? 8,
        ...(command.source && { source: command.source }),
        ...(command.repo && { repo: command.repo }),
        ...(command.pathPrefix && { pathPrefix: command.pathPrefix }),
        ...(command.mode && { mode: command.mode }),
      };

      const results = await performSearch(adapter, searchParams);

      return results.map((result) => ({
        ...result,
        id: result.chunk_id,
        title: result.title || result.path || result.uri,
        content: result.snippet || '',
        source: result.source as SourceType,
      }));
    } finally {
      await this.cleanup();
    }
  }

  private async getAdapter(): Promise<DatabaseAdapter> {
    if (!this.adapter) {
      this.adapter = await getDatabase();
    }
    return this.adapter;
  }

  private async cleanup(): Promise<void> {
    if (this.adapter) {
      await closeDatabase();
      this.adapter = null;
    }
  }

  private async performIngest(
    source: 'file' | 'confluence' | 'all',
    adapter: DatabaseAdapter,
    indexer: Indexer,
  ): Promise<void> {
    if (source === 'file' || source === 'all') {
      console.log('Ingesting files...');
      await ingestFiles(adapter);
      await indexer.embedNewChunks();
      console.log('Files ingested.');
    }

    if (source === 'confluence' || source === 'all') {
      console.log('Ingesting Confluence...');
      await ingestConfluence(adapter);
      await indexer.embedNewChunks();
      console.log('Confluence ingested.');
    }
  }

  private async startWatching(adapter: DatabaseAdapter, indexer: Indexer): Promise<void> {
    console.log('Watching for changes...');

    const watcher = chokidar.watch(process.cwd(), {
      ignored: /(^|[/])\.(git|hg)|node_modules|dist|build|target/,
      ignoreInitial: true,
    });

    // Initial ingest
    await this.performIngest('file', adapter, indexer);

    watcher.on('all', async (event, path) => {
      try {
        const fs = await import('fs');
        if (!fs.existsSync(path) || fs.statSync(path).isDirectory()) {
          return;
        }
        await ingestFiles(adapter);
        await indexer.embedNewChunks();
        console.log('Re-indexed after change:', event, path);
      } catch (error) {
        console.error('Watch error:', error);
      }
    });

    // Keep the process alive
    return new Promise(() => {
      // This promise never resolves, keeping the watcher running
    });
  }
}
