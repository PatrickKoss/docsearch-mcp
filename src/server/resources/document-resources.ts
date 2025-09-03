import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Application } from '../../application/factories/application-factory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerDocumentResources(server: McpServer, app: Application): void {
  server.registerResource(
    'docchunk',
    new ResourceTemplate('docchunk://{id}', { list: undefined }),
    {
      title: 'Document Chunk',
      description: 'Retrieve an indexed chunk by id',
      mimeType: 'text/markdown',
    },
    async (_uri, { id }) => {
      const response = await app.useCases.getChunkContent.execute({ chunkId: Number(id) });
      const chunkContent = response.chunk;

      if (!chunkContent) {
        return { contents: [{ uri: `docchunk://${id}`, text: 'Not found' }] };
      }

      const title = chunkContent.title || chunkContent.path || chunkContent.uri;
      const location = chunkContent.path ? `• ${chunkContent.path}` : '';
      const lines = chunkContent.startLine
        ? `(lines ${chunkContent.startLine}-${chunkContent.endLine})`
        : '';
      const header = `# ${title}\n\n> ${chunkContent.source} • ${chunkContent.repo || ''} ${location} ${lines}\n\n`;

      return { contents: [{ uri: `docchunk://${id}`, text: header + chunkContent.content }] };
    },
  );
}
