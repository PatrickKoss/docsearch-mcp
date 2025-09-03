import { fetch } from 'undici';

import type { EmbeddingService } from '../../domain/ports/embedding-service.js';

export interface OpenAIConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly dimensions: number;
}

interface OpenAIEmbeddingResponse {
  readonly data: Array<{
    readonly embedding: readonly number[];
  }>;
}

export class OpenAIEmbeddingService implements EmbeddingService {
  public readonly dimensions: number;
  private readonly config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.dimensions = config.dimensions;
  }

  async generateEmbeddings(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Embeddings API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;
    return data.data.map((item) => new Float32Array(item.embedding));
  }
}
