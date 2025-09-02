#!/usr/bin/env -S node --enable-source-maps
import { openDb } from './db.js';
import { ingestFiles } from './sources/files.js';
import { ingestConfluence } from './sources/confluence.js';
import { Indexer } from './indexer.js';
import chokidar from 'chokidar';
import fs from 'node:fs';

async function main() {
  const cmd = process.argv[2] || 'help';
  const db = openDb();
  const indexer = new Indexer(db);

  if (cmd === 'files') {
    await ingestFiles(db);
    await indexer.embedNewChunks();
    console.log('Files ingested.');
  } else if (cmd === 'confluence') {
    await ingestConfluence(db);
    await indexer.embedNewChunks();
    console.log('Confluence ingested.');
  } else if (cmd === 'watch') {
    console.log('Watching for changes...');
    const watcher = chokidar.watch(process.cwd(), { ignored: /(^|[\/])\.(git|hg)|node_modules|dist|build|target/, ignoreInitial: true });
    watcher.on('all', async (event, path) => {
      try {
        if (!fs.existsSync(path) || fs.statSync(path).isDirectory()) return;
        await ingestFiles(db); // simple rescan
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
  }
}

main().catch(e => { console.error(e); process.exit(1); });
