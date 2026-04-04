export interface Chunk {
  readonly content: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly tokenCount?: number;
}

const CODE_MAX_CHARS = 1400;
const CODE_MIN_CHARS = 700;
const DOC_MAX_CHARS = 1200;
const DOC_OVERLAP = 150;

export function chunkCode(text: string): readonly Chunk[] {
  if (!text.trim()) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < lines.length) {
    let end = start;
    let acc = '';
    let hasContent = false;

    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) {
        continue; // Should never happen, but satisfies TypeScript
      }

      const candidate = hasContent ? `${acc}\n${line}` : line;

      // Check if adding this line would exceed the limit
      if (candidate.length > CODE_MAX_CHARS && hasContent) {
        break;
      }

      // Add the line to accumulator
      acc = candidate;
      end = i + 1;

      // Track if we have any non-empty content
      if (line.trim()) {
        hasContent = true;
      }

      // Check if we should break at a natural boundary
      if (
        hasContent &&
        acc.length >= CODE_MIN_CHARS &&
        (line.trim() === '' || /\}\s*$/.test(line))
      ) {
        break;
      }
    }

    // Handle case where we couldn't fit any content
    if (!hasContent && start < lines.length) {
      // Take at least one line, even if it's too long
      acc = lines[start] ?? '';
      end = start + 1;
      hasContent = true;
    }

    // Add chunk if we have content
    if (hasContent && acc.trim()) {
      chunks.push({
        content: acc,
        startLine: start + 1,
        endLine: end,
        tokenCount: approxTokens(acc),
      });
    }

    // Ensure we always make progress
    start = Math.max(start + 1, end);
  }

  return chunks;
}

export function chunkDoc(text: string): readonly Chunk[] {
  if (!text.trim()) {
    return [];
  }

  const chunks: Chunk[] = [];
  let i = 0;

  while (i < text.length) {
    const end = Math.min(text.length, i + DOC_MAX_CHARS);
    const slice = text.slice(i, end);

    chunks.push({
      content: slice,
      tokenCount: approxTokens(slice),
    });

    if (end === text.length) {
      break;
    }
    i = Math.max(i + 1, end - DOC_OVERLAP); // Ensure progress
  }

  return chunks;
}

export function chunkPdf(text: string): readonly Chunk[] {
  if (!text.trim()) {
    return [];
  }

  // Clean up PDF text: normalize whitespace, remove excessive line breaks
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return chunkDoc(cleanedText);
}

export interface EpubChapterInput {
  readonly title: string;
  readonly text: string;
}

export function chunkEpub(chapters: readonly EpubChapterInput[]): readonly Chunk[] {
  const chunks: Chunk[] = [];

  for (const chapter of chapters) {
    if (!chapter.text.trim()) {
      continue;
    }

    if (chapter.text.length <= DOC_MAX_CHARS) {
      chunks.push({
        content: `${chapter.title}\n\n${chapter.text}`,
        tokenCount: approxTokens(chapter.text),
      });
    } else {
      // Split long chapters using chunkDoc, prefix first chunk with title
      const subChunks = chunkDoc(chapter.text);
      for (let i = 0; i < subChunks.length; i++) {
        const sub = subChunks[i];
        if (!sub) {
          continue;
        }
        const content = i === 0 ? `${chapter.title}\n\n${sub.content}` : sub.content;
        chunks.push({
          content,
          tokenCount: approxTokens(content),
        });
      }
    }
  }

  return chunks;
}

export interface TranscriptSegmentInput {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function chunkTranscript(segments: readonly TranscriptSegmentInput[]): readonly Chunk[] {
  if (segments.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let currentText = '';
  const firstSegment = segments[0];
  let currentStart = firstSegment ? firstSegment.start : 0;
  let currentEnd = firstSegment ? firstSegment.start : 0;

  for (const segment of segments) {
    const candidate = currentText ? `${currentText} ${segment.text}` : segment.text;

    if (candidate.length > DOC_MAX_CHARS && currentText) {
      chunks.push({
        content: `[${formatTimestamp(currentStart)} - ${formatTimestamp(currentEnd)}]\n${currentText}`,
        tokenCount: approxTokens(currentText),
      });
      currentText = segment.text;
      currentStart = segment.start;
      currentEnd = segment.end;
    } else {
      currentText = candidate;
      currentEnd = segment.end;
    }
  }

  if (currentText.trim()) {
    chunks.push({
      content: `[${formatTimestamp(currentStart)} - ${formatTimestamp(currentEnd)}]\n${currentText}`,
      tokenCount: approxTokens(currentText),
    });
  }

  return chunks;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function approxTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(words * 1.05 + 5);
}
