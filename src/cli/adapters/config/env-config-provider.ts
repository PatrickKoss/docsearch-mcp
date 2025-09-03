import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

import type { Configuration, ConfigurationProvider } from '../../domain/ports.js';

export interface ConfigOverrides {
  readonly configFile?: string;
  readonly dbPath?: string;
  readonly embedProvider?: 'openai' | 'tei';
  readonly openaiApiKey?: string;
  readonly openaiBaseUrl?: string;
  readonly confluenceBaseUrl?: string;
  readonly confluenceEmail?: string;
  readonly confluenceApiToken?: string;
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
          this.overrides.embedProvider || process.env.EMBEDDINGS_PROVIDER || 'openai',
        ),
        openai: {
          apiKey: this.overrides.openaiApiKey || process.env.OPENAI_API_KEY || '',
          baseUrl: this.overrides.openaiBaseUrl || process.env.OPENAI_BASE_URL || '',
          model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
          dimension: parseInt(process.env.OPENAI_EMBED_DIM || '1536', 10),
        },
        tei: {
          endpoint: process.env.TEI_ENDPOINT || '',
        },
      },
      confluence: {
        baseUrl: this.overrides.confluenceBaseUrl || process.env.CONFLUENCE_BASE_URL || '',
        email: this.overrides.confluenceEmail || process.env.CONFLUENCE_EMAIL || '',
        apiToken: this.overrides.confluenceApiToken || process.env.CONFLUENCE_API_TOKEN || '',
        spaces: this.splitCsv(process.env.CONFLUENCE_SPACES, ''),
      },
      files: {
        roots: this.splitCsv(process.env.FILE_ROOTS, '.'),
        includeGlobs: this.splitCsv(
          process.env.FILE_INCLUDE_GLOBS,
          '**/*.{go,ts,tsx,js,py,rs,java,md,mdx,txt,yaml,yml,json,pdf}',
        ),
        excludeGlobs: this.splitCsv(
          process.env.FILE_EXCLUDE_GLOBS,
          '**/{.git,node_modules,dist,build,target}/**',
        ),
      },
      database: {
        type: this.validateDatabaseType(process.env.DB_TYPE || 'sqlite'),
        path: this.overrides.dbPath || process.env.DB_PATH || './data/index.db',
        connectionString: process.env.POSTGRES_CONNECTION_STRING || '',
      },
    };
  }

  private splitCsv(value: string | undefined, defaultValue: string): readonly string[] {
    const raw = value && value.length ? value : defaultValue;
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
