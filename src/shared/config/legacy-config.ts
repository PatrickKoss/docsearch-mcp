// Legacy configuration for the old ingest system
// TODO: This should be removed once the legacy ingest system is fully migrated
import 'dotenv/config';

type EmbeddingsProvider = 'openai' | 'tei';
type DatabaseType = 'sqlite' | 'postgresql';

interface LegacyAppConfig {
  readonly EMBEDDINGS_PROVIDER: EmbeddingsProvider;
  readonly OPENAI_API_KEY: string;
  readonly OPENAI_BASE_URL: string;
  readonly OPENAI_EMBED_MODEL: string;
  readonly OPENAI_EMBED_DIM: number;
  readonly TEI_ENDPOINT: string;

  readonly CONFLUENCE_BASE_URL: string;
  readonly CONFLUENCE_EMAIL: string;
  readonly CONFLUENCE_API_TOKEN: string;
  readonly CONFLUENCE_SPACES: readonly string[];

  readonly FILE_ROOTS: readonly string[];
  readonly FILE_INCLUDE_GLOBS: readonly string[];
  readonly FILE_EXCLUDE_GLOBS: readonly string[];

  readonly DB_TYPE: DatabaseType;
  readonly DB_PATH: string;
  readonly POSTGRES_CONNECTION_STRING: string;
}

function splitCsv(v: string | undefined, def: string): readonly string[] {
  const raw = v && v.length ? v : def;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateEmbeddingsProvider(provider: string): EmbeddingsProvider {
  if (provider === 'openai' || provider === 'tei') {
    return provider;
  }
  return 'openai';
}

function validateDatabaseType(dbType: string): DatabaseType {
  if (dbType === 'sqlite' || dbType === 'postgresql') {
    return dbType;
  }
  return 'sqlite';
}

export const LEGACY_CONFIG: LegacyAppConfig = {
  EMBEDDINGS_PROVIDER: validateEmbeddingsProvider(process.env.EMBEDDINGS_PROVIDER || 'openai'),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '',
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  OPENAI_EMBED_DIM: parseInt(process.env.OPENAI_EMBED_DIM || '1536', 10),
  TEI_ENDPOINT: process.env.TEI_ENDPOINT || '',

  CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL || '',
  CONFLUENCE_EMAIL: process.env.CONFLUENCE_EMAIL || '',
  CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN || '',
  CONFLUENCE_SPACES: splitCsv(process.env.CONFLUENCE_SPACES, ''),

  FILE_ROOTS: splitCsv(process.env.FILE_ROOTS, '.'),
  FILE_INCLUDE_GLOBS: splitCsv(
    process.env.FILE_INCLUDE_GLOBS,
    '**/*.{go,ts,tsx,js,py,rs,java,md,mdx,txt,yaml,yml,json,pdf}',
  ),
  FILE_EXCLUDE_GLOBS: splitCsv(
    process.env.FILE_EXCLUDE_GLOBS,
    '**/{.git,node_modules,dist,build,target}/**',
  ),

  DB_TYPE: validateDatabaseType(process.env.DB_TYPE || 'sqlite'),
  DB_PATH: process.env.DB_PATH || './data/index.db',
  POSTGRES_CONNECTION_STRING: process.env.POSTGRES_CONNECTION_STRING || '',
} as const;

// Legacy export for backward compatibility
export { LEGACY_CONFIG as CONFIG };
