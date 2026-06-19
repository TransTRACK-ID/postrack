import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import path from 'node:path'
import { homedir } from 'node:os'

let logFile: string | null = null
let fallbackLogFile: string | null = null

function getFallbackLogPath(): string {
  if (fallbackLogFile) return fallbackLogFile
  fallbackLogFile = path.join(homedir(), 'postrack-debug.log')
  return fallbackLogFile
}

function ensureLogFile(): string {
  if (logFile) return logFile
  try {
    const logDir = app.getPath('userData')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    logFile = path.join(logDir, 'postrack.log')
  } catch (e) {
    console.error('[Logger] Failed to get userData path, using fallback:', e)
    logFile = getFallbackLogPath()
  }
  return logFile
}

function writeLog(level: string, args: any[]) {
  const msg = args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return a.stack || a.message
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
  const line = `[${new Date().toISOString()}] ${level}: ${msg}\n`

  try {
    appendFileSync(ensureLogFile(), line)
  } catch (e) {
    console.error('[Logger] Failed to write to primary log:', e)
    try {
      appendFileSync(getFallbackLogPath(), line)
    } catch (e2) {
      console.error('[Logger] Failed to write to fallback log:', e2)
    }
  }

  if (level === 'ERROR') {
    console.error(...args)
  } else {
    console.log(...args)
  }
}

export const logger = {
  info: (...args: any[]) => writeLog('INFO', args),
  error: (...args: any[]) => writeLog('ERROR', args),
  warn: (...args: any[]) => writeLog('WARN', args),
}

export function getLogFilePath(): string {
  return ensureLogFile()
}

export function getFallbackLogFilePath(): string {
  return getFallbackLogPath()
}
