import type { OutputFormatter, SearchResult } from '../../domain/ports.js';

export class TextFormatter implements OutputFormatter {
  format(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No results found.';
    }

    const output: string[] = [];
    output.push(`Found ${results.length} result${results.length === 1 ? '' : 's'}:\n`);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result) {
        continue;
      }
      const title = result.title || result.path || result.uri;
      const location = this.formatLocation(result);
      const snippet = this.formatSnippet(result.snippet);

      output.push(`${i + 1}. ${title}`);
      if (location) {
        output.push(`   ${location}`);
      }
      if (snippet) {
        output.push(`   ${snippet}`);
      }
      if (i < results.length - 1) {
        output.push('');
      }
    }

    return output.join('\n');
  }

  private formatLocation(result: SearchResult): string {
    const parts: string[] = [];

    if (result.source) {
      parts.push(result.source);
    }

    if (result.repo) {
      parts.push(result.repo);
    }

    if (result.path) {
      parts.push(result.path);
    }

    return parts.length > 0 ? `📍 ${parts.join(' • ')}` : '';
  }

  private formatSnippet(snippet?: string | null): string {
    if (!snippet) {
      return '';
    }

    const cleaned = snippet.replace(/\s+/g, ' ').trim();
    const truncated = cleaned.length > 200 ? `${cleaned.slice(0, 200)}…` : cleaned;

    return `💭 ${truncated}`;
  }
}
