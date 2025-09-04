import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

import { CONFIG } from '../../shared/config.js';
import { IncrementalIndexer, type IncrementalIndexResult } from '../incremental-indexer.js';

import type { DatabaseAdapter } from '../adapters/index.js';

function isPdf(p: string) {
  return path.extname(p).toLowerCase() === '.pdf';
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

    for (const abs of files) {
      try {
        let content: string;
        let extraJson: string | null = null;

        if (isPdf(abs)) {
          if (verbose) {
            console.info(`Processing PDF: ${abs}`);
          }
          const buffer = await fs.readFile(abs);
          const pdfParse = (await import('pdf-parse')).default;
          const data = await pdfParse(buffer);
          content = data.text;

          if (!content.trim()) {
            console.warn(`PDF appears to be empty or unreadable: ${abs}`);
            stats.filesSkipped++;
            continue;
          }

          extraJson = JSON.stringify({
            pages: data.numpages,
            info: data.info,
          });
        } else {
          content = await fs.readFile(abs, 'utf8');
        }

        const rel = path.relative(process.cwd(), abs);
        const uri = `file://${abs}`;
        const stat = await fs.stat(abs);

        const result = await indexer.indexFileIncremental(abs, content, {
          source: 'file',
          uri,
          repo: guessRepo(abs),
          path: rel,
          title: isPdf(abs) ? path.basename(abs, '.pdf') : path.basename(abs),
          lang: isPdf(abs) ? 'pdf' : path.extname(abs).slice(1),
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
        console.error('Incremental ingest file error:', abs, e);
        stats.filesSkipped++;
      }
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
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      content = data.text;

      if (!content.trim()) {
        console.warn(`PDF appears to be empty or unreadable: ${abs}`);
        return null;
      }

      extraJson = JSON.stringify({
        pages: data.numpages,
        info: data.info,
      });
    } else {
      content = await fs.readFile(abs, 'utf8');
    }

    const rel = path.relative(process.cwd(), abs);
    const uri = `file://${abs}`;
    const stat = await fs.stat(abs);

    return await indexer.indexFileIncremental(abs, content, {
      source: 'file',
      uri,
      repo: guessRepo(abs),
      path: rel,
      title: isPdf(abs) ? path.basename(abs, '.pdf') : path.basename(abs),
      lang: isPdf(abs) ? 'pdf' : path.extname(abs).slice(1),
      mtime: stat.mtimeMs,
      version: null,
      extraJson,
    });
  } catch (e) {
    console.error('Incremental ingest single file error:', filePath, e);
    return null;
  }
}
