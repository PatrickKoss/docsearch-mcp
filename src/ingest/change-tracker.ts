import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export interface FileChange {
  type: 'added' | 'modified' | 'deleted';
  path: string;
  oldHash?: string;
  newHash?: string;
  changedLines?: LineRange[];
}

export interface LineRange {
  start: number;
  end: number;
}

export interface ChunkChange {
  chunkId?: number;
  chunkIndex: number;
  type: 'added' | 'modified' | 'deleted';
  content?: string;
  startLine?: number | undefined;
  endLine?: number | undefined;
  tokenCount?: number | undefined;
}

export class ChangeTracker {
  static async getFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  static getContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  static detectLineChanges(oldContent: string, newContent: string): LineRange[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const changes: LineRange[] = [];

    const lcs = this.longestCommonSubsequence(oldLines, newLines);
    let oldIdx = 0;
    let newIdx = 0;
    let lcsIdx = 0;

    const addedRanges: number[] = [];
    const deletedRanges: number[] = [];

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      if (
        lcsIdx < lcs.length &&
        oldIdx < oldLines.length &&
        newIdx < newLines.length &&
        oldLines[oldIdx] === lcs[lcsIdx] &&
        newLines[newIdx] === lcs[lcsIdx]
      ) {
        oldIdx++;
        newIdx++;
        lcsIdx++;
      } else if (
        oldIdx < oldLines.length &&
        (lcsIdx >= lcs.length || oldLines[oldIdx] !== lcs[lcsIdx])
      ) {
        deletedRanges.push(oldIdx + 1);
        oldIdx++;
      } else if (
        newIdx < newLines.length &&
        (lcsIdx >= lcs.length || newLines[newIdx] !== lcs[lcsIdx])
      ) {
        addedRanges.push(newIdx + 1);
        newIdx++;
      }
    }

    const mergeRanges = (lines: number[]): LineRange[] => {
      if (lines.length === 0) {
        return [];
      }

      const ranges: LineRange[] = [];
      let start = lines[0] as number;
      let end = lines[0] as number;

      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === end + 1) {
          end = lines[i] as number;
        } else {
          ranges.push({ start, end });
          start = lines[i] as number;
          end = lines[i] as number;
        }
      }
      ranges.push({ start, end });

      return ranges;
    };

    changes.push(...mergeRanges([...addedRanges, ...deletedRanges].sort((a, b) => a - b)));

    return changes;
  }

  private static longestCommonSubsequence(arr1: string[], arr2: string[]): string[] {
    const m = arr1.length;
    const n = arr2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          (dp[i] as number[])[j] = ((dp[i - 1] as number[])[j - 1] as number) + 1;
        } else {
          (dp[i] as number[])[j] = Math.max(
            (dp[i - 1] as number[])[j] as number,
            (dp[i] as number[])[j - 1] as number,
          );
        }
      }
    }

    const lcs: string[] = [];
    let i = m;
    let j = n;

    while (i > 0 && j > 0) {
      if (arr1[i - 1] === arr2[j - 1]) {
        lcs.unshift(arr1[i - 1] as string);
        i--;
        j--;
      } else if (((dp[i - 1] as number[])[j] as number) > ((dp[i] as number[])[j - 1] as number)) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  static identifyAffectedChunks(
    changedLines: LineRange[],
    existingChunks: Array<{ id: number; startLine: number; endLine: number; content: string }>,
  ): Set<number> {
    const affectedChunkIds = new Set<number>();

    for (const range of changedLines) {
      for (const chunk of existingChunks) {
        const chunkStart = chunk.startLine || 0;
        const chunkEnd = chunk.endLine || Number.MAX_SAFE_INTEGER;

        if (
          (range.start >= chunkStart && range.start <= chunkEnd) ||
          (range.end >= chunkStart && range.end <= chunkEnd) ||
          (range.start < chunkStart && range.end > chunkEnd)
        ) {
          affectedChunkIds.add(chunk.id);
        }
      }
    }

    return affectedChunkIds;
  }

  static computeChunkChanges(
    oldChunks: Array<{ id: number; content: string; startLine: number; endLine: number }>,
    newChunks: Array<{
      content: string;
      startLine: number;
      endLine: number;
      tokenCount?: number | undefined;
    }>,
    affectedChunkIds: Set<number>,
  ): ChunkChange[] {
    const changes: ChunkChange[] = [];

    const oldChunksByRange = new Map<string, (typeof oldChunks)[0]>();
    for (const chunk of oldChunks) {
      const key = `${chunk.startLine}-${chunk.endLine}`;
      oldChunksByRange.set(key, chunk);
    }

    const newChunksByRange = new Map<string, (typeof newChunks)[0]>();
    for (const chunk of newChunks) {
      const key = `${chunk.startLine}-${chunk.endLine}`;
      newChunksByRange.set(key, chunk);
    }

    for (const oldChunk of oldChunks) {
      if (affectedChunkIds.has(oldChunk.id)) {
        const key = `${oldChunk.startLine}-${oldChunk.endLine}`;
        const newChunk = newChunksByRange.get(key);

        if (!newChunk) {
          changes.push({
            chunkId: oldChunk.id,
            chunkIndex: oldChunks.indexOf(oldChunk),
            type: 'deleted',
          });
        } else if (
          this.getContentHash(oldChunk.content) !== this.getContentHash(newChunk.content)
        ) {
          changes.push({
            chunkId: oldChunk.id,
            chunkIndex: oldChunks.indexOf(oldChunk),
            type: 'modified',
            content: newChunk.content,
            startLine: newChunk.startLine,
            endLine: newChunk.endLine,
            tokenCount: newChunk.tokenCount,
          });
        }
      }
    }

    let newChunkIndex = oldChunks.length;
    for (const [key, newChunk] of newChunksByRange) {
      if (!oldChunksByRange.has(key)) {
        changes.push({
          chunkIndex: newChunkIndex++,
          type: 'added',
          content: newChunk.content,
          startLine: newChunk.startLine,
          endLine: newChunk.endLine,
          tokenCount: newChunk.tokenCount,
        });
      }
    }

    return changes;
  }
}
