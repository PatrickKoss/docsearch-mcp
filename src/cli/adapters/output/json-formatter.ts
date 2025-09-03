import type { OutputFormatter, SearchResult } from '../../domain/ports.js';

interface JsonOutput {
  readonly results: readonly SearchResult[];
  readonly count: number;
  readonly timestamp: string;
}

export class JsonFormatter implements OutputFormatter {
  format(results: SearchResult[]): string {
    const output: JsonOutput = {
      results,
      count: results.length,
      timestamp: new Date().toISOString(),
    };

    return JSON.stringify(output, null, 2);
  }
}
