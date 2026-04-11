import { BuiltinParser } from './builtin.js';
import { DoclingParser, isDoclingSupported } from './docling.js';
import { CONFIG } from '../../shared/config.js';

import type { DocumentParser, DocumentParseResult } from './types.js';

class DoclingWithFallback implements DocumentParser {
  private readonly docling: DoclingParser;
  private readonly builtin: BuiltinParser;

  constructor(doclingUrl: string) {
    this.docling = new DoclingParser(doclingUrl);
    this.builtin = new BuiltinParser();
  }

  async parse(filePath: string, buffer: Buffer, ext: string): Promise<DocumentParseResult> {
    if (!isDoclingSupported(ext)) {
      return this.builtin.parse(filePath, buffer, ext);
    }

    try {
      return await this.docling.parse(filePath, buffer, ext);
    } catch (error) {
      console.warn(`Docling parsing failed for ${filePath}, falling back to builtin:`, error);
      return this.builtin.parse(filePath, buffer, ext);
    }
  }
}

let _parser: DocumentParser | null = null;

export function getDocumentParser(): DocumentParser {
  if (_parser) {
    return _parser;
  }

  if (CONFIG.DOCUMENT_PARSER === 'docling') {
    if (!CONFIG.DOCLING_URL) {
      throw new Error(
        'DOCLING_URL is required when DOCUMENT_PARSER is set to "docling". ' +
          'Set DOCLING_URL to your docling-serve endpoint (e.g., http://localhost:5001).',
      );
    }
    _parser = new DoclingWithFallback(CONFIG.DOCLING_URL);
  } else {
    _parser = new BuiltinParser();
  }

  return _parser;
}

export function resetDocumentParser(): void {
  _parser = null;
}
