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
  const lines = text.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let start = 0;
  
  while (start < lines.length) {
    let end = start;
    let acc = '';
    
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const candidate = acc.length ? `${acc}\n${line}` : line;
      if (candidate.length > CODE_MAX_CHARS) break;
      
      acc = candidate;
      end = i + 1;
      
      if (acc.length >= CODE_MIN_CHARS && 
          (/^\s*$/.test(line) || /\}\s*$/.test(line))) {
        break;
      }
    }
    
    if (!acc && lines[start]) {
      acc = lines[start]!;
      end = start + 1;
    }
    
    if (acc) {
      chunks.push({ 
        content: acc, 
        startLine: start + 1, 
        endLine: end, 
        tokenCount: approxTokens(acc) 
      });
    }
    
    start = end;
  }
  
  return chunks;
}

export function chunkDoc(text: string): readonly Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  
  while (i < text.length) {
    const end = Math.min(text.length, i + DOC_MAX_CHARS);
    const slice = text.slice(i, end);
    
    chunks.push({ 
      content: slice, 
      tokenCount: approxTokens(slice) 
    });
    
    if (end === text.length) break;
    i = Math.max(0, end - DOC_OVERLAP);
  }
  
  return chunks;
}

function approxTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(words * 1.05 + 5);
}
