export type ContentType = 'code' | 'document' | 'pdf';

export interface ContentTypeDetector {
  detectContentType(filePath: string): ContentType;
  isCodeFile(filePath: string): boolean;
  isDocumentFile(filePath: string): boolean;
  isPdfFile(filePath: string): boolean;
}

export class DefaultContentTypeDetector implements ContentTypeDetector {
  private static readonly CODE_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '.go',
    '.rs',
    '.java',
    '.cs',
    '.cpp',
    '.c',
    '.rb',
    '.php',
    '.kt',
    '.swift',
  ]);

  private static readonly DOCUMENT_EXTENSIONS = new Set([
    '.md',
    '.mdx',
    '.txt',
    '.rst',
    '.adoc',
    '.yaml',
    '.yml',
    '.json',
  ]);

  private static readonly PDF_EXTENSION = '.pdf';

  detectContentType(filePath: string): ContentType {
    if (this.isPdfFile(filePath)) {
      return 'pdf';
    }
    if (this.isCodeFile(filePath)) {
      return 'code';
    }
    return 'document';
  }

  isCodeFile(filePath: string): boolean {
    const extension = this.getFileExtension(filePath);
    return DefaultContentTypeDetector.CODE_EXTENSIONS.has(extension);
  }

  isDocumentFile(filePath: string): boolean {
    const extension = this.getFileExtension(filePath);
    return DefaultContentTypeDetector.DOCUMENT_EXTENSIONS.has(extension);
  }

  isPdfFile(filePath: string): boolean {
    const extension = this.getFileExtension(filePath);
    return extension === DefaultContentTypeDetector.PDF_EXTENSION;
  }

  private getFileExtension(filePath: string): string {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return '';
    }
    return filePath.substring(lastDotIndex).toLowerCase();
  }
}
