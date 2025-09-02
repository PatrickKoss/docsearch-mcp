// Setup file for integration tests
// Polyfills for Node.js compatibility

if (typeof globalThis.File === 'undefined') {
  // Simple File polyfill for Node.js
  globalThis.File = class File {
    name: string;
    size: number = 0;
    type: string = '';
    lastModified: number = Date.now();

    constructor(fileBits: any[], fileName: string, options: any = {}) {
      this.name = fileName;
      this.type = options.type || '';
      this.lastModified = options.lastModified || Date.now();
    }
  } as any;
}
