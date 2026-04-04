import fs from 'node:fs/promises';

export interface OfficeParseResult {
  readonly text: string;
  readonly metadata: Record<string, unknown>;
}

const MAX_SHEETS = 100;
const MAX_ROWS_PER_SHEET = 10_000;

export async function parseDocx(filePath: string): Promise<OfficeParseResult> {
  const mammoth = await import('mammoth');
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();

  return {
    text,
    metadata: {
      format: 'docx',
    },
  };
}

export async function parseXlsx(filePath: string): Promise<OfficeParseResult> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheets = workbook.worksheets.slice(0, MAX_SHEETS);
  const truncatedSheets = workbook.worksheets.length > MAX_SHEETS;

  if (truncatedSheets) {
    console.warn(
      `XLSX file ${filePath} has ${workbook.worksheets.length} sheets, truncating to ${MAX_SHEETS}`,
    );
  }

  const parts: string[] = [];
  let totalRows = 0;

  for (const sheet of worksheets) {
    const rows: string[] = [];
    let rowCount = 0;

    sheet.eachRow((row, _rowNumber) => {
      if (rowCount >= MAX_ROWS_PER_SHEET) {
        return;
      }
      const cells = row.values as unknown[];
      // row.values is 1-indexed (index 0 is undefined), so skip first element
      const cellTexts = cells
        .slice(1)
        .map((cell) => (cell != null ? String(cell) : ''))
        .join('\t');
      if (cellTexts.trim()) {
        rows.push(cellTexts);
      }
      rowCount++;
    });

    if (sheet.rowCount > MAX_ROWS_PER_SHEET) {
      console.warn(
        `Sheet "${sheet.name}" in ${filePath} has ${sheet.rowCount} rows, truncating to ${MAX_ROWS_PER_SHEET}`,
      );
    }

    if (rows.length > 0) {
      parts.push(`Sheet: ${sheet.name}\n${rows.join('\n')}`);
    }

    totalRows += rowCount;
  }

  return {
    text: parts.join('\n\n'),
    metadata: {
      format: 'xlsx',
      sheetCount: worksheets.length,
      totalRows,
    },
  };
}

export async function parsePptx(filePath: string): Promise<OfficeParseResult> {
  const JSZip = (await import('jszip')).default;
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const parts: string[] = [];
  let slideNumber = 0;

  // PPTX slides are stored as ppt/slides/slide1.xml, slide2.xml, etc.
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0', 10);
      return numA - numB;
    });

  for (const slideFile of slideFiles) {
    slideNumber++;
    const file = zip.files[slideFile];
    if (!file) {
      continue;
    }
    const xml = await file.async('string');

    // Extract text from XML by finding all <a:t> elements (PowerPoint text runs)
    const textParts: string[] = [];
    const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const text = (match[1] ?? '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      if (text) {
        textParts.push(text);
      }
    }

    const slideText = textParts.join(' ').trim();
    if (slideText) {
      parts.push(`Slide ${slideNumber}\n${slideText}`);
    }
  }

  return {
    text: parts.join('\n\n'),
    metadata: {
      format: 'pptx',
      slideCount: slideNumber,
    },
  };
}
