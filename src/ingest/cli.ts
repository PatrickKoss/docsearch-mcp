#!/usr/bin/env -S node --enable-source-maps
import fs from 'node:fs';

import chokidar from 'chokidar';

import { getDatabase, closeDatabase } from './database.js';
import { Indexer } from './indexer.js';
import { ingestConfluence } from './sources/confluence.js';
import { ingestFiles } from './sources/files.js';

async function main() {
  const cmd = process.argv[2] || 'help';
  const adapter = await getDatabase();
  const indexer = new Indexer(adapter);

  try {
    if (cmd === 'files') {
      await ingestFiles(adapter);
      await indexer.embedNewChunks();
      console.log('Files ingested.');
    } else if (cmd === 'confluence') {
      await ingestConfluence(adapter);
      await indexer.embedNewChunks();
      console.log('Confluence ingested.');
    } else if (cmd === 'watch') {
      console.log('Watching for changes...');
      const watcher = chokidar.watch(process.cwd(), {
        ignored: /(^|[/])\.(git|hg)|node_modules|dist|build|target/,
        ignoreInitial: true,
      });
      watcher.on('all', async (event, path) => {
        try {
          if (!fs.existsSync(path) || fs.statSync(path).isDirectory()) {
            return;
          }
          await ingestFiles(adapter); // simple rescan
          await indexer.embedNewChunks();
          console.log('Re-indexed after change:', event, path);
        } catch (e) {
          console.error('watch error', e);
        }
      });
    } else {
      console.log(`Usage:
  pnpm dev:ingest files
  pnpm dev:ingest confluence
  pnpm dev:ingest watch
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
