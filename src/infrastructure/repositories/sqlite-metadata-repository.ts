import type { MetadataRepository } from '../../domain/ports/metadata-repository.js';
import type Database from 'better-sqlite3';

export class SqliteMetadataRepository implements MetadataRepository {
  private readonly db: Database.Database;
  private readonly getValueStmt: Database.Statement;
  private readonly setValueStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeSchema();

    this.getValueStmt = this.db.prepare('SELECT value FROM meta WHERE key = ?');
    this.setValueStmt = this.db.prepare(`
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
  }

  async getValue(key: string): Promise<string | null> {
    const result = this.getValueStmt.get(key) as { value: string } | undefined;
    return result?.value || null;
  }

  async setValue(key: string, value: string): Promise<void> {
    this.setValueStmt.run(key, value);
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }
}
