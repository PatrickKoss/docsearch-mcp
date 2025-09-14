#!/usr/bin/env node

// Load environment variables early, before any other imports that might depend on them
import { readFileSync, existsSync } from 'fs';
import path from 'path';

import { Command } from 'commander';
import dotenv from 'dotenv';

// Get config file path from command line arguments
const configArgIndex = process.argv.findIndex((arg) => arg === '-c' || arg === '--config');
if (configArgIndex !== -1 && configArgIndex + 1 < process.argv.length) {
  const configPath = process.argv[configArgIndex + 1];
  if (configPath) {
    const resolvedPath = path.resolve(configPath);
    if (existsSync(resolvedPath)) {
      dotenv.config({ path: resolvedPath });
    }
  }
}

import { EnvConfigProvider } from './adapters/config/env-config-provider.js';
import { DocumentServiceAdapter } from './adapters/document/document-service.js';
import { FormatterFactory } from './adapters/output/formatter-factory.js';

import type { ConfigOverrides } from './adapters/config/env-config-provider.js';
import type { IngestCommand, OutputFormat, SearchCommand } from './domain/ports.js';

const program = new Command();

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

program
  .name('docsearch')
  .description('Document search and indexing CLI')
  .version(packageJson.version);

// Global options
program
  .option('-c, --config <file>', 'Configuration file path')
  .option('--embeddings-provider <provider>', 'Embeddings provider (openai|tei)')
  .option('--openai-api-key <key>', 'OpenAI API key')
  .option('--openai-base-url <url>', 'OpenAI base URL')
  .option('--openai-embed-model <model>', 'OpenAI embedding model')
  .option('--openai-embed-dim <dimension>', 'OpenAI embedding dimension')
  .option('--tei-endpoint <url>', 'TEI endpoint URL')
  .option('--enable-image-to-text', 'Enable image-to-text processing')
  .option('--image-to-text-provider <provider>', 'Image-to-text provider (openai)')
  .option('--image-to-text-model <model>', 'Image-to-text model')
  .option('--confluence-base-url <url>', 'Confluence base URL')
  .option('--confluence-email <email>', 'Confluence email')
  .option('--confluence-api-token <token>', 'Confluence API token')
  .option('--confluence-spaces <spaces>', 'Confluence spaces (comma-separated)')
  .option('--file-roots <roots>', 'File roots (comma-separated)')
  .option('--file-include-globs <globs>', 'File include globs (comma-separated)')
  .option('--file-exclude-globs <globs>', 'File exclude globs (comma-separated)')
  .option('--db-type <type>', 'Database type (sqlite|postgresql)')
  .option('--db-path <path>', 'SQLite database path')
  .option('--postgres-connection-string <string>', 'PostgreSQL connection string');

// Ingest command
program
  .command('ingest')
  .description('Ingest documents for indexing')
  .argument('[source]', 'Source to ingest (files|confluence|all)', 'all')
  .option('-w, --watch', 'Watch for file changes and re-index')
  .action(async (source: string, options: { watch?: boolean }, cmd: Command) => {
    const globalOpts = cmd.parent?.opts() || {};
    const configOverrides: ConfigOverrides = {
      configFile: globalOpts.config,
      embeddingsProvider: globalOpts.embeddingsProvider,
      openaiApiKey: globalOpts.openaiApiKey,
      openaiBaseUrl: globalOpts.openaiBaseUrl,
      openaiEmbedModel: globalOpts.openaiEmbedModel,
      openaiEmbedDim: globalOpts.openaiEmbedDim,
      teiEndpoint: globalOpts.teiEndpoint,
      confluenceBaseUrl: globalOpts.confluenceBaseUrl,
      confluenceEmail: globalOpts.confluenceEmail,
      confluenceApiToken: globalOpts.confluenceApiToken,
      confluenceSpaces: globalOpts.confluenceSpaces,
      fileRoots: globalOpts.fileRoots,
      fileIncludeGlobs: globalOpts.fileIncludeGlobs,
      fileExcludeGlobs: globalOpts.fileExcludeGlobs,
      dbType: globalOpts.dbType,
      dbPath: globalOpts.dbPath,
      postgresConnectionString: globalOpts.postgresConnectionString,
    };

    try {
      // Initialize configuration
      const configProvider = new EnvConfigProvider(configOverrides);
      await configProvider.getConfiguration(); // Load configuration

      // Validate source
      if (!['file', 'files', 'confluence', 'all'].includes(source)) {
        console.error(`Invalid source: ${source}. Must be one of: files, confluence, all`);
        process.exit(1);
      }

      // Normalize source name
      const normalizedSource = source === 'files' ? 'file' : source;

      const ingestCommand: IngestCommand = {
        source: normalizedSource as 'file' | 'confluence' | 'all',
        watch: options.watch ?? false,
      };

      const documentService = new DocumentServiceAdapter();
      await documentService.ingest(ingestCommand);
      console.log('Ingestion completed successfully');

      // Explicit exit to avoid hanging in test environments
      if (process.env.NODE_ENV === 'test') {
        process.exit(0);
      }
    } catch (error) {
      console.error('Ingestion failed:', error);
      process.exit(1);
    }
  });

// Start MCP server command
program
  .command('start')
  .description('Start the MCP server')
  .action(async () => {
    try {
      // Import and start the MCP server
      const { startServer } = await import('../server/mcp.js');
      await startServer();
    } catch (error) {
      console.error('Failed to start MCP server:', error);
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
  .option('--include-images', 'Include images in search results')
  .option('--images-only', 'Search only images')
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
        includeImages?: boolean;
        imagesOnly?: boolean;
      },
      cmd: Command,
    ) => {
      const globalOpts = cmd.parent?.opts() || {};
      const configOverrides: ConfigOverrides = {
        configFile: globalOpts.config,
        embeddingsProvider: globalOpts.embeddingsProvider,
        openaiApiKey: globalOpts.openaiApiKey,
        openaiBaseUrl: globalOpts.openaiBaseUrl,
        openaiEmbedModel: globalOpts.openaiEmbedModel,
        openaiEmbedDim: globalOpts.openaiEmbedDim,
        teiEndpoint: globalOpts.teiEndpoint,
        confluenceBaseUrl: globalOpts.confluenceBaseUrl,
        confluenceEmail: globalOpts.confluenceEmail,
        confluenceApiToken: globalOpts.confluenceApiToken,
        confluenceSpaces: globalOpts.confluenceSpaces,
        fileRoots: globalOpts.fileRoots,
        fileIncludeGlobs: globalOpts.fileIncludeGlobs,
        fileExcludeGlobs: globalOpts.fileExcludeGlobs,
        dbType: globalOpts.dbType,
        dbPath: globalOpts.dbPath,
        postgresConnectionString: globalOpts.postgresConnectionString,
      };

      try {
        // Initialize configuration
        const configProvider = new EnvConfigProvider(configOverrides);
        const configuration = await configProvider.getConfiguration(); // Load configuration

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

        const searchCommand: SearchCommand = {
          query,
          topK,
          source: options.source as 'file' | 'confluence' | undefined,
          repo: options.repo,
          pathPrefix: options.pathPrefix,
          mode: options.mode as 'auto' | 'vector' | 'keyword' | undefined,
          output: options.output as OutputFormat | undefined,
          includeImages: options.includeImages,
          imagesOnly: options.imagesOnly,
        };

        const documentService = new DocumentServiceAdapter();
        const results = await documentService.search(searchCommand);

        const formatter = FormatterFactory.createFormatter(
          searchCommand.output || 'text',
          configuration,
        );
        const output = formatter.format(results);

        console.log(output);

        // Explicit exit to avoid hanging in test environments
        if (process.env.NODE_ENV === 'test') {
          process.exit(0);
        }
      } catch (error) {
        console.error('Search failed:', error);
        process.exit(1);
      }
    },
  );

// Parse command line arguments
program.parse();
