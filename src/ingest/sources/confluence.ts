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

  // Support both Confluence Cloud (Basic auth) and Server (Bearer token)
  let authHeader: string;
  if (!CONFIG.CONFLUENCE_API_TOKEN) {
    throw new Error('Confluence API token missing');
  }

  if (CONFIG.CONFLUENCE_AUTH_METHOD === 'bearer') {
    // Confluence Server with Personal Access Token
    authHeader = `Bearer ${CONFIG.CONFLUENCE_API_TOKEN}`;
  } else {
    // Confluence Cloud with API token (Basic auth)
    if (!CONFIG.CONFLUENCE_EMAIL) {
      throw new Error('Confluence email required for basic authentication');
    }
    const auth = Buffer.from(`${CONFIG.CONFLUENCE_EMAIL}:${CONFIG.CONFLUENCE_API_TOKEN}`).toString(
      'base64',
    );
    authHeader = `Basic ${auth}`;
  }

  const r = await fetch(url, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
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
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage.includes('404')) {
          console.warn(`Page ${currentId} not found or not accessible, skipping children`);
        } else {
          console.warn(`Failed to get children for page ${currentId}:`, errorMessage);
        }
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
  if (!CONFIG.CONFLUENCE_BASE_URL || !CONFIG.CONFLUENCE_API_TOKEN) {
    console.warn('Confluence env missing; skipping');
    return;
  }

  if (CONFIG.CONFLUENCE_AUTH_METHOD === 'basic' && !CONFIG.CONFLUENCE_EMAIL) {
    console.warn('Confluence email required for basic authentication; skipping');
    return;
  }

  const indexer = new Indexer(adapter);

  let allowedPageIds: Set<string> | null = null;

  if (CONFIG.CONFLUENCE_PARENT_PAGES.length > 0) {
    allowedPageIds = new Set<string>();
    console.info('Collecting pages under parent pages:', CONFIG.CONFLUENCE_PARENT_PAGES);

    for (const parentPageRef of CONFIG.CONFLUENCE_PARENT_PAGES) {
      try {
        const parentPageId = parentPageRef.trim();
        if (parentPageId) {
          const childIds = await getChildPageIds(parentPageId);
          childIds.forEach((id) => allowedPageIds?.add(id));
          console.info(`Found ${childIds.size} pages under parent ${parentPageId}`);
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn(`Failed to get children for parent page ${parentPageRef}: ${errorMessage}`);
      }
    }

    if (allowedPageIds.size === 0) {
      console.warn('No pages found under specified parent pages. This might be due to:');
      console.warn('- Parent page IDs are incorrect');
      console.warn('- Pages are not accessible with current credentials');
      console.warn('- Pages have no children');
      console.warn('Proceeding to search all pages in the space instead...');
      allowedPageIds = null; // Allow all pages
    } else {
      console.info(`Total allowed page IDs: ${allowedPageIds.size}`);
      console.info('Allowed page IDs:', Array.from(allowedPageIds).slice(0, 10)); // Show first 10
    }
  }

  for (const space of CONFIG.CONFLUENCE_SPACES) {
    const metaKey = `confluence.lastSync.${space}`;
    const since = await indexer.getMeta(metaKey);
    let cql: string;
    if (since) {
      // Confluence CQL doesn't support timestamp filtering reliably across different versions
      // Fall back to full space search for reliability
      console.info(`Incremental sync requested but using full sync for reliability`);
      cql = encodeURIComponent(`space="${space}" and type=page`);
    } else {
      cql = encodeURIComponent(`space="${space}" and type=page`);
    }
    let start = 0;
    const limit = 50;
    let processedCount = 0;
    let skippedCount = 0;

    const searchResultIds = new Set<string>();
    const processedIds = new Set<string>();

    // First, process all pages found by space search
    while (true) {
      const page = await cfFetch(`/rest/api/search?cql=${cql}&start=${start}&limit=${limit}`);
      const results = page.results || [];
      for (const r of results) {
        const id = r.content?.id || r.id;
        if (!id) {
          continue;
        }

        searchResultIds.add(id);
        processedIds.add(id);

        try {
          const detail = await cfFetch(
            `/rest/api/content/${id}?expand=body.storage,version,space,_links,ancestors`,
          );
          const title = detail.title;

          if (!shouldIncludePage(title)) {
            skippedCount++;
            console.info(`Skipping page "${title}" due to title filters`);
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
        } catch (error) {
          console.warn(
            `Failed to process page ${id}:`,
            error instanceof Error ? error.message : error,
          );
          skippedCount++;
        }
      }
      if (!page._links || !page._links.next) {
        break;
      }
      start += limit;
    }

    // Now process allowed pages that weren't found in the search
    if (allowedPageIds) {
      const missingPages = Array.from(allowedPageIds).filter((id) => !processedIds.has(id));
      console.info(
        `Processing ${missingPages.length} additional pages from parent page collection`,
      );

      for (const id of missingPages) {
        try {
          const detail = await cfFetch(
            `/rest/api/content/${id}?expand=body.storage,version,space,_links,ancestors`,
          );

          // Check if this page is in the correct space
          if (detail.space?.key !== space) {
            console.info(
              `Skipping page ${id} - belongs to space ${detail.space?.key}, not ${space}`,
            );
            continue;
          }

          const title = detail.title;

          if (!shouldIncludePage(title)) {
            skippedCount++;
            console.info(`Skipping page "${title}" due to title filters`);
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
          console.info(`Processed additional page: ${title} (${id})`);
        } catch (error) {
          console.warn(
            `Failed to process allowed page ${id}:`,
            error instanceof Error ? error.message : error,
          );
          skippedCount++;
        }
      }
    }

    console.info(
      `Space ${space}: Total processed ${processedCount} pages, skipped ${skippedCount}`,
    );
    console.info(
      `Search found ${searchResultIds.size} pages, parent pages collected ${allowedPageIds?.size || 0} pages`,
    );

    await indexer.setMeta(metaKey, new Date().toISOString());
  }
}

function sha256(txt: string) {
  const h = createHash('sha256');
  h.update(txt);
  return h.digest('hex');
}
