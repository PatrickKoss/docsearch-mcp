import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

import { CONFIG } from '../../shared/config.js';
import { chunkCode, chunkDoc, chunkPdf } from '../chunker.js';
import { sha256 } from '../hash.js';
import { getImageToTextProvider } from '../image-to-text.js';
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
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

function getTitle(filePath: string): string {
  if (isPdf(filePath)) {
    return path.basename(filePath, '.pdf');
  }
  if (isImage(filePath)) {
    return path.basename(filePath);
  }
  return path.basename(filePath);
}

function getLanguage(filePath: string): string {
  if (isPdf(filePath)) {
    return 'pdf';
  }
  if (isImage(filePath)) {
    return 'image';
  }
  return path.extname(filePath).slice(1);
}

function isCode(p: string) {
  return CODE_EXT.has(path.extname(p).toLowerCase());
}
function isDoc(p: string) {
  return DOC_EXT.has(path.extname(p).toLowerCase());
}

function isPdf(p: string) {
  return path.extname(p).toLowerCase() === '.pdf';
}

function isImage(p: string) {
  return IMAGE_EXT.has(path.extname(p).toLowerCase());
}

export async function ingestFiles(adapter: DatabaseAdapter) {
  const indexer = new Indexer(adapter);
  const imageToTextProvider = getImageToTextProvider();

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
            if (process.env.NODE_ENV !== 'test') {
              console.warn(`PDF appears to be empty or unreadable: ${abs}`);
            }
            continue;
          }

          extraJson = JSON.stringify({
            pages: data.numpages,
            info: data.info,
          });
        } else if (isImage(abs)) {
          console.info(`Processing image: ${abs}`);

          // Get image description if provider is available
          let imageDescription = '';
          if (imageToTextProvider) {
            try {
              imageDescription = await imageToTextProvider.describeImage(abs);
            } catch (error) {
              if (process.env.NODE_ENV !== 'test') {
                console.warn(`Failed to describe image ${abs}:`, error);
              }
            }
          }

          // Use image description as content, fallback to filename
          content = imageDescription || `Image: ${path.basename(abs)}`;

          // Store image metadata
          const stat = await fs.stat(abs);
          extraJson = JSON.stringify({
            isImage: true,
            imagePath: abs,
            fileSize: stat.size,
            description: imageDescription,
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
          title: getTitle(abs),
          lang: getLanguage(abs),
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
          } else if (isImage(abs)) {
            // For images, create a single chunk with the description
            chunks = [
              {
                content,
                startLine: undefined,
                endLine: undefined,
              },
            ];
          } else if (isCode(abs) || (!isDoc(abs) && !isPdf(abs))) {
            chunks = chunkCode(content);
          } else {
            chunks = chunkDoc(content);
          }
          await indexer.insertChunks(docId, chunks);
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'test') {
          console.error('ingest file error:', abs, e);
        }
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
