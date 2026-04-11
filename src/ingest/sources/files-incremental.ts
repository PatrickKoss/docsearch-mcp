import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

import { CONFIG } from '../../shared/config.js';
import { IncrementalIndexer, type IncrementalIndexResult } from '../incremental-indexer.js';
import { parseAudioVideo } from '../parsers/audio-video.js';
import { parseEpub } from '../parsers/epub.js';
import { parseDocx, parseXlsx, parsePptx } from '../parsers/office.js';
import { convertLegacyOffice, getLegacyOutputExt } from '../parsers/onlyoffice.js';

import type { DatabaseAdapter } from '../adapters/index.js';

const OFFICE_EXT = new Set(['.docx', '.xlsx', '.pptx']);
const LEGACY_OFFICE_EXT = new Set(['.doc', '.xls', '.ppt']);
const EPUB_EXT = new Set(['.epub']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov']);

function isPdf(p: string) {
  return path.extname(p).toLowerCase() === '.pdf';
}

function isOffice(p: string) {
  return OFFICE_EXT.has(path.extname(p).toLowerCase());
}

function isEpub(p: string) {
  return EPUB_EXT.has(path.extname(p).toLowerCase());
}

function isLegacyOfficeExt(p: string) {
  return LEGACY_OFFICE_EXT.has(path.extname(p).toLowerCase());
}

function isMedia(p: string) {
  const ext = path.extname(p).toLowerCase();
  return AUDIO_EXT.has(ext) || VIDEO_EXT.has(ext);
}

function getLangForExt(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (isPdf(p)) {
    return 'pdf';
  }
  if (AUDIO_EXT.has(ext)) {
    return 'audio';
  }
  if (VIDEO_EXT.has(ext)) {
    return 'video';
  }
  return ext.slice(1);
}

function guessRepo(absPath: string): string | null {
  let dir = path.dirname(absPath);
  while (dir !== path.dirname(dir)) {
    try {
      if (existsSync(path.join(dir, '.git'))) {
        return path.basename(dir);
      }
    } catch {
      // Ignore error accessing git directory
    }
    dir = path.dirname(dir);
  }
  return null;
}

export interface IncrementalIngestStats {
  filesProcessed: number;
  filesSkipped: number;
  totalChunksAdded: number;
  totalChunksModified: number;
  totalChunksDeleted: number;
  totalProcessingTime: number;
  fileResults: IncrementalIndexResult[];
}

export async function ingestFilesIncremental(
  adapter: DatabaseAdapter,
  verbose: boolean = false,
): Promise<IncrementalIngestStats> {
  const indexer = new IncrementalIndexer(adapter);
  const stats: IncrementalIngestStats = {
    filesProcessed: 0,
    filesSkipped: 0,
    totalChunksAdded: 0,
    totalChunksModified: 0,
    totalChunksDeleted: 0,
    totalProcessingTime: 0,
    fileResults: [],
  };

  for (const root of CONFIG.FILE_ROOTS) {
    const files = await fg([...CONFIG.FILE_INCLUDE_GLOBS], {
      cwd: root,
      ignore: [...CONFIG.FILE_EXCLUDE_GLOBS],
      dot: false,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: true,
      absolute: true,
    });

    const ingestedUris: string[] = [];

    for (const abs of files) {
      try {
        let content: string;
        let extraJson: string | null = null;

        if (isPdf(abs)) {
          if (verbose) {
            console.info(`Processing PDF: ${abs}`);
          }
          const buffer = await fs.readFile(abs);
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: buffer });
          const result = await parser.getText();
          const info = await parser.getInfo();
          content = result.text;

          if (!content.trim()) {
            if (process.env.NODE_ENV !== 'test') {
              console.warn(`PDF appears to be empty or unreadable: ${abs}`);
            }
            stats.filesSkipped++;
            continue;
          }

          extraJson = JSON.stringify({
            pages: info.total,
            info: info.info,
          });
        } else if (isOffice(abs)) {
          if (verbose) {
            console.info(`Processing office document: ${abs}`);
          }
          const ext = path.extname(abs).toLowerCase();
          let officeResult;
          if (ext === '.docx') {
            officeResult = await parseDocx(abs);
          } else if (ext === '.xlsx') {
            officeResult = await parseXlsx(abs);
          } else {
            officeResult = await parsePptx(abs);
          }
          content = officeResult.text;
          if (!content.trim()) {
            stats.filesSkipped++;
            continue;
          }
          extraJson = JSON.stringify(officeResult.metadata);
        } else if (isLegacyOfficeExt(abs)) {
          if (!CONFIG.ONLYOFFICE_URL) {
            console.warn(`Skipping legacy Office file (ONLYOFFICE_URL not configured): ${abs}`);
            stats.filesSkipped++;
            continue;
          }
          if (verbose) {
            console.info(`Converting legacy office document: ${abs}`);
          }
          let convertedPath: string | undefined;
          try {
            convertedPath = await convertLegacyOffice(abs);
            const outputExt = getLegacyOutputExt(abs) ?? '.docx';
            let officeResult;
            if (outputExt === '.docx') {
              officeResult = await parseDocx(convertedPath);
            } else if (outputExt === '.xlsx') {
              officeResult = await parseXlsx(convertedPath);
            } else {
              officeResult = await parsePptx(convertedPath);
            }
            content = officeResult.text;
            if (!content.trim()) {
              stats.filesSkipped++;
              continue;
            }
            extraJson = JSON.stringify({
              ...officeResult.metadata,
              convertedFrom: path.extname(abs).toLowerCase().slice(1),
            });
          } catch (convErr) {
            if (process.env.NODE_ENV !== 'test') {
              console.error(`Failed to convert legacy office file: ${abs}`, convErr);
            }
            stats.filesSkipped++;
            continue;
          } finally {
            if (convertedPath) {
              await fs.unlink(convertedPath).catch(() => {});
            }
          }
        } else if (isEpub(abs)) {
          if (verbose) {
            console.info(`Processing EPUB: ${abs}`);
          }
          const epubResult = await parseEpub(abs);
          content = epubResult.chapters.map((ch) => ch.text).join('\n\n');
          if (!content.trim()) {
            stats.filesSkipped++;
            continue;
          }
          extraJson = JSON.stringify(epubResult.metadata);
        } else if (isMedia(abs)) {
          if (verbose) {
            console.info(`Processing media file: ${abs}`);
          }
          const mediaResult = await parseAudioVideo(abs);
          content = mediaResult.transcript || `Media: ${path.basename(abs)}`;
          extraJson = JSON.stringify(mediaResult.metadata);
        } else {
          content = await fs.readFile(abs, 'utf8');
        }

        const rel = path.relative(process.cwd(), abs);
        const uri = `file://${abs}`;
        ingestedUris.push(uri);
        const stat = await fs.stat(abs);
        const ext = path.extname(abs).toLowerCase();
        const titleExt = ['.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt', '.epub'];
        const title = titleExt.includes(ext) ? path.basename(abs, ext) : path.basename(abs);

        const result = await indexer.indexFileIncremental(abs, content, {
          source: 'file',
          uri,
          repo: guessRepo(abs),
          path: rel,
          title,
          lang: getLangForExt(abs),
          mtime: stat.mtimeMs,
          version: null,
          extraJson,
        });

        stats.filesProcessed++;
        stats.totalChunksAdded += result.chunksAdded;
        stats.totalChunksModified += result.chunksModified;
        stats.totalChunksDeleted += result.chunksDeleted;
        stats.totalProcessingTime += result.processingTime;
        stats.fileResults.push(result);

        if (
          verbose &&
          (result.chunksAdded > 0 || result.chunksModified > 0 || result.chunksDeleted > 0)
        ) {
          console.info(
            `  ${rel}: +${result.chunksAdded} ~${result.chunksModified} -${result.chunksDeleted} chunks (${result.processingTime}ms)`,
          );
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'test') {
          console.error('Incremental ingest file error:', abs, e);
        }
        stats.filesSkipped++;
      }
    }

    // Clean up stale documents for this root
    const rootPrefix = `file://${root}`;
    const ingestedSet = new Set(ingestedUris);
    const allDocs = await adapter.rawQuery(
      `select uri from documents where source = 'file' and uri like '${rootPrefix}%'`,
    );
    const staleUris = allDocs
      .map((row) => row.uri as string)
      .filter((uri) => !ingestedSet.has(uri));
    if (staleUris.length > 0) {
      await adapter.deleteDocumentsByUris(staleUris);
    }
  }

  if (verbose) {
    console.info('\nIncremental Indexing Summary:');
    console.info(`  Files processed: ${stats.filesProcessed}`);
    console.info(`  Files skipped: ${stats.filesSkipped}`);
    console.info(`  Chunks added: ${stats.totalChunksAdded}`);
    console.info(`  Chunks modified: ${stats.totalChunksModified}`);
    console.info(`  Chunks deleted: ${stats.totalChunksDeleted}`);
    console.info(`  Total time: ${stats.totalProcessingTime}ms`);
    console.info(
      `  Average time per file: ${Math.round(stats.totalProcessingTime / stats.filesProcessed)}ms`,
    );
  }

  return stats;
}

export async function ingestSingleFileIncremental(
  adapter: DatabaseAdapter,
  filePath: string,
): Promise<IncrementalIndexResult | null> {
  const indexer = new IncrementalIndexer(adapter);

  try {
    const abs = path.resolve(filePath);
    let content: string;
    let extraJson: string | null = null;

    if (isPdf(abs)) {
      console.info(`Processing PDF: ${abs}`);
      const buffer = await fs.readFile(abs);
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const info = await parser.getInfo();
      content = result.text;

      if (!content.trim()) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn(`PDF appears to be empty or unreadable: ${abs}`);
        }
        return null;
      }

      extraJson = JSON.stringify({
        pages: info.total,
        info: info.info,
      });
    } else if (isOffice(abs)) {
      const ext = path.extname(abs).toLowerCase();
      let officeResult;
      if (ext === '.docx') {
        officeResult = await parseDocx(abs);
      } else if (ext === '.xlsx') {
        officeResult = await parseXlsx(abs);
      } else {
        officeResult = await parsePptx(abs);
      }
      content = officeResult.text;
      if (!content.trim()) {
        return null;
      }
      extraJson = JSON.stringify(officeResult.metadata);
    } else if (isLegacyOfficeExt(abs)) {
      if (!CONFIG.ONLYOFFICE_URL) {
        console.warn(`Skipping legacy Office file (ONLYOFFICE_URL not configured): ${abs}`);
        return null;
      }
      let convertedPath: string | undefined;
      try {
        convertedPath = await convertLegacyOffice(abs);
        const outputExt = getLegacyOutputExt(abs) ?? '.docx';
        let officeResult;
        if (outputExt === '.docx') {
          officeResult = await parseDocx(convertedPath);
        } else if (outputExt === '.xlsx') {
          officeResult = await parseXlsx(convertedPath);
        } else {
          officeResult = await parsePptx(convertedPath);
        }
        content = officeResult.text;
        if (!content.trim()) {
          return null;
        }
        extraJson = JSON.stringify({
          ...officeResult.metadata,
          convertedFrom: path.extname(abs).toLowerCase().slice(1),
        });
      } catch (convErr) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(`Failed to convert legacy office file: ${abs}`, convErr);
        }
        return null;
      } finally {
        if (convertedPath) {
          await fs.unlink(convertedPath).catch(() => {});
        }
      }
    } else if (isEpub(abs)) {
      const epubResult = await parseEpub(abs);
      content = epubResult.chapters.map((ch) => ch.text).join('\n\n');
      if (!content.trim()) {
        return null;
      }
      extraJson = JSON.stringify(epubResult.metadata);
    } else if (isMedia(abs)) {
      const mediaResult = await parseAudioVideo(abs);
      content = mediaResult.transcript || `Media: ${path.basename(abs)}`;
      extraJson = JSON.stringify(mediaResult.metadata);
    } else {
      content = await fs.readFile(abs, 'utf8');
    }

    const rel = path.relative(process.cwd(), abs);
    const uri = `file://${abs}`;
    const stat = await fs.stat(abs);
    const ext = path.extname(abs).toLowerCase();
    const titleExt = ['.pdf', '.docx', '.xlsx', '.pptx', '.epub'];
    const title = titleExt.includes(ext) ? path.basename(abs, ext) : path.basename(abs);

    return await indexer.indexFileIncremental(abs, content, {
      source: 'file',
      uri,
      repo: guessRepo(abs),
      path: rel,
      title,
      lang: getLangForExt(abs),
      mtime: stat.mtimeMs,
      version: null,
      extraJson,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Incremental ingest single file error:', filePath, e);
    }
    return null;
  }
}
