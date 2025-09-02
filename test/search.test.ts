import { describe, it, expect, beforeEach } from 'vitest'
import { hybridSearch, SearchParams } from '../src/ingest/search.js'
import { openDb } from '../src/ingest/db.js'
import { Indexer } from '../src/ingest/indexer.js'
import { testDbPath } from './setup.js'
import { DocumentInput, ChunkInput } from '../src/shared/types.js'

describe('Search', () => {
  let db: ReturnType<typeof openDb>
  let indexer: Indexer

  beforeEach(async () => {
    db = openDb({ path: testDbPath, embeddingDim: 1536 })
    indexer = new Indexer(db)

    const docs: DocumentInput[] = [
      {
        source: 'file',
        uri: 'test://doc1.ts',
        repo: 'project-a',
        path: 'src/utils/doc1.ts',
        title: 'Document 1',
        lang: 'typescript',
        hash: 'hash1',
        mtime: Date.now(),
        version: '1.0',
        extra_json: null
      },
      {
        source: 'confluence',
        uri: 'confluence://page1',
        repo: 'wiki',
        path: 'docs/page1',
        title: 'Confluence Page',
        hash: 'hash2',
        mtime: Date.now(),
        version: '2.0',
        lang: 'md',
        extra_json: null
      },
      {
        source: 'file',
        uri: 'test://doc2.py',
        repo: 'project-b',
        path: 'src/main.py',
        title: 'Python Script',
        lang: 'python',
        hash: 'hash3',
        mtime: Date.now(),
        version: '1.5',
        extra_json: null
      }
    ]

    const chunks: ChunkInput[][] = [
      [
        { content: 'function searchFiles(query: string) { return files.filter(f => f.includes(query)); }', startLine: 1, endLine: 3 },
        { content: 'export const DATABASE_URL = "postgresql://localhost:5432/mydb";', startLine: 5, endLine: 5 }
      ],
      [
        { content: 'This page describes how to search through documentation and find relevant information.', startLine: 1, endLine: 1 },
        { content: 'The search functionality supports both keyword and semantic search modes.', startLine: 3, endLine: 3 }
      ],
      [
        { content: 'def search_data(query, database): return database.query(query)', startLine: 1, endLine: 1 },
        { content: 'import sqlite3 as db', startLine: 5, endLine: 5 }
      ]
    ]

    for (let i = 0; i < docs.length; i++) {
      const docId = indexer.upsertDocument(docs[i])
      indexer.insertChunks(docId, chunks[i])
    }
  })

  afterEach(() => {
    db?.close()
  })

  describe('hybridSearch', () => {
    it('should create search statements with default parameters', () => {
      const params: SearchParams = { query: 'test' }
      const result = hybridSearch(db, params)

      expect(result.kw).toBeDefined()
      expect(result.vec).toBeDefined()
      expect(result.binds).toEqual({ k: 8 })
      expect(result.topK).toBe(8)
    })

    it('should use custom topK parameter', () => {
      const params: SearchParams = { query: 'test', topK: 15 }
      const result = hybridSearch(db, params)

      expect(result.binds.k).toBe(15)
      expect(result.topK).toBe(15)
    })

    it('should apply source filter', () => {
      const params: SearchParams = { 
        query: 'test', 
        source: 'file'
      }
      const result = hybridSearch(db, params)

      expect(result.binds.source).toBe('file')
      expect(result.binds.k).toBe(8)
    })

    it('should apply repo filter', () => {
      const params: SearchParams = { 
        query: 'test', 
        repo: 'project-a'
      }
      const result = hybridSearch(db, params)

      expect(result.binds.repo).toBe('project-a')
      expect(result.binds.k).toBe(8)
    })

    it('should apply path prefix filter', () => {
      const params: SearchParams = { 
        query: 'test', 
        pathPrefix: 'src/'
      }
      const result = hybridSearch(db, params)

      expect(result.binds.pathPrefix).toBe('src/%')
      expect(result.binds.k).toBe(8)
    })

    it('should combine multiple filters', () => {
      const params: SearchParams = { 
        query: 'test',
        source: 'file',
        repo: 'project-a',
        pathPrefix: 'src/utils',
        topK: 5
      }
      const result = hybridSearch(db, params)

      expect(result.binds).toEqual({
        source: 'file',
        repo: 'project-a',
        pathPrefix: 'src/utils%',
        k: 5
      })
      expect(result.topK).toBe(5)
    })

    it('should handle empty filters', () => {
      const params: SearchParams = { query: 'test' }
      const result = hybridSearch(db, params)

      expect(result.binds).toEqual({ k: 8 })
      expect(Object.keys(result.binds)).toHaveLength(1)
    })
  })

  describe('Search statement execution', () => {
    it('should execute keyword search successfully', () => {
      const params: SearchParams = { query: 'search' }
      const { kw, binds } = hybridSearch(db, params)

      const results = kw.all({ query: 'search', ...binds })
      
      expect(Array.isArray(results)).toBe(true)
      
      if (results.length > 0) {
        const firstResult = results[0]
        expect(firstResult).toHaveProperty('chunk_id')
        expect(firstResult).toHaveProperty('score')
        expect(firstResult).toHaveProperty('document_id')
        expect(firstResult).toHaveProperty('source')
        expect(firstResult).toHaveProperty('uri')
        expect(firstResult).toHaveProperty('snippet')
      }
    })

    it('should handle keyword search with filters', () => {
      const params: SearchParams = { 
        query: 'search',
        source: 'file'
      }
      const { kw, binds } = hybridSearch(db, params)

      const results = kw.all({ query: 'search', ...binds })
      
      if (results.length > 0) {
        results.forEach(result => {
          expect(result.source).toBe('file')
        })
      }
    })

    it('should execute vector search with mock embedding', () => {
      const params: SearchParams = { query: 'database' }
      const { vec, binds } = hybridSearch(db, params)

      const mockEmbedding = JSON.stringify(Array(1536).fill(0.1))
      const results = vec.all({ 
        embedding: mockEmbedding, 
        ...binds 
      })

      expect(Array.isArray(results)).toBe(true)
    })

    it('should limit results to topK', () => {
      const params: SearchParams = { 
        query: 'function',
        topK: 1
      }
      const { kw, binds } = hybridSearch(db, params)

      const results = kw.all({ query: 'function', ...binds })
      
      expect(results.length).toBeLessThanOrEqual(1)
    })

    it('should return snippet with limited length', () => {
      const params: SearchParams = { query: 'function' }
      const { kw, binds } = hybridSearch(db, params)

      const results = kw.all({ query: 'function', ...binds })
      
      if (results.length > 0) {
        const result = results[0]
        expect(result.snippet).toBeTruthy()
        expect(result.snippet.length).toBeLessThanOrEqual(400)
      }
    })

    it('should include line numbers when available', () => {
      const params: SearchParams = { query: 'function' }
      const { kw, binds } = hybridSearch(db, params)

      const results = kw.all({ query: 'function', ...binds })
      
      if (results.length > 0) {
        const result = results[0]
        expect(result).toHaveProperty('start_line')
        expect(result).toHaveProperty('end_line')
        
        if (result.start_line !== null) {
          expect(typeof result.start_line).toBe('number')
          expect(result.start_line).toBeGreaterThan(0)
        }
      }
    })

    it('should handle repo filter correctly', () => {
      const params: SearchParams = { 
        query: 'search',
        repo: 'project-a'
      }
      const { kw, binds } = hybridSearch(db, params)

      const results = kw.all({ query: 'search', ...binds })
      
      results.forEach(result => {
        expect(result.repo).toBe('project-a')
      })
    })

    it('should handle path prefix filter correctly', () => {
      const params: SearchParams = { 
        query: 'function',
        pathPrefix: 'src/utils'
      }
      const { kw, binds } = hybridSearch(db, params)

      const results = kw.all({ query: 'function', ...binds })
      
      results.forEach(result => {
        expect(result.path).toMatch(/^src\/utils/)
      })
    })

    it('should handle empty query results', () => {
      const params: SearchParams = { query: 'nonexistentterm12345' }
      const { kw, binds } = hybridSearch(db, params)

      const results = kw.all({ query: 'nonexistentterm12345', ...binds })
      
      expect(results).toEqual([])
    })
  })

  describe('SQL injection prevention', () => {
    it('should handle special characters in query safely', () => {
      const params: SearchParams = { query: "'; DROP TABLE documents; --" }
      const { kw, binds } = hybridSearch(db, params)

      // FTS5 should reject malformed queries with special characters - this is the safe behavior
      // It prevents any SQL injection by throwing an error on invalid FTS5 syntax
      expect(() => {
        kw.all({ query: "'; DROP TABLE documents; --", ...binds })
      }).toThrow(/fts5: syntax error/)

      // Verify the table still exists (injection attempt failed)
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").get()
      expect(tableExists).toBeTruthy()
    })

    it('should handle special characters in filters safely', () => {
      const params: SearchParams = { 
        query: 'test',
        repo: "'; DROP TABLE documents; --",
        pathPrefix: '../../../etc/passwd'
      }
      const { kw, binds } = hybridSearch(db, params)

      expect(() => {
        kw.all({ query: 'test', ...binds })
      }).not.toThrow()
    })
  })
})