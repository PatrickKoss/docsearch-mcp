import type { SourceType } from '../entities/document.js';

export type SearchMode = 'auto' | 'vector' | 'keyword';

export interface SearchCriteria {
  readonly query: string;
  readonly limit: number;
  readonly mode: SearchMode;
  readonly source?: SourceType | undefined;
  readonly repository?: string | undefined;
  readonly pathPrefix?: string | undefined;
}

export interface SearchFilters {
  readonly source?: SourceType;
  readonly repository?: string;
  readonly pathPrefix?: string;
}
