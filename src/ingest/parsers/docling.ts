import path from 'node:path';

import { fetch } from 'undici';

import type { DocumentParser, DocumentParseResult } from './types.js';

const DOCLING_SUPPORTED_EXT = new Set([
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.html',
  '.htm',
  '.png',
  '.jpg',
  '.jpeg',
  '.tiff',
  '.tif',
  '.bmp',
  '.epub',
]);

export function isDoclingSupported(ext: string): boolean {
  return DOCLING_SUPPORTED_EXT.has(ext.toLowerCase());
}

export class DoclingParser implements DocumentParser {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async parse(filePath: string, buffer: Buffer, ext: string): Promise<DocumentParseResult> {
    const fileName = path.basename(filePath);
    const mimeType = getMimeType(ext);

    const formData = new FormData();
    formData.append('files', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);

    const response = await fetch(`${this.baseUrl}/v1alpha/convert/file`, {
      method: 'POST',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: formData as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Docling conversion failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as DoclingResponse;
    const markdown = extractMarkdown(data);

    return {
      text: markdown,
      metadata: {
        parser: 'docling',
        sourceFormat: ext.slice(1),
      },
      contentType: 'markdown',
    };
  }
}

interface DoclingResponse {
  readonly document?: {
    readonly md_content?: string;
    readonly export_to_markdown?: string;
  };
  readonly content?: string;
  readonly md_content?: string;
  readonly output?: {
    readonly markdown?: string;
  };
}

function extractMarkdown(data: DoclingResponse): string {
  // Try various response shapes from docling-serve API
  if (data.document?.md_content) {
    return data.document.md_content;
  }
  if (data.document?.export_to_markdown) {
    return data.document.export_to_markdown;
  }
  if (data.md_content) {
    return data.md_content;
  }
  if (data.output?.markdown) {
    return data.output.markdown;
  }
  if (data.content) {
    return data.content;
  }

  // If response is a string itself
  if (typeof data === 'string') {
    return data;
  }

  throw new Error('Could not extract markdown from Docling response');
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.bmp': 'image/bmp',
    '.epub': 'application/epub+zip',
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}
