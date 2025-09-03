import { OpenAIEmbeddingService, type OpenAIConfig } from '../services/openai-embedding-service.js';
import { TEIEmbeddingService, type TEIConfig } from '../services/tei-embedding-service.js';

import type { EmbeddingService } from '../../domain/ports/embedding-service.js';

export type EmbeddingProvider = 'openai' | 'tei';

export interface EmbeddingFactoryConfig {
  readonly provider: EmbeddingProvider;
  readonly openai?: OpenAIConfig;
  readonly tei?: TEIConfig;
}

export class EmbeddingFactory {
  static create(config: EmbeddingFactoryConfig): EmbeddingService {
    switch (config.provider) {
      case 'openai':
        if (!config.openai) {
          throw new Error('OpenAI configuration is required when using OpenAI provider');
        }
        return new OpenAIEmbeddingService(config.openai);

      case 'tei':
        if (!config.tei) {
          throw new Error('TEI configuration is required when using TEI provider');
        }
        return new TEIEmbeddingService(config.tei);

      default:
        throw new Error(`Unsupported embedding provider: ${config.provider}`);
    }
  }
}
