import type { OutputFormatter, SearchResult, Configuration } from '../../domain/ports.js';

export class TextFormatter implements OutputFormatter {
  constructor(private readonly config?: Configuration) {}
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
      const extraMeta = this.formatExtraMetadata(result);
      if (extraMeta) {
        output.push(extraMeta);
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

    // Add Confluence link if available
    if (result.source === 'confluence' && result.extra_json && this.config?.confluence.baseUrl) {
      try {
        const extraData = JSON.parse(result.extra_json);
        if (extraData.webui) {
          const confluenceUrl = `${this.config.confluence.baseUrl.replace(/\/$/, '')}${extraData.webui}`;
          parts.push(confluenceUrl);
        }
      } catch (_error) {
        // Ignore JSON parsing errors
      }
    }

    return parts.length > 0 ? `📍 ${parts.join(' • ')}` : '';
  }

  private formatExtraMetadata(result: SearchResult): string {
    if (!result.extra_json) {
      return '';
    }

    try {
      const extra = JSON.parse(result.extra_json);
      const parts: string[] = [];

      // Audio/video metadata
      if (extra.duration != null) {
        parts.push(`Duration: ${this.formatDuration(extra.duration)}`);
      }
      if (extra.artist) {
        parts.push(`Artist: ${extra.artist}`);
      }
      if (extra.album) {
        parts.push(`Album: ${extra.album}`);
      }

      // Timestamp from chunk content (audio transcript chunks start with [HH:MM:SS - HH:MM:SS])
      if (result.snippet) {
        const tsMatch = result.snippet.match(/^\[(\d{2}:\d{2}:\d{2}) - (\d{2}:\d{2}:\d{2})\]/);
        if (tsMatch) {
          parts.push(`Timestamp: ${tsMatch[1]} - ${tsMatch[2]}`);
        }
      }

      // EPUB chapter info from chunk content
      if (extra.format === 'epub' && extra.chapterCount != null) {
        parts.push(`Chapters: ${extra.chapterCount}`);
      }

      // Office doc metadata
      if (extra.sheetCount != null) {
        parts.push(`Sheets: ${extra.sheetCount}`);
      }
      if (extra.slideCount != null) {
        parts.push(`Slides: ${extra.slideCount}`);
      }
      if (extra.pages != null) {
        parts.push(`Pages: ${extra.pages}`);
      }

      return parts.length > 0 ? `   📎 ${parts.join(' • ')}` : '';
    } catch {
      return '';
    }
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
