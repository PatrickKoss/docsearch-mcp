#!/usr/bin/env -S node --enable-source-maps
import fs from 'node:fs';

import chokidar from 'chokidar';

import { getDatabase, closeDatabase } from './database.js';
import { Indexer } from './indexer.js';
import { ingestConfluence } from './sources/confluence.js';
import {
  ingestFilesIncremental,
  ingestSingleFileIncremental,
} from './sources/files-incremental.js';
import { ingestFiles } from './sources/files.js';

async function main() {
  const cmd = process.argv[2] || 'help';
  const useIncremental = process.argv.includes('--incremental') || process.argv.includes('-i');
  const adapter = await getDatabase();
  const indexer = new Indexer(adapter);

  try {
    if (cmd === 'files') {
      if (useIncremental) {
        console.log('Using incremental indexing...');
        await ingestFilesIncremental(adapter, true);
      } else {
        await ingestFiles(adapter);
      }
      await indexer.embedNewChunks();
      console.log('Files ingested.');
    } else if (cmd === 'confluence') {
      await ingestConfluence(adapter);
      await indexer.embedNewChunks();
      console.log('Confluence ingested.');
    } else if (cmd === 'watch') {
      console.log(`Watching for changes (${useIncremental ? 'incremental' : 'full'} mode)...`);
      const watcher = chokidar.watch(process.cwd(), {
        ignored: /(^|[/])\.(git|hg)|node_modules|dist|build|target/,
        ignoreInitial: true,
      });
      watcher.on('all', async (event, path) => {
        try {
          if (!fs.existsSync(path) || fs.statSync(path).isDirectory()) {
            return;
          }

          if (useIncremental && (event === 'change' || event === 'add')) {
            const result = await ingestSingleFileIncremental(adapter, path);
            if (result) {
              console.log(
                `Incremental update for ${path}: +${result.chunksAdded} ~${result.chunksModified} -${result.chunksDeleted} chunks (${result.processingTime}ms)`,
              );
            }
          } else {
            await ingestFiles(adapter);
            console.log('Full re-index after change:', event, path);
          }

          await indexer.embedNewChunks();
        } catch (e) {
          console.error('watch error', e);
        }
      });
    } else {
      console.log(`Usage:
  pnpm dev:ingest files [--incremental|-i]
  pnpm dev:ingest confluence
  pnpm dev:ingest watch [--incremental|-i]
  
Options:
  --incremental, -i  Use incremental indexing for better performance
`);
      await closeDatabase();
    }
  } catch (error) {
    console.error('Error:', error);
    await closeDatabase();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
