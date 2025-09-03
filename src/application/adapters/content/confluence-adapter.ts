import { createHash } from 'node:crypto';

import TurndownService from 'turndown';

export interface ConfluenceConfig {
  readonly baseUrl: string;
  readonly email: string;
  readonly apiToken: string;
  readonly spaces: readonly string[];
}

export interface ConfluencePage {
  readonly id: string;
  readonly title: string;
  readonly spaceKey: string;
  readonly htmlContent: string;
  readonly version: string;
  readonly lastModified: Date;
  readonly webUrl: string;
}

export interface ConfluenceAdapter {
  getPages(config: ConfluenceConfig): Promise<readonly ConfluencePage[]>;
  convertHtmlToMarkdown(html: string): string;
  generateContentHash(content: string): string;
}

export class RestConfluenceAdapter implements ConfluenceAdapter {
  private readonly turndownService = new TurndownService({ headingStyle: 'atx' });

  async getPages(config: ConfluenceConfig): Promise<readonly ConfluencePage[]> {
    if (!config.baseUrl || !config.email || !config.apiToken) {
      throw new Error('Confluence configuration missing required fields');
    }

    const pages: ConfluencePage[] = [];

    for (const spaceKey of config.spaces) {
      try {
        const spacePages = await this.getSpacePages(config, spaceKey);
        pages.push(...spacePages);
      } catch (error) {
        console.warn(`Failed to fetch pages from space ${spaceKey}:`, error);
      }
    }

    return pages;
  }

  convertHtmlToMarkdown(html: string): string {
    return this.turndownService.turndown(html);
  }

  generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private async getSpacePages(
    config: ConfluenceConfig,
    spaceKey: string,
  ): Promise<readonly ConfluencePage[]> {
    const pages: ConfluencePage[] = [];
    let start = 0;
    const limit = 50;

    while (true) {
      const response = await this.confluenceFetch(
        config,
        `/wiki/rest/api/content?spaceKey=${spaceKey}&type=page&status=current&expand=body.storage,version,metadata.labels&start=${start}&limit=${limit}`,
      );

      const data = response.results as unknown[];
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      for (const item of data) {
        if (this.isValidConfluencePage(item)) {
          pages.push({
            id: item.id,
            title: item.title,
            spaceKey,
            htmlContent: item.body?.storage?.value || '',
            version: item.version?.number?.toString() || '1',
            lastModified: new Date(item.version?.when || Date.now()),
            webUrl: `${config.baseUrl.replace(/\/$/, '')}${item._links?.webui || ''}`,
          });
        }
      }

      if (data.length < limit) {
        break;
      }
      start += limit;
    }

    return pages;
  }

  private async confluenceFetch(config: ConfluenceConfig, path: string): Promise<any> {
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}${path}`;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Confluence API error ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  private isValidConfluencePage(item: unknown): item is {
    id: string;
    title: string;
    body?: { storage?: { value: string } };
    version?: { number: number; when: string };
    _links?: { webui: string };
  } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      'title' in item &&
      typeof (item as any).id === 'string' &&
      typeof (item as any).title === 'string'
    );
  }
}
