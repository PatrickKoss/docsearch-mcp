import type { EmbeddingProvider } from '../factories/embedding-factory.js';

export interface DatabaseConfig {
  readonly path: string;
  readonly embeddingDimensions: number;
}

export interface OpenAIConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly dimensions: number;
}

export interface TEIConfig {
  readonly endpoint: string;
  readonly dimensions: number;
}

export interface EmbeddingConfig {
  readonly provider: EmbeddingProvider;
  readonly openai?: OpenAIConfig;
  readonly tei?: TEIConfig;
}

export interface ConfluenceConfig {
  readonly baseUrl: string;
  readonly email: string;
  readonly apiToken: string;
  readonly spaces: readonly string[];
}

export interface FileConfig {
  readonly roots: readonly string[];
  readonly includeGlobs: readonly string[];
  readonly excludeGlobs: readonly string[];
}

export interface SourceConfig {
  readonly confluence: ConfluenceConfig;
  readonly files: FileConfig;
}

export interface ApplicationConfig {
  readonly database: DatabaseConfig;
  readonly embedding: EmbeddingConfig;
  readonly sources: SourceConfig;
}
