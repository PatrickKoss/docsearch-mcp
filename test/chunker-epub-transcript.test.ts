import { describe, it, expect } from 'vitest';

import { chunkEpub, chunkTranscript } from '../src/ingest/chunker.js';

describe('chunkEpub', () => {
  it('should create a single chunk for a short chapter', () => {
    const chapters = [{ title: 'Chapter 1', text: 'This is a short chapter.' }];

    const chunks = chunkEpub(chapters);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain('Chapter 1');
    expect(chunks[0]!.content).toContain('This is a short chapter.');
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });

  it('should split long chapters into multiple chunks', () => {
    const longText = Array(200)
      .fill('This is a sentence with enough words to test chunking. ')
      .join('');
    const chapters = [{ title: 'Long Chapter', text: longText }];

    const chunks = chunkEpub(chapters);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.content).toContain('Long Chapter');
  });

  it('should not create chunks for empty chapters', () => {
    const chapters = [
      { title: 'Chapter 1', text: 'Some content here.' },
      { title: 'Chapter 2', text: '' },
      { title: 'Chapter 3', text: '   ' },
      { title: 'Chapter 4', text: 'More content.' },
    ];

    const chunks = chunkEpub(chapters);

    // Only chapters 1 and 4 should produce chunks
    const allContent = chunks.map((c) => c.content).join(' ');
    expect(allContent).toContain('Chapter 1');
    expect(allContent).not.toContain('Chapter 2');
    expect(allContent).not.toContain('Chapter 3');
    expect(allContent).toContain('Chapter 4');
  });

  it('should handle multiple chapters correctly', () => {
    const chapters = [
      { title: 'Intro', text: 'Welcome to the book.' },
      { title: 'Chapter 1', text: 'The story begins here.' },
      { title: 'Epilogue', text: 'The end.' },
    ];

    const chunks = chunkEpub(chapters);

    expect(chunks.length).toBe(3);
    expect(chunks[0]!.content).toContain('Intro');
    expect(chunks[1]!.content).toContain('Chapter 1');
    expect(chunks[2]!.content).toContain('Epilogue');
  });

  it('should handle empty input', () => {
    const chunks = chunkEpub([]);
    expect(chunks).toHaveLength(0);
  });
});

describe('chunkTranscript', () => {
  it('should create a single chunk for a short transcript', () => {
    const segments = [
      { start: 0, end: 5, text: 'Hello world.' },
      { start: 5, end: 10, text: 'This is a test.' },
    ];

    const chunks = chunkTranscript(segments);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain('[00:00:00 - 00:00:10]');
    expect(chunks[0]!.content).toContain('Hello world.');
    expect(chunks[0]!.content).toContain('This is a test.');
  });

  it('should split long transcripts into multiple chunks', () => {
    const segments = [];
    for (let i = 0; i < 100; i++) {
      segments.push({
        start: i * 5,
        end: (i + 1) * 5,
        text: `This is segment number ${i} with some additional content to make it longer.`,
      });
    }

    const chunks = chunkTranscript(segments);

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should have timestamp headers
    for (const chunk of chunks) {
      expect(chunk.content).toMatch(/\[\d{2}:\d{2}:\d{2} - \d{2}:\d{2}:\d{2}\]/);
    }
  });

  it('should preserve timestamps correctly', () => {
    const segments = [
      { start: 3661, end: 3665, text: 'One hour in.' },
      { start: 3665, end: 3670, text: 'Still going.' },
    ];

    const chunks = chunkTranscript(segments);

    expect(chunks[0]!.content).toContain('[01:01:01 - 01:01:10]');
  });

  it('should handle empty segments', () => {
    const chunks = chunkTranscript([]);
    expect(chunks).toHaveLength(0);
  });

  it('should include token counts', () => {
    const segments = [{ start: 0, end: 5, text: 'Hello there.' }];

    const chunks = chunkTranscript(segments);

    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });
});
