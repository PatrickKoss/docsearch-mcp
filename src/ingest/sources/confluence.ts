import { createHash } from 'node:crypto';

import TurndownService from 'turndown';

import { CONFIG } from '../../shared/config.js';
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

async function getChildPageIds(parentPageId: string): Promise<Set<string>> {
  const childIds = new Set<string>();
  const stack = [parentPageId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }
    childIds.add(currentId);

    let start = 0;
    const limit = 50;
    while (true) {
      try {
        const response = await cfFetch(
          `/rest/api/content/${currentId}/child/page?start=${start}&limit=${limit}`,
        );
        const children = response.results || [];
        for (const child of children) {
          if (child.id && !childIds.has(child.id)) {
            stack.push(child.id);
          }
        }
        if (!response._links || !response._links.next) {
          break;
        }
        start += limit;
      } catch (e) {
        console.warn(`Failed to get children for page ${currentId}:`, e);
        break;
      }
    }
  }

  return childIds;
}

function shouldIncludePage(title: string): boolean {
  const includePatterns = CONFIG.CONFLUENCE_TITLE_INCLUDES;
  const excludePatterns = CONFIG.CONFLUENCE_TITLE_EXCLUDES;

  if (excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (pattern.includes('*')) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`, 'i');
        if (regex.test(title)) {
          return false;
        }
      } else if (title.toLowerCase().includes(pattern.toLowerCase())) {
        return false;
      }
    }
  }

  if (includePatterns.length > 0) {
    for (const pattern of includePatterns) {
      if (pattern.includes('*')) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`, 'i');
        if (regex.test(title)) {
          return true;
        }
      } else if (title.toLowerCase().includes(pattern.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  return true;
}

export async function ingestConfluence(adapter: DatabaseAdapter) {
  if (!CONFIG.CONFLUENCE_BASE_URL || !CONFIG.CONFLUENCE_EMAIL || !CONFIG.CONFLUENCE_API_TOKEN) {
    console.warn('Confluence env missing; skipping');
    return;
  }
  const indexer = new Indexer(adapter);

  let allowedPageIds: Set<string> | null = null;

  if (CONFIG.CONFLUENCE_PARENT_PAGES.length > 0) {
    allowedPageIds = new Set<string>();
    console.log('Collecting pages under parent pages:', CONFIG.CONFLUENCE_PARENT_PAGES);

    for (const parentPageRef of CONFIG.CONFLUENCE_PARENT_PAGES) {
      try {
        const parentPageId = parentPageRef.trim();
        if (parentPageId) {
          const childIds = await getChildPageIds(parentPageId);
          childIds.forEach((id) => allowedPageIds?.add(id));
          console.log(`Found ${childIds.size} pages under parent ${parentPageId}`);
        }
      } catch (e) {
        console.warn(`Failed to get children for parent page ${parentPageRef}:`, e);
      }
    }

    if (allowedPageIds.size === 0) {
      console.warn('No pages found under specified parent pages');
      return;
    }
  }

  for (const space of CONFIG.CONFLUENCE_SPACES) {
    const metaKey = `confluence.lastSync.${space}`;
    const since = await indexer.getMeta(metaKey);
    const cql = since
      ? encodeURIComponent(`space="${space}" and type=page and lastmodified >= ${since}`)
      : encodeURIComponent(`space="${space}" and type=page`);
    let start = 0;
    const limit = 50;
    let processedCount = 0;
    let skippedCount = 0;

    while (true) {
      const page = await cfFetch(`/rest/api/search?cql=${cql}&start=${start}&limit=${limit}`);
      const results = page.results || [];
      for (const r of results) {
        const id = r.content?.id || r.id;
        if (!id) {
          continue;
        }

        if (allowedPageIds && !allowedPageIds.has(id)) {
          skippedCount++;
          continue;
        }

        const detail = await cfFetch(
          `/rest/api/content/${id}?expand=body.storage,version,space,_links,ancestors`,
        );
        const title = detail.title;

        if (!shouldIncludePage(title)) {
          skippedCount++;
          console.log(`Skipping page "${title}" due to title filters`);
          continue;
        }

        const storage = detail.body?.storage?.value || '';
        const md = td.turndown(storage);
        const uri = `confluence://${id}`;
        const version = String(detail.version?.number ?? '');
        const hash = sha256(md + version);

        const ancestors = detail.ancestors || [];
        const ancestorTitles = ancestors.map((a: { title: string }) => a.title).join(' > ');

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
          extraJson: JSON.stringify({
            space: detail.space?.key,
            webui: detail._links?.webui,
            ancestors: ancestorTitles,
          }),
        });

        const hasChunks = await adapter.hasChunks(docId);
        if (!hasChunks) {
          await indexer.insertChunks(docId, chunkDoc(md));
        }

        processedCount++;
      }
      if (!page._links || !page._links.next) {
        break;
      }
      start += limit;
    }

    console.log(`Space ${space}: Processed ${processedCount} pages, skipped ${skippedCount}`);
    await indexer.setMeta(metaKey, new Date().toISOString());
  }
}

function sha256(txt: string) {
  const h = createHash('sha256');
  h.update(txt);
  return h.digest('hex');
}
