import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadProjectEnv } from '../../electron/env'

describe('loadProjectEnv', () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), 'postrack-env-'))
    process.chdir(tempDir)
    delete process.env.ELECTRON_DEV
    delete process.env.SMOKE_TEST_VAR
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.SMOKE_TEST_VAR
  })

  it('loads variables from .env when not in dev mode', () => {
    writeFileSync(join(tempDir, '.env'), 'SMOKE_TEST_VAR=from-dotenv\n')
    loadProjectEnv()
    expect(process.env.SMOKE_TEST_VAR).toBe('from-dotenv')
  })

  it('does not override existing environment variables', () => {
    process.env.SMOKE_TEST_VAR = 'already-set'
    writeFileSync(join(tempDir, '.env'), 'SMOKE_TEST_VAR=from-dotenv\n')
    loadProjectEnv()
    expect(process.env.SMOKE_TEST_VAR).toBe('already-set')
  })

  it('skips loading when ELECTRON_DEV is true', () => {
    process.env.ELECTRON_DEV = 'true'
    writeFileSync(join(tempDir, '.env'), 'SMOKE_TEST_VAR=from-dotenv\n')
    loadProjectEnv()
    expect(process.env.SMOKE_TEST_VAR).toBeUndefined()
  })
})
