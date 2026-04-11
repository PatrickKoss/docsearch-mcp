export interface DocumentParseResult {
  readonly text: string;
  readonly metadata: Record<string, unknown>;
  readonly contentType: 'text' | 'markdown';
}

export interface DocumentParser {
  parse(filePath: string, buffer: Buffer, ext: string): Promise<DocumentParseResult>;
}
