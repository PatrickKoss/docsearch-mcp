import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Indexer } from '../src/ingest/indexer.js'
import { openDb } from '../src/ingest/db.js'
import { testDbPath } from './setup.js'
import { DocumentInput, ChunkInput } from '../src/shared/types.js'

vi.mock('../src/ingest/embeddings.js', () => ({
  getEmbedder: vi.fn().mockReturnValue({
    dim: 1536,
    embed: vi.fn().mockResolvedValue([
      new Float32Array(Array(1536).fill(0.1)),
      new Float32Array(Array(1536).fill(0.2))
    ])
  })
}))

describe('Indexer', () => {
  let db: ReturnType<typeof openDb>
  let indexer: Indexer

  beforeEach(() => {
    db = openDb({ path: testDbPath, embeddingDim: 1536 })
    indexer = new Indexer(db)
  })

  afterEach(() => {
    db?.close()
  })

  describe('Document operations', () => {
    const sampleDoc: DocumentInput = {
      source: 'file',
      uri: 'test://sample.txt',
      repo: 'test-repo',
      path: 'sample.txt',
      title: 'Sample Document',
      lang: 'text',
      hash: 'abc123',
      mtime: Date.now(),
      version: '1.0',
      extra_json: JSON.stringify({ type: 'test' })
    }

    it('should insert new document', () => {
      const docId = indexer.upsertDocument(sampleDoc)
      expect(docId).toBeGreaterThan(0)

      const result = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId)
      expect(result).toBeTruthy()
      expect(result.uri).toBe(sampleDoc.uri)
      expect(result.hash).toBe(sampleDoc.hash)
      expect(result.title).toBe(sampleDoc.title)
    })

    it('should update existing document with same URI', () => {
      const docId1 = indexer.upsertDocument(sampleDoc)
      
      const updatedDoc = { ...sampleDoc, hash: 'xyz789', title: 'Updated Title' }
      const docId2 = indexer.upsertDocument(updatedDoc)
      
      expect(docId1).toBe(docId2)
      
      const result = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId2)
      expect(result.hash).toBe('xyz789')
      expect(result.title).toBe('Updated Title')
    })

    it('should not update when hash is the same', () => {
      const docId1 = indexer.upsertDocument(sampleDoc)
      const docId2 = indexer.upsertDocument(sampleDoc)
      
      expect(docId1).toBe(docId2)
    })

    it('should handle null/optional fields', () => {
      const minimalDoc: DocumentInput = {
        source: 'file',
        uri: 'test://minimal.txt',
        hash: 'minimal123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extra_json: null
      }
      
      const docId = indexer.upsertDocument(minimalDoc)
      expect(docId).toBeGreaterThan(0)
      
      const result = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId)
      expect(result.uri).toBe(minimalDoc.uri)
      expect(result.repo).toBeNull()
      expect(result.path).toBeNull()
    })
  })

  describe('Chunk operations', () => {
    let docId: number

    beforeEach(() => {
      const sampleDoc: DocumentInput = {
        source: 'file',
        uri: 'test://chunks.txt',
        hash: 'chunks123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extra_json: null
      }
      docId = indexer.upsertDocument(sampleDoc)
    })

    it('should insert chunks for document', () => {
      const chunks: ChunkInput[] = [
        { content: 'First chunk', startLine: 1, endLine: 5, tokenCount: 10 },
        { content: 'Second chunk', startLine: 6, endLine: 10, tokenCount: 12 },
        { content: 'Third chunk', tokenCount: 8 }
      ]

      indexer.insertChunks(docId, chunks)

      const result = db.prepare('SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index').all(docId)
      expect(result).toHaveLength(3)
      
      expect(result[0].content).toBe('First chunk')
      expect(result[0].chunk_index).toBe(0)
      expect(result[0].start_line).toBe(1)
      expect(result[0].end_line).toBe(5)
      expect(result[0].token_count).toBe(10)
      
      expect(result[1].content).toBe('Second chunk')
      expect(result[1].chunk_index).toBe(1)
      
      expect(result[2].content).toBe('Third chunk')
      expect(result[2].chunk_index).toBe(2)
      expect(result[2].start_line).toBeNull()
      expect(result[2].end_line).toBeNull()
    })

    it('should handle empty chunks array', () => {
      indexer.insertChunks(docId, [])
      
      const result = db.prepare('SELECT COUNT(*) as count FROM chunks WHERE document_id = ?').get(docId)
      expect(result.count).toBe(0)
    })
  })

  describe('Embedding operations', () => {
    let docId: number

    beforeEach(() => {
      const sampleDoc: DocumentInput = {
        source: 'file',
        uri: 'test://embed.txt',
        hash: 'embed123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extra_json: null
      }
      docId = indexer.upsertDocument(sampleDoc)
      
      const chunks: ChunkInput[] = [
        { content: 'Chunk to embed 1' },
        { content: 'Chunk to embed 2' }
      ]
      indexer.insertChunks(docId, chunks)
    })

    it('should embed new chunks', async () => {
      await indexer.embedNewChunks(1)

      const embeddedCount = db.prepare('SELECT COUNT(*) as count FROM chunk_vec_map').get()
      expect(embeddedCount.count).toBe(2)

      const vecCount = db.prepare('SELECT COUNT(*) as count FROM vec_chunks').get()
      expect(vecCount.count).toBe(2)
    })

    it('should not re-embed already embedded chunks', async () => {
      await indexer.embedNewChunks()
      
      const initialCount = db.prepare('SELECT COUNT(*) as count FROM chunk_vec_map').get().count
      
      await indexer.embedNewChunks()
      
      const finalCount = db.prepare('SELECT COUNT(*) as count FROM chunk_vec_map').get().count
      expect(finalCount).toBe(initialCount)
    })

    it('should handle batch processing', async () => {
      const { getEmbedder } = await import('../src/ingest/embeddings.js')
      const mockEmbedder = vi.mocked(getEmbedder())
      
      // Clear previous calls from other tests
      mockEmbedder.embed.mockClear()

      await indexer.embedNewChunks(1)

      expect(mockEmbedder.embed).toHaveBeenCalledTimes(2)
      expect(mockEmbedder.embed).toHaveBeenNthCalledWith(1, ['Chunk to embed 1'])
      expect(mockEmbedder.embed).toHaveBeenNthCalledWith(2, ['Chunk to embed 2'])
    })
  })

  describe('Document cleanup on update', () => {
    it('should cleanup chunks and embeddings when document hash changes', async () => {
      const doc: DocumentInput = {
        source: 'file',
        uri: 'test://cleanup.txt',
        hash: 'original123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extra_json: null
      }
      const docId = indexer.upsertDocument(doc)
      
      const chunks: ChunkInput[] = [
        { content: 'Original chunk 1' },
        { content: 'Original chunk 2' }
      ]
      indexer.insertChunks(docId, chunks)
      await indexer.embedNewChunks()

      const initialChunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks WHERE document_id = ?').get(docId).count
      const initialVecCount = db.prepare('SELECT COUNT(*) as count FROM chunk_vec_map').get().count
      expect(initialChunkCount).toBe(2)
      expect(initialVecCount).toBe(2)

      const updatedDoc = { ...doc, hash: 'updated456' }
      indexer.upsertDocument(updatedDoc)

      const finalChunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks WHERE document_id = ?').get(docId).count
      const finalVecCount = db.prepare('SELECT COUNT(*) as count FROM chunk_vec_map').get().count
      expect(finalChunkCount).toBe(0)
      expect(finalVecCount).toBe(0)
    })
  })

  describe('Metadata operations', () => {
    it('should set and get metadata', () => {
      indexer.setMeta('test_key', 'test_value')
      
      const value = indexer.getMeta('test_key')
      expect(value).toBe('test_value')
    })

    it('should return undefined for non-existent keys', () => {
      const value = indexer.getMeta('non_existent_key')
      expect(value).toBeUndefined()
    })

    it('should update existing metadata', () => {
      indexer.setMeta('key', 'original_value')
      indexer.setMeta('key', 'updated_value')
      
      const value = indexer.getMeta('key')
      expect(value).toBe('updated_value')
    })

    it('should handle empty string values', () => {
      indexer.setMeta('empty_key', '')
      
      const value = indexer.getMeta('empty_key')
      expect(value).toBe('')
    })
  })

  describe('Error handling', () => {
    it('should throw error if document upsert fails', () => {
      const invalidDoc = {} as DocumentInput

      expect(() => indexer.upsertDocument(invalidDoc)).toThrow()
    })

    it('should handle embedding errors gracefully', async () => {
      const { getEmbedder } = await import('../src/ingest/embeddings.js')
      const mockEmbedder = vi.mocked(getEmbedder())
      mockEmbedder.embed.mockRejectedValueOnce(new Error('Embedding service down'))

      const doc: DocumentInput = {
        source: 'file',
        uri: 'test://error.txt',
        hash: 'error123',
        repo: null,
        path: null,
        title: null,
        lang: null,
        mtime: null,
        version: null,
        extra_json: null
      }
      const docId = indexer.upsertDocument(doc)
      indexer.insertChunks(docId, [{ content: 'Test content' }])

      await expect(indexer.embedNewChunks()).rejects.toThrow('Embedding service down')
    })
  })
})