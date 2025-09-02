import 'dotenv/config';

function splitCsv(v: string, def: string) {
  const raw = (v && v.length) ? v : def;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export const CONFIG = {
  EMBEDDINGS_PROVIDER: process.env.EMBEDDINGS_PROVIDER || 'openai',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '',
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  OPENAI_EMBED_DIM: parseInt(process.env.OPENAI_EMBED_DIM || '1536', 10),
  TEI_ENDPOINT: process.env.TEI_ENDPOINT || '',

  CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL || '',
  CONFLUENCE_EMAIL: process.env.CONFLUENCE_EMAIL || '',
  CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN || '',
  CONFLUENCE_SPACES: splitCsv(process.env.CONFLUENCE_SPACES || '', ''),

  FILE_ROOTS: splitCsv(process.env.FILE_ROOTS || '', '.'),
  FILE_INCLUDE_GLOBS: splitCsv(process.env.FILE_INCLUDE_GLOBS || '', '**/*.{go,ts,tsx,js,py,rs,java,md,mdx,txt,yaml,yml,json}'),
  FILE_EXCLUDE_GLOBS: splitCsv(process.env.FILE_EXCLUDE_GLOBS || '', '**/{.git,node_modules,dist,build,target}/**'),

  DB_PATH: process.env.DB_PATH || './data/index.db',
};
