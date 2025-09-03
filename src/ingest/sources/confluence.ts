import { createHash } from 'node:crypto';

import TurndownService from 'turndown';

import { CONFIG } from '../../infrastructure/config/legacy-config.js';
import { chunkDoc } from '../chunker.js';
import { Indexer } from '../indexer.js';

import type { DatabaseAdapter } from '../adapters/index.js';

const td = new TurndownService({ headingStyle: 'atx' });

async function cfFetch(path: string) {
  const base = CONFIG.CONFLUENCE_BASE_URL.replace(/\/$/, '');
  const url = `${base}${path}`;
  const auth = Buffer.from(`${CONFIG.CONFLUENCE_EMAIL}:${CONFIG.CONFLUENCE_API_TOKEN}`).toString(
    'base64',
  );
  const r = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!r.ok) {
    throw new Error(`Confluence ${r.status}: ${await r.text()}`);
  }
  return r.json();
}

export async function ingestConfluence(adapter: DatabaseAdapter) {
  if (!CONFIG.CONFLUENCE_BASE_URL || !CONFIG.CONFLUENCE_EMAIL || !CONFIG.CONFLUENCE_API_TOKEN) {
    console.warn('Confluence env missing; skipping');
    return;
  }
  const indexer = new Indexer(adapter);
  for (const space of CONFIG.CONFLUENCE_SPACES) {
    const metaKey = `confluence.lastSync.${space}`;
    const since = await indexer.getMeta(metaKey);
    const cql = since
      ? encodeURIComponent(`space="${space}" and type=page and lastmodified >= ${since}`)
      : encodeURIComponent(`space="${space}" and type=page`);
    let start = 0;
    const limit = 50;
    while (true) {
      const page = await cfFetch(`/rest/api/search?cql=${cql}&start=${start}&limit=${limit}`);
      const results = page.results || [];
      for (const r of results) {
        const id = r.content?.id || r.id;
        if (!id) {
          continue;
        }
        const detail = await cfFetch(
          `/rest/api/content/${id}?expand=body.storage,version,space,_links`,
        );
        const title = detail.title;
        const storage = detail.body?.storage?.value || '';
        const md = td.turndown(storage);
        const uri = `confluence://${id}`;
        const version = String(detail.version?.number ?? '');
        const hash = sha256(md + version);
        const docId = await indexer.upsertDocument({
          source: 'confluence',
          uri,
          repo: null,
          path: null,
          title,
          lang: 'md',
          hash,
          mtime: Date.parse(
            detail.version?.when || detail.history?.createdDate || new Date().toISOString(),
          ),
          version,
          extraJson: JSON.stringify({ space: detail.space?.key, webui: detail._links?.webui }),
        });

        const hasChunks = await adapter.hasChunks(docId);
        if (!hasChunks) {
          await indexer.insertChunks(docId, chunkDoc(md));
        }
      }
      if (!page._links || !page._links.next) {
        break;
      }
      start += limit;
    }
    await indexer.setMeta(metaKey, new Date().toISOString());
  }
}

function sha256(txt: string) {
  const h = createHash('sha256');
  h.update(txt);
  return h.digest('hex');
}
