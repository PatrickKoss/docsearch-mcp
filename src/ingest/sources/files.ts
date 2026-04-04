import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

import { CONFIG } from '../../shared/config.js';
import { chunkCode, chunkDoc, chunkPdf, chunkEpub, chunkTranscript } from '../chunker.js';
import { sha256 } from '../hash.js';
import { getImageToTextProvider } from '../image-to-text.js';
import { Indexer } from '../indexer.js';
import { parseAudioVideo } from '../parsers/audio-video.js';
import { parseEpub } from '../parsers/epub.js';
import { parseDocx, parseXlsx, parsePptx } from '../parsers/office.js';

import type { DatabaseAdapter } from '../adapters/index.js';
import type { TranscriptSegment } from '../parsers/audio-video.js';
import type { EpubChapter } from '../parsers/epub.js';

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
const OFFICE_EXT = new Set(['.docx', '.xlsx', '.pptx']);
const EPUB_EXT = new Set(['.epub']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov']);

function getTitle(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (isPdf(filePath) || isOffice(filePath) || isEpub(filePath)) {
    return path.basename(filePath, ext);
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
  if (isAudio(filePath)) {
    return 'audio';
  }
  if (isVideo(filePath)) {
    return 'video';
  }
  const ext = path.extname(filePath).toLowerCase().slice(1);
  if (OFFICE_EXT.has(`.${ext}`) || EPUB_EXT.has(`.${ext}`)) {
    return ext;
  }
  return ext;
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

function isOffice(p: string) {
  return OFFICE_EXT.has(path.extname(p).toLowerCase());
}

function isEpub(p: string) {
  return EPUB_EXT.has(path.extname(p).toLowerCase());
}

function isAudio(p: string) {
  return AUDIO_EXT.has(path.extname(p).toLowerCase());
}

function isVideo(p: string) {
  return VIDEO_EXT.has(path.extname(p).toLowerCase());
}

function isMedia(p: string) {
  return isAudio(p) || isVideo(p);
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
        let epubChapters: EpubChapter[] | null = null;
        let mediaSegments: TranscriptSegment[] | null = null;

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
            continue;
          }

          extraJson = JSON.stringify({
            pages: info.total,
            info: info.info,
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
        } else if (isOffice(abs)) {
          console.info(`Processing office document: ${abs}`);
          const ext = path.extname(abs).toLowerCase();
          let result;
          if (ext === '.docx') {
            result = await parseDocx(abs);
          } else if (ext === '.xlsx') {
            result = await parseXlsx(abs);
          } else {
            result = await parsePptx(abs);
          }
          content = result.text;
          if (!content.trim()) {
            if (process.env.NODE_ENV !== 'test') {
              console.warn(`Office document appears to be empty: ${abs}`);
            }
            continue;
          }
          extraJson = JSON.stringify(result.metadata);
        } else if (isEpub(abs)) {
          console.info(`Processing EPUB: ${abs}`);
          const result = await parseEpub(abs);
          epubChapters = result.chapters;
          content = result.chapters.map((ch) => ch.text).join('\n\n');
          if (!content.trim()) {
            if (process.env.NODE_ENV !== 'test') {
              console.warn(`EPUB appears to have no content: ${abs}`);
            }
            continue;
          }
          extraJson = JSON.stringify(result.metadata);
        } else if (isMedia(abs)) {
          console.info(`Processing media file: ${abs}`);
          const result = await parseAudioVideo(abs);
          content = result.transcript || `Media: ${path.basename(abs)}`;
          mediaSegments = result.segments || null;
          extraJson = JSON.stringify(result.metadata);
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
            chunks = [
              {
                content,
                startLine: undefined,
                endLine: undefined,
              },
            ];
          } else if (isOffice(abs)) {
            chunks = chunkDoc(content);
          } else if (isEpub(abs) && epubChapters) {
            chunks = chunkEpub(epubChapters);
          } else if (isMedia(abs)) {
            if (mediaSegments && mediaSegments.length > 0) {
              chunks = chunkTranscript(mediaSegments);
            } else {
              chunks = [{ content, startLine: undefined, endLine: undefined }];
            }
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
