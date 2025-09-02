import { beforeEach } from 'vitest'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'

const TEST_DB_PATH = './test/test.db'

beforeEach(() => {
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH, { force: true })
  }
})

export const testDbPath = TEST_DB_PATH