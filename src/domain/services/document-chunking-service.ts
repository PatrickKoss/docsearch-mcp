import type { ChunkEntity } from '../entities/document.js';

export interface ChunkingOptions {
  readonly codeMaxChars?: number;
  readonly codeMinChars?: number;
  readonly docMaxChars?: number;
  readonly docOverlap?: number;
}

export interface DocumentChunkingService {
  chunkCode(
    text: string,
    options?: ChunkingOptions,
  ): readonly Omit<ChunkEntity, 'id' | 'documentId'>[];
  chunkDocument(
    text: string,
    options?: ChunkingOptions,
  ): readonly Omit<ChunkEntity, 'id' | 'documentId'>[];
  chunkPdf(
    text: string,
    options?: ChunkingOptions,
  ): readonly Omit<ChunkEntity, 'id' | 'documentId'>[];
}

export class DefaultDocumentChunkingService implements DocumentChunkingService {
  private static readonly DEFAULT_CODE_MAX_CHARS = 1400;
  private static readonly DEFAULT_CODE_MIN_CHARS = 700;
  private static readonly DEFAULT_DOC_MAX_CHARS = 1200;
  private static readonly DEFAULT_DOC_OVERLAP = 150;

  chunkCode(
    text: string,
    options?: ChunkingOptions,
  ): readonly Omit<ChunkEntity, 'id' | 'documentId'>[] {
    if (!text.trim()) {
      return [];
    }

    const codeMaxChars =
      options?.codeMaxChars ?? DefaultDocumentChunkingService.DEFAULT_CODE_MAX_CHARS;
    const codeMinChars =
      options?.codeMinChars ?? DefaultDocumentChunkingService.DEFAULT_CODE_MIN_CHARS;

    const lines = text.split(/\r?\n/);
    const chunks: Omit<ChunkEntity, 'id' | 'documentId'>[] = [];
    let start = 0;
    let chunkIndex = 0;

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
        if (candidate.length > codeMaxChars && hasContent) {
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
          acc.length >= codeMinChars &&
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
          index: chunkIndex++,
          content: acc,
          startLine: start + 1,
          endLine: end,
          tokenCount: this.approximateTokens(acc),
        });
      }

      // Ensure we always make progress
      start = Math.max(start + 1, end);
    }

    return chunks;
  }

  chunkDocument(
    text: string,
    options?: ChunkingOptions,
  ): readonly Omit<ChunkEntity, 'id' | 'documentId'>[] {
    if (!text.trim()) {
      return [];
    }

    const docMaxChars =
      options?.docMaxChars ?? DefaultDocumentChunkingService.DEFAULT_DOC_MAX_CHARS;
    const docOverlap = options?.docOverlap ?? DefaultDocumentChunkingService.DEFAULT_DOC_OVERLAP;

    const chunks: Omit<ChunkEntity, 'id' | 'documentId'>[] = [];
    let i = 0;
    let chunkIndex = 0;

    while (i < text.length) {
      const end = Math.min(text.length, i + docMaxChars);
      const slice = text.slice(i, end);

      chunks.push({
        index: chunkIndex++,
        content: slice,
        startLine: null,
        endLine: null,
        tokenCount: this.approximateTokens(slice),
      });

      if (end === text.length) {
        break;
      }
      i = Math.max(i + 1, end - docOverlap); // Ensure progress
    }

    return chunks;
  }

  chunkPdf(
    text: string,
    options?: ChunkingOptions,
  ): readonly Omit<ChunkEntity, 'id' | 'documentId'>[] {
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

    return this.chunkDocument(cleanedText, options);
  }

  private approximateTokens(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.round(words * 1.05 + 5);
  }
}
