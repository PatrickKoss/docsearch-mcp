import { fetch } from 'undici';

import { CONFIG } from '../../shared/config/legacy-config.js';

export interface Embedder {
  readonly dim: number;
  embed(texts: readonly string[]): Promise<readonly Float32Array[]>;
}

interface OpenAIEmbeddingData {
  readonly embedding: readonly number[];
}

interface OpenAIEmbeddingResponse {
  readonly data: readonly OpenAIEmbeddingData[];
}

interface TEIEmbeddingData {
  readonly embedding: readonly number[];
}

interface TEIEmbeddingResponse {
  readonly data: readonly TEIEmbeddingData[];
}

export class OpenAIEmbedder implements Embedder {
  public readonly dim: number;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor() {
    if (!CONFIG.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY missing');
    }
    this.apiKey = CONFIG.OPENAI_API_KEY;
    this.baseURL = CONFIG.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.model = CONFIG.OPENAI_EMBED_MODEL;
    this.dim = CONFIG.OPENAI_EMBED_DIM;
  }

  async embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embeddings API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;
    return data.data.map((d) => new Float32Array(d.embedding));
  }
}

export class TEIEmbedder implements Embedder {
  public readonly dim: number;
  private readonly endpoint: string;

  constructor() {
    if (!CONFIG.TEI_ENDPOINT) {
      throw new Error('TEI_ENDPOINT missing');
    }
    this.endpoint = CONFIG.TEI_ENDPOINT.replace(/\/$/, '');
    this.dim = CONFIG.OPENAI_EMBED_DIM;
  }

  async embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: texts }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TEI error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as TEIEmbeddingResponse;
    return data.data.map((d) => new Float32Array(d.embedding));
  }
}

export function getEmbedder(): Embedder {
  if (CONFIG.EMBEDDINGS_PROVIDER === 'tei') {
    return new TEIEmbedder();
  }
  return new OpenAIEmbedder();
}
