import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

import { CONFIG } from '../../shared/config.js';
import { chunkCode, chunkDoc } from '../chunker.js';
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
const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc', '.yaml', '.yml', '.json']);

function isCode(p: string) {
  return CODE_EXT.has(path.extname(p).toLowerCase());
}
function isDoc(p: string) {
  return DOC_EXT.has(path.extname(p).toLowerCase());
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
        const content = await fs.readFile(abs, 'utf8');
        const hash = sha256(content);
        const rel = path.relative(process.cwd(), abs);
        const uri = `file://${abs}`;
        const stat = await fs.stat(abs);
        const docId = await indexer.upsertDocument({
          source: 'file',
          uri,
          repo: guessRepo(abs),
          path: rel,
          title: path.basename(abs),
          lang: path.extname(abs).slice(1),
          hash,
          mtime: stat.mtimeMs,
          version: null,
          extraJson: null,
        });

        const hasChunks = await adapter.hasChunks(docId);

        if (!hasChunks) {
          const chunks = isCode(abs) || !isDoc(abs) ? chunkCode(content) : chunkDoc(content);
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
