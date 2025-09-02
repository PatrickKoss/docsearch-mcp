import { CONFIG } from '../shared/config.js';
import { fetch } from 'undici';

export interface Embedder {
  dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export class OpenAIEmbedder implements Embedder {
  public dim: number;
  private model: string;
  private apiKey: string;
  private baseURL: string;

  constructor() {
    if (!CONFIG.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
    this.apiKey = CONFIG.OPENAI_API_KEY;
    this.baseURL = CONFIG.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.model = CONFIG.OPENAI_EMBED_MODEL;
    this.dim = CONFIG.OPENAI_EMBED_DIM;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!response.ok) {
      throw new Error(`Embeddings API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data.map((d: any) => new Float32Array(d.embedding));
  }
}

export class TEIEmbedder implements Embedder {
  public dim: number;
  private endpoint: string;
  constructor() {
    if (!CONFIG.TEI_ENDPOINT) throw new Error('TEI_ENDPOINT missing');
    this.endpoint = CONFIG.TEI_ENDPOINT.replace(/\/$/, '');
    this.dim = CONFIG.OPENAI_EMBED_DIM; // set to your TEI dim via env
  }
  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const r = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: texts })
    });
    if (!r.ok) {
      throw new Error(`TEI error ${r.status}: ${await r.text()}`);
    }
    const data = await r.json() as any;
    return data.data.map((d: any) => new Float32Array(d.embedding));
  }
}

export function getEmbedder(): Embedder {
  if (CONFIG.EMBEDDINGS_PROVIDER === 'tei') return new TEIEmbedder();
  return new OpenAIEmbedder();
}
