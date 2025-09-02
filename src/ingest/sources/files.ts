import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

import { CONFIG } from '../../shared/config.js';
import { chunkCode, chunkDoc, chunkPdf } from '../chunker.js';
import { sha256 } from '../hash.js';
import { Indexer } from '../indexer.js';

import type { DatabaseAdapter } from '../adapters/index.js';

const CODE_EXT = new Set([
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
const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc', '.yaml', '.yml', '.json', '.pdf']);

function isCode(p: string) {
  return CODE_EXT.has(path.extname(p).toLowerCase());
}
function isDoc(p: string) {
  return DOC_EXT.has(path.extname(p).toLowerCase());
}

function isPdf(p: string) {
  return path.extname(p).toLowerCase() === '.pdf';
}

export async function ingestFiles(adapter: DatabaseAdapter) {
  const indexer = new Indexer(adapter);
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
          console.info(`Processing PDF: ${abs}`);
          const buffer = await fs.readFile(abs);
          const pdfParse = (await import('pdf-parse')).default;
          const data = await pdfParse(buffer);
          content = data.text;

          if (!content.trim()) {
            console.warn(`PDF appears to be empty or unreadable: ${abs}`);
            continue;
          }

          extraJson = JSON.stringify({
            pages: data.numpages,
            info: data.info,
          });
        } else {
          content = await fs.readFile(abs, 'utf8');
        }

        const hash = sha256(content);
        const rel = path.relative(process.cwd(), abs);
        const uri = `file://${abs}`;
        const stat = await fs.stat(abs);
        const docId = await indexer.upsertDocument({
          source: 'file',
          uri,
          repo: guessRepo(abs),
          path: rel,
          title: isPdf(abs) ? path.basename(abs, '.pdf') : path.basename(abs),
          lang: isPdf(abs) ? 'pdf' : path.extname(abs).slice(1),
          hash,
          mtime: stat.mtimeMs,
          version: null,
          extraJson,
        });

        const hasChunks = await adapter.hasChunks(docId);

        if (!hasChunks) {
          let chunks;
          if (isPdf(abs)) {
            chunks = chunkPdf(content);
          } else if (isCode(abs) || (!isDoc(abs) && !isPdf(abs))) {
            chunks = chunkCode(content);
          } else {
            chunks = chunkDoc(content);
          }
          await indexer.insertChunks(docId, chunks);
        }
      } catch (e) {
        console.error('ingest file error:', abs, e);
      }
    }
  }
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
