import { readFile } from 'fs/promises';

import { fetch } from 'undici';

import { CONFIG } from '../shared/config.js';

export interface ImageToTextProvider {
  describeImage(imagePath: string): Promise<string>;
}

interface OpenAIVisionMessage {
  role: 'user';
  content: Array<
    | {
        type: 'text';
        text: string;
      }
    | {
        type: 'image_url';
        image_url: {
          url: string;
        };
      }
  >;
}

interface OpenAIVisionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenAIImageToTextProvider implements ImageToTextProvider {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly model: string;

  constructor() {
    if (!CONFIG.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY missing for image-to-text');
    }
    this.apiKey = CONFIG.OPENAI_API_KEY;
    this.baseURL = CONFIG.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.model = CONFIG.IMAGE_TO_TEXT_MODEL;
  }

  async describeImage(imagePath: string): Promise<string> {
    try {
      // Read and encode image as base64
      const imageBuffer = await readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      const message: OpenAIVisionMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in detail, focusing on any text, diagrams, charts, code snippets, or technical content that would be useful for search and indexing. If this is a screenshot of code or documentation, include the visible text content.',
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
            },
          },
        ],
      };

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [message],
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vision API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as OpenAIVisionResponse;
      return data.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      console.warn(`Failed to describe image ${imagePath}:`, error);
      return '';
    }
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'svg':
        return 'image/svg+xml';
      default:
        return 'image/png';
    }
  }
}

export function getImageToTextProvider(): ImageToTextProvider | null {
  if (!CONFIG.ENABLE_IMAGE_TO_TEXT) {
    return null;
  }

  if (CONFIG.IMAGE_TO_TEXT_PROVIDER === 'openai') {
    return new OpenAIImageToTextProvider();
  }

  return null;
}
