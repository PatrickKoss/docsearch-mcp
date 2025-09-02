export interface Chunk {
  content: string;
  startLine?: number;
  endLine?: number;
  tokenCount?: number;
}

const CODE_MAX_CHARS = 1400;
const CODE_MIN_CHARS = 700;
const DOC_MAX_CHARS = 1200;
const DOC_OVERLAP = 150;

export function chunkCode(str: string): Chunk[] {
  const lines = str.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let acc = '';
    for (let i = start; i < lines.length; i++) {
      const candidate = acc.length ? acc + '\n' + lines[i] : lines[i];
      if (candidate.length > CODE_MAX_CHARS) break;
      acc = candidate;
      end = i + 1;
      if (acc.length >= CODE_MIN_CHARS && (/^\s*$/.test(lines[i]) || /\}\s*$/.test(lines[i]))) {
        break;
      }
    }
    if (!acc) {
      acc = lines[start];
      end = start + 1;
    }
    chunks.push({ content: acc, startLine: start + 1, endLine: end, tokenCount: approxTokens(acc) });
    start = end;
  }
  return chunks;
}

export function chunkDoc(str: string): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < str.length) {
    const end = Math.min(str.length, i + DOC_MAX_CHARS);
    const slice = str.slice(i, end);
    chunks.push({ content: slice, tokenCount: approxTokens(slice) });
    if (end === str.length) break;
    i = Math.max(0, end - DOC_OVERLAP);
  }
  return chunks;
}

function approxTokens(s: string): number {
  const words = s.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(words * 1.05 + 5);
}
