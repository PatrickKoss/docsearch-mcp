import { createHash } from 'node:crypto';

export function sha256(text: string): string {
  const h = createHash('sha256');
  h.update(text);
  return h.digest('hex');
}
