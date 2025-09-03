import {
  SqliteDocumentRepository,
  type SqliteDatabaseConfig,
} from '../repositories/sqlite-document-repository.js';
import { SqliteMetadataRepository } from '../repositories/sqlite-metadata-repository.js';
import { SqliteSearchRepository } from '../repositories/sqlite-search-repository.js';

import type Database from 'better-sqlite3';

export interface DatabaseDependencies {
  readonly documentRepository: SqliteDocumentRepository;
  readonly searchRepository: SqliteSearchRepository;
  readonly metadataRepository: SqliteMetadataRepository;
}

export class DatabaseFactory {
  private documentRepository: SqliteDocumentRepository | null = null;
  private searchRepository: SqliteSearchRepository | null = null;
  private metadataRepository: SqliteMetadataRepository | null = null;

  create(config: SqliteDatabaseConfig): DatabaseDependencies {
    // Create document repository which initializes the database
    this.documentRepository = new SqliteDocumentRepository(config);

    // Get the underlying database instance
    const db = this.getSharedDatabaseInstance(this.documentRepository);

    // Create other repositories that share the same database
    this.searchRepository = new SqliteSearchRepository(db);
    this.metadataRepository = new SqliteMetadataRepository(db);

    return {
      documentRepository: this.documentRepository,
      searchRepository: this.searchRepository,
      metadataRepository: this.metadataRepository,
    };
  }

  close(): void {
    if (this.documentRepository) {
      this.documentRepository.close();
      this.documentRepository = null;
      this.searchRepository = null;
      this.metadataRepository = null;
    }
  }

  private getSharedDatabaseInstance(repository: SqliteDocumentRepository): Database.Database {
    // Get the database instance through the public getter method
    return repository.getDatabaseInstance();
  }
}
