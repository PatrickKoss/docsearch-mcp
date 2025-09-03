import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerDocumentResources } from './resources/document-resources.js';
import { registerIngestTools } from './tools/ingest-tools.js';
import { registerSearchTools } from './tools/search-tools.js';
import { ConfigAdapter } from '../application/adapters/config-adapter.js';
import { ApplicationFactory } from '../application/factories/application-factory.js';

// Initialize application
const config = ConfigAdapter.fromEnvironment();
const app = ApplicationFactory.create(config);

const server = new McpServer({ name: 'docsearch-mcp', version: '0.1.0' });

// Register all tools and resources
registerIngestTools(server, app);
registerSearchTools(server, app);
registerDocumentResources(server, app);

const transport = new StdioServerTransport();
await server.connect(transport);
