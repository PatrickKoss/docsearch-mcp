import { fetch } from 'undici';

import type { EmbeddingService } from '../../domain/ports/embedding-service.js';

export interface TEIConfig {
  readonly endpoint: string;
  readonly dimensions: number;
}

interface TEIEmbeddingResponse {
  readonly data: Array<{
    readonly embedding: readonly number[];
  }>;
}

export class TEIEmbeddingService implements EmbeddingService {
  public readonly dimensions: number;
  private readonly config: TEIConfig;

  constructor(config: TEIConfig) {
    this.config = config;
    this.dimensions = config.dimensions;
  }

  async generateEmbeddings(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    const endpoint = this.config.endpoint.replace(/\/$/, '');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TEI Embedding Service error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as TEIEmbeddingResponse;
    return data.data.map((item) => new Float32Array(item.embedding));
  }
}
