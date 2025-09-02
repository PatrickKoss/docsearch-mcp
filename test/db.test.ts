import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, DbConfig } from '../src/ingest/db.js'
import { testDbPath } from './setup.js'
import { existsSync } from 'fs'

describe('Database', () => {
  let db: ReturnType<typeof openDb>

  beforeEach(() => {
    db = openDb({ path: testDbPath, embeddingDim: 1536 })
  })

  afterEach(() => {
    try {
      if (db) {
        db.close()
      }
    } catch (e) {
      // Ignore close errors in tests
    }
  })

  describe('openDb', () => {
    it('should create database file', () => {
      expect(existsSync(testDbPath)).toBe(true)
    })

    it('should create all required tables', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      const tableNames = tables.map((t: any) => t.name)
      
      expect(tableNames).toContain('documents')
      expect(tableNames).toContain('chunks')
      expect(tableNames).toContain('chunk_vec_map')
      expect(tableNames).toContain('meta')
      expect(tableNames).toContain('vec_chunks')
      expect(tableNames).toContain('chunks_fts')
    })

    it('should set proper pragmas', () => {
      const journalMode = db.pragma('journal_mode', { simple: true })
      const synchronous = db.pragma('synchronous', { simple: true })
      const cacheSize = db.pragma('cache_size', { simple: true })

      expect(journalMode).toBe('wal')
      expect(synchronous).toBe(1) // NORMAL
      expect(cacheSize).toBe(10000)
    })

    it('should use custom config when provided', () => {
      const customDb = openDb({ path: './test/custom.db', embeddingDim: 512 })
      try {
        expect(existsSync('./test/custom.db')).toBe(true)
      } finally {
        customDb.close()
      }
    })
  })

  describe('Schema integrity', () => {
    it('should have proper document table structure', () => {
      const columns = db.prepare("PRAGMA table_info(documents)").all()
      const columnNames = columns.map((c: any) => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('source')
      expect(columnNames).toContain('uri')
      expect(columnNames).toContain('repo')
      expect(columnNames).toContain('path')
      expect(columnNames).toContain('title')
      expect(columnNames).toContain('lang')
      expect(columnNames).toContain('hash')
      expect(columnNames).toContain('mtime')
      expect(columnNames).toContain('version')
      expect(columnNames).toContain('extra_json')
    })

    it('should have proper chunks table structure', () => {
      const columns = db.prepare("PRAGMA table_info(chunks)").all()
      const columnNames = columns.map((c: any) => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('document_id')
      expect(columnNames).toContain('chunk_index')
      expect(columnNames).toContain('content')
      expect(columnNames).toContain('start_line')
      expect(columnNames).toContain('end_line')
      expect(columnNames).toContain('token_count')
    })

    it('should maintain referential integrity', () => {
      const insertDoc = db.prepare(`
        INSERT INTO documents (source, uri, hash) 
        VALUES (?, ?, ?)
      `)
      const docId = insertDoc.run('file', 'test://doc1', 'hash123').lastInsertRowid

      const insertChunk = db.prepare(`
        INSERT INTO chunks (document_id, chunk_index, content) 
        VALUES (?, ?, ?)
      `)
      insertChunk.run(docId, 0, 'test content')

      expect(() => {
        insertChunk.run(999999, 0, 'invalid doc reference')
      }).toThrow()
    })
  })

  describe('FTS integration', () => {
    it('should automatically populate FTS on chunk insert', () => {
      const insertDoc = db.prepare(`
        INSERT INTO documents (source, uri, hash) 
        VALUES (?, ?, ?)
      `)
      const docId = insertDoc.run('file', 'test://doc1', 'hash123').lastInsertRowid

      const insertChunk = db.prepare(`
        INSERT INTO chunks (document_id, chunk_index, content) 
        VALUES (?, ?, ?)
      `)
      const chunkId = insertChunk.run(docId, 0, 'searchable test content').lastInsertRowid

      const ftsResult = db.prepare(`
        SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?
      `).get('searchable')

      expect(ftsResult).toBeTruthy()
      expect(ftsResult.rowid).toBe(chunkId)
    })
  })
})