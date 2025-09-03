import { CONFIG } from '../../shared/config/legacy-config.js';

import type { ApplicationConfig } from '../config/application-config.js';
import type { EmbeddingProvider } from '../factories/embedding-factory.js';

export class ConfigAdapter {
  static fromEnvironment(): ApplicationConfig {
    const embeddingProvider: EmbeddingProvider =
      CONFIG.EMBEDDINGS_PROVIDER === 'tei' ? 'tei' : 'openai';

    return {
      database: {
        path: CONFIG.DB_PATH,
        embeddingDimensions: CONFIG.OPENAI_EMBED_DIM,
      },
      embedding: {
        provider: embeddingProvider,
        ...(embeddingProvider === 'openai' && {
          openai: {
            apiKey: CONFIG.OPENAI_API_KEY || '',
            baseUrl: CONFIG.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            model: CONFIG.OPENAI_EMBED_MODEL,
            dimensions: CONFIG.OPENAI_EMBED_DIM,
          },
        }),
        ...(embeddingProvider === 'tei' && {
          tei: {
            endpoint: CONFIG.TEI_ENDPOINT || '',
            dimensions: CONFIG.OPENAI_EMBED_DIM,
          },
        }),
      },
      sources: {
        confluence: {
          baseUrl: CONFIG.CONFLUENCE_BASE_URL || '',
          email: CONFIG.CONFLUENCE_EMAIL || '',
          apiToken: CONFIG.CONFLUENCE_API_TOKEN || '',
          spaces: CONFIG.CONFLUENCE_SPACES,
        },
        files: {
          roots: CONFIG.FILE_ROOTS,
          includeGlobs: CONFIG.FILE_INCLUDE_GLOBS,
          excludeGlobs: CONFIG.FILE_EXCLUDE_GLOBS,
        },
      },
    };
  }
}
