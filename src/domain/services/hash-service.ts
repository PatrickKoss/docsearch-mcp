import { createHash } from 'node:crypto';

export interface HashService {
  generateContentHash(content: string): string;
  generateFileHash(content: string, filePath: string): string;
}

export class CryptoHashService implements HashService {
  generateContentHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  generateFileHash(content: string, filePath: string): string {
    // Combine content and file path for a unique hash
    const combined = `${filePath}:${content}`;
    return createHash('sha256').update(combined, 'utf8').digest('hex');
  }
}
