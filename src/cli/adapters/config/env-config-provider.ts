import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

import type { Configuration, ConfigurationProvider } from '../../domain/ports.js';

export interface ConfigOverrides {
  readonly configFile?: string;
  readonly embeddingsProvider?: string;
  readonly openaiApiKey?: string;
  readonly openaiBaseUrl?: string;
  readonly openaiEmbedModel?: string;
  readonly openaiEmbedDim?: string;
  readonly teiEndpoint?: string;
  readonly confluenceBaseUrl?: string;
  readonly confluenceEmail?: string;
  readonly confluenceApiToken?: string;
  readonly confluenceSpaces?: string;
  readonly fileRoots?: string;
  readonly fileIncludeGlobs?: string;
  readonly fileExcludeGlobs?: string;
  readonly dbType?: string;
  readonly dbPath?: string;
  readonly postgresConnectionString?: string;
}

export class EnvConfigProvider implements ConfigurationProvider {
  constructor(
    private readonly overrides: ConfigOverrides = {},
    private readonly cwd: string = process.cwd(),
  ) {}

  async getConfiguration(): Promise<Configuration> {
    await this.loadEnvFiles();
    return this.buildConfiguration();
  }

  private async loadEnvFiles(): Promise<void> {
    const envFiles = [
      this.overrides.configFile && path.resolve(this.overrides.configFile),
      path.join(this.cwd, '.env.local'),
      path.join(this.cwd, '.env'),
    ].filter(Boolean) as string[];

    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        dotenv.config({ path: envFile });
        break; // Use first found env file
      }
    }
  }

  private buildConfiguration(): Configuration {
    return {
      embeddings: {
        provider: this.validateEmbeddingsProvider(
          this.overrides.embeddingsProvider || process.env.EMBEDDINGS_PROVIDER || 'openai',
        ),
        openai: {
          apiKey: this.overrides.openaiApiKey || process.env.OPENAI_API_KEY || '',
          baseUrl: this.overrides.openaiBaseUrl || process.env.OPENAI_BASE_URL || '',
          model:
            this.overrides.openaiEmbedModel ||
            process.env.OPENAI_EMBED_MODEL ||
            'text-embedding-3-small',
          dimension: parseInt(
            this.overrides.openaiEmbedDim || process.env.OPENAI_EMBED_DIM || '1536',
            10,
          ),
        },
        tei: {
          endpoint: this.overrides.teiEndpoint || process.env.TEI_ENDPOINT || '',
        },
      },
      confluence: {
        baseUrl: this.overrides.confluenceBaseUrl || process.env.CONFLUENCE_BASE_URL || '',
        email: this.overrides.confluenceEmail || process.env.CONFLUENCE_EMAIL || '',
        apiToken: this.overrides.confluenceApiToken || process.env.CONFLUENCE_API_TOKEN || '',
        spaces: this.splitCsv(this.overrides.confluenceSpaces, process.env.CONFLUENCE_SPACES || ''),
      },
      files: {
        roots: this.splitCsvWithDefault(this.overrides.fileRoots, process.env.FILE_ROOTS, '.'),
        includeGlobs: this.splitCsvWithDefault(
          this.overrides.fileIncludeGlobs,
          process.env.FILE_INCLUDE_GLOBS,
          '**/*.{go,ts,tsx,js,py,rs,java,md,mdx,txt,yaml,yml,json,pdf}',
        ),
        excludeGlobs: this.splitCsvWithDefault(
          this.overrides.fileExcludeGlobs,
          process.env.FILE_EXCLUDE_GLOBS,
          '**/{.git,node_modules,dist,build,target}/**',
        ),
      },
      database: {
        type: this.validateDatabaseType(this.overrides.dbType || process.env.DB_TYPE || 'sqlite'),
        path: this.overrides.dbPath || process.env.DB_PATH || './data/index.db',
        connectionString:
          this.overrides.postgresConnectionString || process.env.POSTGRES_CONNECTION_STRING || '',
      },
    };
  }

  private splitCsv(cliValue: string | undefined, envValue: string): readonly string[] {
    const raw = cliValue || envValue;
    if (!raw || raw.length === 0) {
      return [];
    }
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private splitCsvWithDefault(
    cliValue: string | undefined,
    envValue: string | undefined,
    defaultValue: string,
  ): readonly string[] {
    const raw = cliValue || envValue || defaultValue;
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private validateEmbeddingsProvider(provider: string): 'openai' | 'tei' {
    if (provider === 'openai' || provider === 'tei') {
      return provider;
    }
    return 'openai';
  }

  private validateDatabaseType(dbType: string): 'sqlite' | 'postgresql' {
    if (dbType === 'sqlite' || dbType === 'postgresql') {
      return dbType;
    }
    return 'sqlite';
  }
}
