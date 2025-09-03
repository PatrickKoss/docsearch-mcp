export interface PdfMetadata {
  readonly title?: string | null;
  readonly author?: string | null;
  readonly subject?: string | null;
  readonly creator?: string | null;
  readonly producer?: string | null;
  readonly creationDate?: Date | null;
  readonly modificationDate?: Date | null;
  readonly pageCount: number;
}

export interface PdfContentAdapter {
  extractContent(filePath: string): Promise<string>;
  extractMetadata(filePath: string): Promise<PdfMetadata>;
}

export class NodePdfContentAdapter implements PdfContentAdapter {
  async extractContent(filePath: string): Promise<string> {
    try {
      // Dynamic import to avoid loading PDF parsing if not needed
      const { default: pdf } = await import('pdf-parse');
      const fs = await import('node:fs');

      const pdfBuffer = fs.readFileSync(filePath);
      const data = await pdf(pdfBuffer);

      return data.text;
    } catch (error) {
      throw new Error(`Failed to extract PDF content from ${filePath}: ${error}`);
    }
  }

  async extractMetadata(filePath: string): Promise<PdfMetadata> {
    try {
      // Dynamic import to avoid loading PDF parsing if not needed
      const { default: pdf } = await import('pdf-parse');
      const fs = await import('node:fs');

      const pdfBuffer = fs.readFileSync(filePath);
      const data = await pdf(pdfBuffer);

      return {
        title: data.info?.Title || null,
        author: data.info?.Author || null,
        subject: data.info?.Subject || null,
        creator: data.info?.Creator || null,
        producer: data.info?.Producer || null,
        creationDate: data.info?.CreationDate || null,
        modificationDate: data.info?.ModDate || null,
        pageCount: data.numpages,
      };
    } catch (error) {
      throw new Error(`Failed to extract PDF metadata from ${filePath}: ${error}`);
    }
  }
}
