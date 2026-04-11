import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { CONFIG } from '../../shared/config.js';

interface ConversionResponse {
  endConvert?: boolean;
  fileUrl?: string;
  percent?: number;
  error?: number;
}

const FORMAT_MAP: Record<string, string> = {
  '.doc': '.docx',
  '.xls': '.xlsx',
  '.ppt': '.pptx',
};

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function startFileServer(filePath: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const token = crypto.randomUUID();
    const servePath = `/${token}/${path.basename(filePath)}`;

    const server = createServer((req, res) => {
      if (req.url === servePath) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({
        server,
        url: `http://127.0.0.1:${addr.port}${servePath}`,
      });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

export async function convertLegacyOffice(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const outputExt = FORMAT_MAP[ext];
  if (!outputExt) {
    throw new Error(`Unsupported legacy format: ${ext}`);
  }

  const onlyofficeUrl = CONFIG.ONLYOFFICE_URL;
  if (!onlyofficeUrl) {
    throw new Error('ONLYOFFICE_URL is not configured');
  }

  const { server, url: fileUrl } = await startFileServer(filePath);
  const tempPath = path.join(os.tmpdir(), `docsearch-${crypto.randomUUID()}${outputExt}`);

  try {
    const inputType = ext.slice(1);
    const outputType = outputExt.slice(1);
    const key = crypto.randomUUID();

    const payload: Record<string, unknown> = {
      filetype: inputType,
      outputtype: outputType,
      key,
      url: fileUrl,
    };

    if (CONFIG.ONLYOFFICE_JWT_SECRET) {
      payload.token = signJwt(payload, CONFIG.ONLYOFFICE_JWT_SECRET);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.ONLYOFFICE_TIMEOUT);

    let response: Response;
    try {
      response = await fetch(`${onlyofficeUrl}/converter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(
          `OnlyOffice conversion timed out after ${CONFIG.ONLYOFFICE_TIMEOUT}ms for ${filePath}`,
          { cause: err },
        );
      }
      throw new Error(
        `OnlyOffice server unreachable at ${onlyofficeUrl}: ${(err as Error).message}`,
        { cause: err },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`OnlyOffice API returned HTTP ${response.status} for ${filePath}`);
    }

    const result = (await response.json()) as ConversionResponse;

    if (result.error) {
      throw new Error(`OnlyOffice conversion error ${result.error} for ${filePath}`);
    }

    if (!result.endConvert || !result.fileUrl) {
      throw new Error(`OnlyOffice conversion incomplete for ${filePath}`);
    }

    // Download the converted file
    const downloadResponse = await fetch(result.fileUrl);
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download converted file: HTTP ${downloadResponse.status}`);
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    await fs.writeFile(tempPath, Buffer.from(arrayBuffer));

    return tempPath;
  } catch (err) {
    // Clean up temp file on error
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  } finally {
    await stopServer(server);
  }
}

export function isLegacyOffice(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() in FORMAT_MAP;
}

export function getLegacyOutputExt(filePath: string): string | undefined {
  return FORMAT_MAP[path.extname(filePath).toLowerCase()];
}
