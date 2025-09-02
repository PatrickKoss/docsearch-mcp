import { existsSync, rmSync } from 'fs';

import { beforeEach } from 'vitest';

const TEST_DB_PATH = './test/test.db';

// Polyfill File constructor for Node.js environment (needed by undici in testcontainers)
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File {
    constructor(fileBits: BlobPart[], fileName: string, options?: FilePropertyBag) {
      // Basic polyfill that should satisfy undici's usage
      this.name = fileName;
      this.lastModified = options?.lastModified || Date.now();
      this.type = options?.type || '';
    }

    name: string;
    lastModified: number;
    type: string;
  } as any;
}

beforeEach(() => {
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH, { force: true });
  }
});

export const testDbPath = TEST_DB_PATH;
