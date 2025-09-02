import { describe, it, expect } from 'vitest'

describe('Basic Test', () => {
  it('should work', () => {
    expect(2 + 2).toBe(4)
  })
  
  it('should handle strings', () => {
    expect('hello'.toUpperCase()).toBe('HELLO')
  })
})