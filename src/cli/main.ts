#!/usr/bin/env node

import { Command } from 'commander';

import { ConfigAdapter } from '../application/adapters/config-adapter.js';
import { ApplicationFactory } from '../application/factories/application-factory.js';
import { FormatterFactory } from './adapters/output/formatter-factory.js';

import type { OutputFormat } from './ports.js';
import type { SourceType } from '../domain/entities/document.js';

const program = new Command();

program.name('docsearch').description('Document search and indexing CLI').version('0.1.0');

// Initialize application once at startup
const config = ConfigAdapter.fromEnvironment();
const app = ApplicationFactory.create(config);

// Ingest command
program
  .command('ingest')
  .description('Ingest documents for indexing')
  .argument('[source]', 'Source to ingest (files|confluence|all)', 'all')
  .option('-w, --watch', 'Watch for file changes and re-index')
  .action(async (source: string, options: { watch?: boolean }) => {
    try {
      // Validate source
      if (!['file', 'files', 'confluence', 'all'].includes(source)) {
        console.error(`Invalid source: ${source}. Must be one of: files, confluence, all`);
        process.exit(1);
      }

      // Normalize source name (files -> file)
      const normalizedSource = source === 'files' ? 'file' : source;
      const sources: readonly (SourceType | 'all')[] =
        normalizedSource === 'all' ? ['all'] : [normalizedSource as SourceType];

      console.log(`Starting ingestion for source: ${normalizedSource}`);

      const ingestRequest = options.watch ? { sources, watch: options.watch } : { sources };

      const result = await app.services.documentService.ingestDocuments(ingestRequest);

      if (result.success) {
        console.log(result.message);
      } else {
        console.error(result.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('Ingestion failed:', error);
      process.exit(1);
    }
  });

// Search command
program
  .command('search')
  .description('Search indexed documents')
  .argument('<query>', 'Search query')
  .option('-k, --top-k <number>', 'Number of results to return', '10')
  .option('-s, --source <source>', 'Filter by source (file|confluence)')
  .option('-r, --repo <repo>', 'Filter by repository')
  .option('-p, --path-prefix <prefix>', 'Filter by path prefix')
  .option('-m, --mode <mode>', 'Search mode (auto|vector|keyword)', 'auto')
  .option('-o, --output <format>', 'Output format (text|json|yaml)', 'text')
  .action(
    async (
      query: string,
      options: {
        topK?: string;
        source?: string;
        repo?: string;
        pathPrefix?: string;
        mode?: string;
        output?: string;
      },
    ) => {
      try {
        // Validate options
        const topK = parseInt(options.topK || '10', 10);
        if (isNaN(topK) || topK < 1 || topK > 100) {
          console.error('Invalid top-k value. Must be between 1 and 100.');
          process.exit(1);
        }

        if (options.source && !['file', 'confluence'].includes(options.source)) {
          console.error('Invalid source. Must be file or confluence.');
          process.exit(1);
        }

        if (options.mode && !['auto', 'vector', 'keyword'].includes(options.mode)) {
          console.error('Invalid mode. Must be auto, vector, or keyword.');
          process.exit(1);
        }

        if (options.output && !['text', 'json', 'yaml'].includes(options.output)) {
          console.error('Invalid output format. Must be text, json, or yaml.');
          process.exit(1);
        }

        // Execute search using document service
        const searchResults = await app.services.documentService.searchDocuments({
          query,
          limit: topK,
          mode: (options.mode as 'auto' | 'vector' | 'keyword') || 'auto',
          source: options.source as SourceType | undefined,
          repository: options.repo,
          pathPrefix: options.pathPrefix,
        });

        // Convert domain results to CLI format for formatter
        const cliResults = searchResults.map((result) => ({
          id: result.id,
          title: result.title,
          content: result.content,
          chunk_id: result.chunkId,
          score: result.score,
          document_id: result.documentId,
          source: result.source,
          uri: result.uri,
          repo: result.repo,
          path: result.path,
          start_line: result.startLine,
          end_line: result.endLine,
          snippet: result.snippet,
        }));

        const formatter = FormatterFactory.createFormatter(
          (options.output as OutputFormat) || 'text',
        );
        const output = formatter.format(cliResults);

        console.log(output);
      } catch (error) {
        console.error('Search failed:', error);
        process.exit(1);
      }
    },
  );

// Parse command line arguments
program.parse();
