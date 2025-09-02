import { describe, it, expect } from 'vitest'

describe('Chunker Simple Test', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2)
  })
  
  it('should import chunker functions', async () => {
    const { chunkCode, chunkDoc } = await import('../src/ingest/chunker.js')
    
    expect(typeof chunkCode).toBe('function')
    expect(typeof chunkDoc).toBe('function')
  })
  
  it('should chunk empty string', async () => {
    const { chunkCode } = await import('../src/ingest/chunker.js')
    
    const result = chunkCode('')
    expect(result).toEqual([])
  })
})