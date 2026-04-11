import fs from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the config module
vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    ONLYOFFICE_URL: 'http://127.0.0.1:19876',
    ONLYOFFICE_JWT_SECRET: '',
    ONLYOFFICE_TIMEOUT: 5000,
  },
}));

import {
  convertLegacyOffice,
  isLegacyOffice,
  getLegacyOutputExt,
} from '../../src/ingest/parsers/onlyoffice.js';
import { CONFIG } from '../../src/shared/config.js';

describe('OnlyOffice Conversion', () => {
  describe('isLegacyOffice', () => {
    it('should return true for .doc files', () => {
      expect(isLegacyOffice('/path/to/file.doc')).toBe(true);
    });

    it('should return true for .xls files', () => {
      expect(isLegacyOffice('/path/to/file.xls')).toBe(true);
    });

    it('should return true for .ppt files', () => {
      expect(isLegacyOffice('/path/to/file.ppt')).toBe(true);
    });

    it('should return false for modern formats', () => {
      expect(isLegacyOffice('/path/to/file.docx')).toBe(false);
      expect(isLegacyOffice('/path/to/file.xlsx')).toBe(false);
      expect(isLegacyOffice('/path/to/file.pptx')).toBe(false);
      expect(isLegacyOffice('/path/to/file.txt')).toBe(false);
    });
  });

  describe('getLegacyOutputExt', () => {
    it('should map .doc to .docx', () => {
      expect(getLegacyOutputExt('/path/to/file.doc')).toBe('.docx');
    });

    it('should map .xls to .xlsx', () => {
      expect(getLegacyOutputExt('/path/to/file.xls')).toBe('.xlsx');
    });

    it('should map .ppt to .pptx', () => {
      expect(getLegacyOutputExt('/path/to/file.ppt')).toBe('.pptx');
    });

    it('should return undefined for non-legacy formats', () => {
      expect(getLegacyOutputExt('/path/to/file.txt')).toBeUndefined();
    });
  });

  describe('convertLegacyOffice', () => {
    let mockServer: Server;
    let convertedContent: Buffer;
    let lastRequestBody: Record<string, unknown> | null;

    beforeEach(() => {
      lastRequestBody = null;
      convertedContent = Buffer.from('converted-docx-content');
    });

    afterEach(async () => {
      if (mockServer) {
        await new Promise<void>((resolve) => mockServer.close(() => resolve()));
      }
    });

    function startMockOnlyOffice(
      responseHandler?: (body: Record<string, unknown>) => object,
    ): Promise<void> {
      return new Promise((resolve) => {
        mockServer = createServer((req, res) => {
          if (req.url === '/converter') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              lastRequestBody = JSON.parse(body);
              const response = responseHandler
                ? responseHandler(lastRequestBody!)
                : {
                    endConvert: true,
                    fileUrl: `http://127.0.0.1:19876/download/result.docx`,
                    percent: 100,
                  };
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            });
          } else if (req.url?.startsWith('/download/')) {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(convertedContent);
          } else {
            // This must be the ephemeral file server requesting the source file
            // Forward the request (the mock server doesn't need to do anything special)
            res.writeHead(404);
            res.end();
          }
        });
        mockServer.listen(19876, '127.0.0.1', () => resolve());
      });
    }

    it('should convert a .doc file via the OnlyOffice API', async () => {
      await startMockOnlyOffice();

      // Create a temporary .doc file
      const tempDoc = path.join(process.cwd(), 'test', 'fixtures-onlyoffice-test.doc');
      await fs.writeFile(tempDoc, 'legacy doc content');

      try {
        const resultPath = await convertLegacyOffice(tempDoc);
        expect(resultPath).toContain('.docx');

        const resultContent = await fs.readFile(resultPath);
        expect(resultContent.toString()).toBe('converted-docx-content');

        // Verify the API request
        expect(lastRequestBody).toBeDefined();
        expect(lastRequestBody!.filetype).toBe('doc');
        expect(lastRequestBody!.outputtype).toBe('docx');
        expect(lastRequestBody!.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);

        // Clean up
        await fs.unlink(resultPath).catch(() => {});
      } finally {
        await fs.unlink(tempDoc).catch(() => {});
      }
    });

    it('should throw when OnlyOffice returns an error code', async () => {
      await startMockOnlyOffice(() => ({ error: -3 }));

      const tempDoc = path.join(process.cwd(), 'test', 'fixtures-onlyoffice-error.doc');
      await fs.writeFile(tempDoc, 'legacy doc content');

      try {
        await expect(convertLegacyOffice(tempDoc)).rejects.toThrow(
          'OnlyOffice conversion error -3',
        );
      } finally {
        await fs.unlink(tempDoc).catch(() => {});
      }
    });

    it('should throw when OnlyOffice server is unreachable', async () => {
      // Don't start the mock server - simulate unreachable
      const mutableConfig = CONFIG as { ONLYOFFICE_URL: string };
      const originalUrl = mutableConfig.ONLYOFFICE_URL;
      mutableConfig.ONLYOFFICE_URL = 'http://127.0.0.1:19877';

      const tempDoc = path.join(process.cwd(), 'test', 'fixtures-onlyoffice-unreachable.doc');
      await fs.writeFile(tempDoc, 'legacy doc content');

      try {
        await expect(convertLegacyOffice(tempDoc)).rejects.toThrow('OnlyOffice server unreachable');
      } finally {
        mutableConfig.ONLYOFFICE_URL = originalUrl;
        await fs.unlink(tempDoc).catch(() => {});
      }
    });

    it('should throw on timeout', async () => {
      const mutableConfig = CONFIG as { ONLYOFFICE_TIMEOUT: number };
      const originalTimeout = mutableConfig.ONLYOFFICE_TIMEOUT;
      mutableConfig.ONLYOFFICE_TIMEOUT = 100; // 100ms timeout

      // Start a server that never responds
      await new Promise<void>((resolve) => {
        mockServer = createServer((_req, _res) => {
          // Never respond
        });
        mockServer.listen(19876, '127.0.0.1', () => resolve());
      });

      const tempDoc = path.join(process.cwd(), 'test', 'fixtures-onlyoffice-timeout.doc');
      await fs.writeFile(tempDoc, 'legacy doc content');

      try {
        await expect(convertLegacyOffice(tempDoc)).rejects.toThrow('timed out');
      } finally {
        mutableConfig.ONLYOFFICE_TIMEOUT = originalTimeout;
        await fs.unlink(tempDoc).catch(() => {});
      }
    });

    it('should throw for unsupported extensions', async () => {
      const tempFile = path.join(process.cwd(), 'test', 'fixtures-onlyoffice-bad.odt');
      await fs.writeFile(tempFile, 'content');

      try {
        await expect(convertLegacyOffice(tempFile)).rejects.toThrow('Unsupported legacy format');
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    it('should include JWT token when secret is configured', async () => {
      const mutableConfig = CONFIG as { ONLYOFFICE_JWT_SECRET: string };
      const originalSecret = mutableConfig.ONLYOFFICE_JWT_SECRET;
      mutableConfig.ONLYOFFICE_JWT_SECRET = 'test-secret-key';

      await startMockOnlyOffice();

      const tempDoc = path.join(process.cwd(), 'test', 'fixtures-onlyoffice-jwt.doc');
      await fs.writeFile(tempDoc, 'legacy doc content');

      try {
        const resultPath = await convertLegacyOffice(tempDoc);
        expect(lastRequestBody).toBeDefined();
        expect(lastRequestBody!.token).toBeDefined();
        expect(typeof lastRequestBody!.token).toBe('string');

        // Verify JWT structure (header.payload.signature)
        const parts = (lastRequestBody!.token as string).split('.');
        expect(parts).toHaveLength(3);

        // Decode and verify header
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        expect(header.alg).toBe('HS256');
        expect(header.typ).toBe('JWT');

        await fs.unlink(resultPath).catch(() => {});
      } finally {
        mutableConfig.ONLYOFFICE_JWT_SECRET = originalSecret;
        await fs.unlink(tempDoc).catch(() => {});
      }
    });

    it('should not include JWT token when no secret is configured', async () => {
      await startMockOnlyOffice();

      const tempDoc = path.join(process.cwd(), 'test', 'fixtures-onlyoffice-nojwt.doc');
      await fs.writeFile(tempDoc, 'legacy doc content');

      try {
        const resultPath = await convertLegacyOffice(tempDoc);
        expect(lastRequestBody).toBeDefined();
        expect(lastRequestBody!.token).toBeUndefined();

        await fs.unlink(resultPath).catch(() => {});
      } finally {
        await fs.unlink(tempDoc).catch(() => {});
      }
    });
  });
});
