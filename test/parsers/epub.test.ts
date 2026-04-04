import { describe, it, expect, vi } from 'vitest';

// Mock epub2
vi.mock('epub2', () => {
  const createMockEpub = (options: {
    metadata?: Record<string, string>;
    flow?: Array<{ id: string; title?: string }>;
    chapters?: Record<string, string>;
  }) => ({
    metadata: options.metadata || {},
    flow: options.flow || [],
    getChapterAsync: vi.fn().mockImplementation((chapterId: string) => {
      const content = options.chapters?.[chapterId];
      if (!content) {
        return Promise.reject(new Error('Chapter not found'));
      }
      return Promise.resolve(content);
    }),
    getChapter: vi.fn(),
  });

  return {
    default: {
      createAsync: vi.fn().mockImplementation((filePath: string) => {
        if (filePath.includes('corrupted')) {
          return Promise.reject(new Error('Invalid EPUB file'));
        }
        if (filePath.includes('no-chapters')) {
          return Promise.resolve(
            createMockEpub({
              metadata: { title: 'Empty Book', creator: 'Author', language: 'en' },
              flow: [],
            }),
          );
        }
        if (filePath.includes('metadata')) {
          return Promise.resolve(
            createMockEpub({
              metadata: { title: 'Great Novel', creator: 'Jane Doe', language: 'en' },
              flow: [
                { id: 'ch1', title: 'Chapter One' },
                { id: 'ch2', title: 'Chapter Two' },
              ],
              chapters: {
                ch1: '<h1>Chapter One</h1><p>The beginning of the story.</p>',
                ch2: '<h1>Chapter Two</h1><p>The plot thickens.</p><p>More content here.</p>',
              },
            }),
          );
        }
        return Promise.resolve(
          createMockEpub({
            metadata: { title: 'Test Book' },
            flow: [
              { id: 'ch1', title: 'Introduction' },
              { id: 'ch2', title: 'Main Content' },
              { id: 'ch3' }, // No title
            ],
            chapters: {
              ch1: '<p>Welcome to the book.</p>',
              ch2: '<h2>Section 1</h2><p>Important text.</p><br/><p>More text.</p>',
              ch3: '<p>Final thoughts.</p>',
            },
          }),
        );
      }),
    },
    EPub: {
      createAsync: vi.fn().mockImplementation((filePath: string) => {
        if (filePath.includes('corrupted')) {
          return Promise.reject(new Error('Invalid EPUB file'));
        }
        if (filePath.includes('no-chapters')) {
          return Promise.resolve(
            createMockEpub({
              metadata: { title: 'Empty Book', creator: 'Author', language: 'en' },
              flow: [],
            }),
          );
        }
        if (filePath.includes('metadata')) {
          return Promise.resolve(
            createMockEpub({
              metadata: { title: 'Great Novel', creator: 'Jane Doe', language: 'en' },
              flow: [
                { id: 'ch1', title: 'Chapter One' },
                { id: 'ch2', title: 'Chapter Two' },
              ],
              chapters: {
                ch1: '<h1>Chapter One</h1><p>The beginning of the story.</p>',
                ch2: '<h1>Chapter Two</h1><p>The plot thickens.</p><p>More content here.</p>',
              },
            }),
          );
        }
        return Promise.resolve(
          createMockEpub({
            metadata: { title: 'Test Book' },
            flow: [
              { id: 'ch1', title: 'Introduction' },
              { id: 'ch2', title: 'Main Content' },
              { id: 'ch3' },
            ],
            chapters: {
              ch1: '<p>Welcome to the book.</p>',
              ch2: '<h2>Section 1</h2><p>Important text.</p><br/><p>More text.</p>',
              ch3: '<p>Final thoughts.</p>',
            },
          }),
        );
      }),
    },
  };
});

import { parseEpub } from '../../src/ingest/parsers/epub.js';

describe('EPUB Parsing', () => {
  describe('parseEpub', () => {
    it('should extract chapters and metadata', async () => {
      const result = await parseEpub('/fake/test.epub');

      expect(result.chapters.length).toBe(3);
      expect(result.chapters[0]!.title).toBe('Introduction');
      expect(result.chapters[0]!.text).toContain('Welcome to the book');
      expect(result.chapters[1]!.title).toBe('Main Content');
      expect(result.chapters[1]!.text).toContain('Important text');
      expect(result.chapters[2]!.title).toBe('Chapter 3'); // Auto-generated title
      expect(result.metadata.format).toBe('epub');
      expect(result.metadata.title).toBe('Test Book');
      expect(result.metadata.chapterCount).toBe(3);
    });

    it('should extract full metadata', async () => {
      const result = await parseEpub('/fake/metadata.epub');

      expect(result.metadata.title).toBe('Great Novel');
      expect(result.metadata.author).toBe('Jane Doe');
      expect(result.metadata.language).toBe('en');
      expect(result.chapters.length).toBe(2);
    });

    it('should strip HTML tags from chapter content', async () => {
      const result = await parseEpub('/fake/metadata.epub');

      const ch1Text = result.chapters[0]!.text;
      expect(ch1Text).not.toContain('<h1>');
      expect(ch1Text).not.toContain('</p>');
      expect(ch1Text).toContain('Chapter One');
      expect(ch1Text).toContain('The beginning of the story');
    });

    it('should handle corrupted EPUB files', async () => {
      await expect(parseEpub('/fake/corrupted.epub')).rejects.toThrow('Invalid EPUB file');
    });

    it('should handle EPUB with no chapters', async () => {
      const result = await parseEpub('/fake/no-chapters.epub');

      expect(result.chapters.length).toBe(0);
      expect(result.metadata.chapterCount).toBe(0);
      expect(result.metadata.title).toBe('Empty Book');
    });
  });
});
