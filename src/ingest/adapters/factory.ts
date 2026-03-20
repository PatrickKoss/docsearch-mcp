import { PostgresAdapter, type PostgresConfig } from './postgresql.js';
import { SqliteAdapter, type SqliteConfig } from './sqlite.js';
import { VectorChordAdapter, type VectorChordConfig } from './vectorchord.js';
import { CONFIG } from '../../shared/config.js';

import type { DatabaseAdapter } from './types.js';

export type DatabaseType = 'sqlite' | 'postgresql' | 'vectorchord';

export interface DatabaseFactoryConfig {
  type: DatabaseType;
  sqlite?: SqliteConfig;
  postgresql?: PostgresConfig;
  vectorchord?: VectorChordConfig;
}

export function createDatabaseAdapter(config?: Partial<DatabaseFactoryConfig>): DatabaseAdapter {
  const dbType = config?.type ?? CONFIG.DB_TYPE;

  switch (dbType) {
    case 'sqlite': {
      const sqliteConfig: SqliteConfig = {
        path: config?.sqlite?.path ?? CONFIG.DB_PATH,
        embeddingDim: config?.sqlite?.embeddingDim ?? CONFIG.OPENAI_EMBED_DIM,
      };
      return new SqliteAdapter(sqliteConfig);
    }

    case 'postgresql': {
      const postgresConfig: PostgresConfig = {
        connectionString: config?.postgresql?.connectionString ?? CONFIG.POSTGRES_CONNECTION_STRING,
        embeddingDim: config?.postgresql?.embeddingDim ?? CONFIG.OPENAI_EMBED_DIM,
      };
      return new PostgresAdapter(postgresConfig);
    }

    case 'vectorchord': {
      const vectorchordConfig: VectorChordConfig = config?.vectorchord ?? {
        connectionString: CONFIG.POSTGRES_CONNECTION_STRING,
        embeddingDim: CONFIG.OPENAI_EMBED_DIM,
        residualQuantization: CONFIG.VECTORCHORD_RESIDUAL_QUANTIZATION,
        lists: CONFIG.VECTORCHORD_LISTS,
        sphericalCentroids: CONFIG.VECTORCHORD_SPHERICAL_CENTROIDS,
        buildThreads: CONFIG.VECTORCHORD_BUILD_THREADS,
        probes: CONFIG.VECTORCHORD_PROBES,
      };
      return new VectorChordAdapter(vectorchordConfig);
    }

    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}
