// CLI-specific ports and interfaces
import type { SourceType } from '../domain/entities/document.js';

export interface SearchResult {
  readonly id: number;
  readonly title: string;
  readonly content: string;
  readonly chunk_id: number;
  readonly score: number;
  readonly document_id: number;
  readonly source: SourceType;
  readonly uri: string;
  readonly repo: string | null;
  readonly path: string | null;
  readonly start_line: number | null;
  readonly end_line: number | null;
  readonly snippet: string;
}

export type OutputFormat = 'text' | 'json' | 'yaml';

export interface OutputFormatter {
  format(data: SearchResult[]): string;
}

export interface ConfigurationProvider {
  getConfiguration(): Promise<Configuration>;
}

export interface Configuration {
  readonly embeddings: {
    readonly provider: 'openai' | 'tei';
    readonly openai: {
      readonly apiKey: string;
      readonly baseUrl: string;
      readonly model: string;
      readonly dimension: number;
    };
    readonly tei: {
      readonly endpoint: string;
    };
  };
  readonly confluence: {
    readonly baseUrl: string;
    readonly email: string;
    readonly apiToken: string;
    readonly spaces: readonly string[];
  };
  readonly files: {
    readonly roots: readonly string[];
    readonly includeGlobs: readonly string[];
    readonly excludeGlobs: readonly string[];
  };
  readonly database: {
    readonly type: 'sqlite' | 'postgresql';
    readonly path: string;
    readonly connectionString: string;
  };
}
