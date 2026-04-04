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
  const XLSX = await import('xlsx');
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetNames = workbook.SheetNames.slice(0, MAX_SHEETS);
  const truncatedSheets = workbook.SheetNames.length > MAX_SHEETS;

  if (truncatedSheets) {
    console.warn(
      `XLSX file ${filePath} has ${workbook.SheetNames.length} sheets, truncating to ${MAX_SHEETS}`,
    );
  }

  const parts: string[] = [];
  let totalRows = 0;

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      continue;
    }

    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    const cappedRows = rows.slice(0, MAX_ROWS_PER_SHEET);

    if (rows.length > MAX_ROWS_PER_SHEET) {
      console.warn(
        `Sheet "${name}" in ${filePath} has ${rows.length} rows, truncating to ${MAX_ROWS_PER_SHEET}`,
      );
    }

    const sheetText = cappedRows
      .map((row) => (row as unknown[]).map((cell) => (cell != null ? String(cell) : '')).join('\t'))
      .filter((line) => line.trim())
      .join('\n');

    if (sheetText.trim()) {
      parts.push(`Sheet: ${name}\n${sheetText}`);
    }

    totalRows += cappedRows.length;
  }

  return {
    text: parts.join('\n\n'),
    metadata: {
      format: 'xlsx',
      sheetCount: sheetNames.length,
      totalRows,
    },
  };
}

export async function parsePptx(filePath: string): Promise<OfficeParseResult> {
  const XLSX = await import('xlsx');
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const parts: string[] = [];
  let slideNumber = 0;

  for (const name of workbook.SheetNames) {
    slideNumber++;
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      continue;
    }

    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    const slideText = rows
      .map((row) => (row as unknown[]).map((cell) => (cell != null ? String(cell) : '')).join(' '))
      .filter((line) => line.trim())
      .join('\n');

    if (slideText.trim()) {
      parts.push(`Slide ${slideNumber}: ${name}\n${slideText}`);
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
