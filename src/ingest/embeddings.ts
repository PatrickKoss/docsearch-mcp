import { fetch } from 'undici';

import { CONFIG } from '../shared/config.js';

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
  private readonly maxRetries: number = 5;

  constructor() {
    if (!CONFIG.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY missing');
    }
    this.apiKey = CONFIG.OPENAI_API_KEY;
    this.baseURL = CONFIG.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.model = CONFIG.OPENAI_EMBED_MODEL;
    this.dim = CONFIG.OPENAI_EMBED_DIM;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseRetryAfter(retryAfter: string | null): number {
    if (!retryAfter) {
      return 0;
    }
    const seconds = parseInt(retryAfter, 10);
    return isNaN(seconds) ? 0 : seconds * 1000; // Convert to milliseconds
  }

  async embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
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

        if (response.ok) {
          const data = (await response.json()) as OpenAIEmbeddingResponse;
          return data.data.map((d) => new Float32Array(d.embedding));
        }

        // Handle rate limiting (429) with retry
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('retry-after');
          const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
          const remainingTokens = response.headers.get('x-ratelimit-remaining-tokens');
          const resetRequests = response.headers.get('x-ratelimit-reset-requests');
          const resetTokens = response.headers.get('x-ratelimit-reset-tokens');

          let waitTime = this.parseRetryAfter(retryAfterHeader);

          // If no retry-after header, use exponential backoff
          if (waitTime === 0) {
            waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
          }

          console.info(`\n⚠️  Rate limit exceeded (attempt ${attempt + 1}/${this.maxRetries})`);
          if (remainingRequests !== null) {
            console.info(`   Remaining requests: ${remainingRequests}`);
          }
          if (remainingTokens !== null) {
            console.info(`   Remaining tokens: ${remainingTokens}`);
          }
          if (resetRequests !== null) {
            console.info(`   Requests reset in: ${resetRequests}s`);
          }
          if (resetTokens !== null) {
            console.info(`   Tokens reset in: ${resetTokens}s`);
          }
          console.info(`   Waiting ${Math.round(waitTime / 1000)}s before retrying...`);

          if (attempt < this.maxRetries - 1) {
            await this.sleep(waitTime);
            continue;
          }
        }

        // Handle other HTTP errors
        const errorText = await response.text();
        lastError = new Error(`Embeddings API error ${response.status}: ${errorText}`);

        // Don't retry non-rate-limit errors
        throw lastError;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Embeddings API error')) {
          // If it's an HTTP error, don't retry (already handled above)
          throw error;
        }

        // If it's a network error, retry with exponential backoff
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.info(
            `\n🔄 Network error (attempt ${attempt + 1}/${this.maxRetries}): ${lastError.message}`,
          );
          console.info(`   Retrying in ${Math.round(waitTime / 1000)}s...`);
          await this.sleep(waitTime);
          continue;
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
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

export class NoOpEmbedder implements Embedder {
  public readonly dim: number = 1536;

  async embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    // Return zero vectors for testing/when no embeddings are needed
    return texts.map(() => new Float32Array(this.dim).fill(0.1));
  }
}

export function getEmbedder(): Embedder {
  if (CONFIG.EMBEDDINGS_PROVIDER === 'tei') {
    return new TEIEmbedder();
  }

  // Check if OpenAI API key is available
  if (CONFIG.OPENAI_API_KEY) {
    return new OpenAIEmbedder();
  }

  // Fallback to NoOp embedder for testing/development
  console.warn('No embeddings provider configured, using no-op embedder');
  return new NoOpEmbedder();
}
