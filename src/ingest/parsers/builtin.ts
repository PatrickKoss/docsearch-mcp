import fs from 'node:fs/promises';

import { parseEpub } from './epub.js';
import { parseDocx, parseXlsx, parsePptx } from './office.js';
import { convertLegacyOffice, getLegacyOutputExt } from './onlyoffice.js';
import { CONFIG } from '../../shared/config.js';

import type { DocumentParser, DocumentParseResult } from './types.js';

const OFFICE_PARSERS: Record<
  string,
  (filePath: string) => Promise<{ text: string; metadata: Record<string, unknown> }>
> = {
  '.docx': parseDocx,
  '.xlsx': parseXlsx,
  '.pptx': parsePptx,
};

const LEGACY_OFFICE_EXT = new Set(['.doc', '.xls', '.ppt']);

export class BuiltinParser implements DocumentParser {
  async parse(filePath: string, buffer: Buffer, ext: string): Promise<DocumentParseResult> {
    const normalizedExt = ext.toLowerCase();

    if (normalizedExt === '.pdf') {
      return this.parsePdf(buffer);
    }

    if (OFFICE_PARSERS[normalizedExt]) {
      return this.parseOffice(filePath, normalizedExt);
    }

    if (LEGACY_OFFICE_EXT.has(normalizedExt)) {
      return this.parseLegacyOffice(filePath, normalizedExt);
    }

    if (normalizedExt === '.epub') {
      return this.parseEpubFile(filePath);
    }

    // Plain text fallback
    return {
      text: buffer.toString('utf8'),
      metadata: {},
      contentType: 'text',
    };
  }

  private async parsePdf(buffer: Buffer): Promise<DocumentParseResult> {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const info = await parser.getInfo();

    return {
      text: result.text,
      metadata: {
        pages: info.total,
        info: info.info,
      },
      contentType: 'text',
    };
  }

  private async parseOffice(filePath: string, ext: string): Promise<DocumentParseResult> {
    const parseFn = OFFICE_PARSERS[ext];
    if (!parseFn) {
      return { text: '', metadata: {}, contentType: 'text' };
    }
    const result = await parseFn(filePath);

    return {
      text: result.text,
      metadata: result.metadata,
      contentType: 'text',
    };
  }

  private async parseLegacyOffice(filePath: string, ext: string): Promise<DocumentParseResult> {
    if (!CONFIG.ONLYOFFICE_URL) {
      console.warn(`Skipping legacy Office file (ONLYOFFICE_URL not configured): ${filePath}`);
      return { text: '', metadata: {}, contentType: 'text' };
    }

    const convertedPath = await convertLegacyOffice(filePath);
    try {
      const outputExt = getLegacyOutputExt(filePath) ?? '.docx';
      const parseFn = OFFICE_PARSERS[outputExt] ?? OFFICE_PARSERS['.docx'];
      if (!parseFn) {
        return { text: '', metadata: {}, contentType: 'text' };
      }
      const result = await parseFn(convertedPath);

      return {
        text: result.text,
        metadata: {
          ...result.metadata,
          convertedFrom: ext.slice(1),
        },
        contentType: 'text',
      };
    } finally {
      await fs.unlink(convertedPath).catch(() => {});
    }
  }

  private async parseEpubFile(filePath: string): Promise<DocumentParseResult> {
    const result = await parseEpub(filePath);

    return {
      text: result.chapters.map((ch) => ch.text).join('\n\n'),
      metadata: result.metadata,
      contentType: 'text',
    };
  }
}
