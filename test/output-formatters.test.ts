import { describe, it, expect } from 'vitest';

import { JsonFormatter } from '../src/cli/adapters/output/json-formatter.js';
import { TextFormatter } from '../src/cli/adapters/output/text-formatter.js';
import { YamlFormatter } from '../src/cli/adapters/output/yaml-formatter.js';

import type { SearchResult } from '../src/cli/domain/ports.js';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 1,
    title: 'Test Doc',
    content: 'test content',
    chunk_id: 1,
    score: 0.95,
    document_id: 1,
    source: 'file',
    uri: 'file:///test/doc.txt',
    repo: null,
    path: 'test/doc.txt',
    start_line: null,
    end_line: null,
    snippet: 'This is a test snippet.',
    extra_json: null,
    ...overrides,
  };
}

describe('TextFormatter with format metadata', () => {
  const formatter = new TextFormatter();

  it('should display audio duration and artist metadata', () => {
    const result = makeResult({
      title: 'Song.mp3',
      extra_json: JSON.stringify({
        duration: 245,
        artist: 'Test Artist',
        album: 'Test Album',
        isAudio: true,
      }),
    });

    const output = formatter.format([result]);

    expect(output).toContain('Duration: 00:04:05');
    expect(output).toContain('Artist: Test Artist');
    expect(output).toContain('Album: Test Album');
  });

  it('should display sheet count for XLSX', () => {
    const result = makeResult({
      title: 'data.xlsx',
      extra_json: JSON.stringify({
        format: 'xlsx',
        sheetCount: 3,
        totalRows: 150,
      }),
    });

    const output = formatter.format([result]);

    expect(output).toContain('Sheets: 3');
  });

  it('should display slide count for PPTX', () => {
    const result = makeResult({
      title: 'slides.pptx',
      extra_json: JSON.stringify({
        format: 'pptx',
        slideCount: 15,
      }),
    });

    const output = formatter.format([result]);

    expect(output).toContain('Slides: 15');
  });

  it('should display chapter count for EPUB', () => {
    const result = makeResult({
      title: 'book.epub',
      extra_json: JSON.stringify({
        format: 'epub',
        chapterCount: 12,
        title: 'A Great Book',
      }),
    });

    const output = formatter.format([result]);

    expect(output).toContain('Chapters: 12');
  });

  it('should display timestamp from audio transcript snippet', () => {
    const result = makeResult({
      title: 'podcast.mp3',
      snippet: '[00:02:30 - 00:03:15]\nSome transcribed text about technology.',
      extra_json: JSON.stringify({ duration: 2700, isAudio: true }),
    });

    const output = formatter.format([result]);

    expect(output).toContain('Timestamp: 00:02:30 - 00:03:15');
    expect(output).toContain('Duration: 00:45:00');
  });

  it('should handle results without extra metadata', () => {
    const result = makeResult();

    const output = formatter.format([result]);

    expect(output).toContain('Test Doc');
    expect(output).not.toContain('📎');
  });

  it('should handle invalid extra_json gracefully', () => {
    const result = makeResult({ extra_json: 'not-json' });

    const output = formatter.format([result]);

    expect(output).toContain('Test Doc');
    expect(output).not.toContain('📎');
  });
});

describe('JsonFormatter with format metadata', () => {
  const formatter = new JsonFormatter();

  it('should include extra_json in output', () => {
    const result = makeResult({
      extra_json: JSON.stringify({ format: 'xlsx', sheetCount: 3 }),
    });

    const output = formatter.format([result]);
    const parsed = JSON.parse(output);

    expect(parsed.results[0].extra_json).toBeTruthy();
    const extra = JSON.parse(parsed.results[0].extra_json);
    expect(extra.sheetCount).toBe(3);
  });
});

describe('YamlFormatter with format metadata', () => {
  const formatter = new YamlFormatter();

  it('should include extra_json in output', () => {
    const result = makeResult({
      extra_json: JSON.stringify({ format: 'epub', chapterCount: 5 }),
    });

    const output = formatter.format([result]);

    expect(output).toContain('extra_json');
    expect(output).toContain('chapterCount');
  });
});
