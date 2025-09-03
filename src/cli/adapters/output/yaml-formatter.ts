import * as yaml from 'js-yaml';

import type { OutputFormatter, SearchResult } from '../../domain/ports.js';

interface YamlOutput {
  readonly results: readonly SearchResult[];
  readonly count: number;
  readonly timestamp: string;
}

export class YamlFormatter implements OutputFormatter {
  format(results: SearchResult[]): string {
    const output: YamlOutput = {
      results,
      count: results.length,
      timestamp: new Date().toISOString(),
    };

    return yaml.dump(output, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
  }
}
