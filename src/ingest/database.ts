import { createDatabaseAdapter } from './adapters/index.js';

import type { DatabaseAdapter } from './adapters/index.js';

let _adapter: DatabaseAdapter | null = null;

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (!_adapter) {
    _adapter = createDatabaseAdapter();
    await _adapter.init();
  }
  return _adapter;
}

export async function closeDatabase(): Promise<void> {
  if (_adapter) {
    await _adapter.close();
    _adapter = null;
  }
}
