import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openDb } from "../ingest/db.js";
import { getEmbedder } from "../ingest/embeddings.js";
import { hybridSearch, SearchParams } from "../ingest/search.js";

const server = new McpServer({ name: "docsearch-mcp", version: "0.1.0" });

server.registerResource(
  "docchunk",
  new ResourceTemplate("docchunk://{id}", { list: undefined }),
  { title: "Document Chunk", description: "Retrieve an indexed chunk by id", mimeType: "text/markdown" },
  async (_uri, { id }) => {
    const db = openDb();
    const row = db.prepare(`
      select c.id, c.content, d.uri, d.title, d.path, d.repo, d.source, c.start_line, c.end_line
      from chunks c join documents d on d.id = c.document_id
      where c.id = ?
    `).get(Number(id));
    if (!row) return { contents: [{ uri: `docchunk://${id}`, text: "Not found" }] };
    const header = `# ${row.title || row.path || row.uri}\n\n` +
                   `> ${row.source} • ${row.repo || ''} ${row.path ? '• ' + row.path : ''} ` +
                   `${row.start_line ? '(lines ' + row.start_line + '-' + row.end_line + ')' : ''}\n\n`;
    return { contents: [{ uri: `docchunk://${id}`, text: header + row.content }] };
  }
);

server.registerTool(
  "doc-search",
  {
    title: "Search indexed docs",
    description: "Hybrid semantic+keyword search across local files and Confluence",
    inputSchema: {
      query: z.string(),
      topK: z.number().int().min(1).max(50).optional(),
      source: z.enum(['file','confluence']).optional(),
      repo: z.string().optional(),
      pathPrefix: z.string().optional(),
      mode: z.enum(['auto','vector','keyword']).optional()
    }
  },
  async (input) => {
    const db = openDb();
    const embedder = getEmbedder();
    const { kw, vec, binds, topK } = hybridSearch(db, input as SearchParams);
    const results: any[] = [];

    if (input.mode !== 'vector') {
      const rkw = kw.all({ query: input.query, k: topK, ...binds }) as any[];
      for (const r of rkw) results.push({ ...r, reason: 'keyword' });
    }

    if (input.mode !== 'keyword') {
      const q = await embedder.embed([input.query]);
      const rvec = vec.all({ embedding: q[0], k: topK, ...binds }) as any[];
      for (const r of rvec) results.push({ ...r, reason: 'vector' });
    }

    const byId = new Map<number, any>();
    for (const r of results) {
      const prev = byId.get(r.chunk_id);
      if (!prev) byId.set(r.chunk_id, r);
      else if (r.reason === 'vector' && prev.reason !== 'vector') byId.set(r.chunk_id, r);
    }

    const items = Array.from(byId.values()).slice(0, input.topK ?? 8);

    const content: any[] = [{ type: "text", text: `Found ${items.length} results for "${input.query}"` }];
    for (const r of items) {
      content.push({
        type: "resource_link",
        uri: `docchunk://${r.chunk_id}`,
        name: `${r.title || r.path || r.uri}`,
        description: `${r.source}${r.repo ? ' • ' + r.repo : ''}${r.path ? ' • ' + r.path : ''}`
      });
      const snippet = String(r.snippet || '').replace(/\s+/g, ' ').slice(0, 240);
      content.push({ type: "text", text: "— " + snippet + (snippet.length >= 240 ? "…" : "") });
    }

    return { content };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
