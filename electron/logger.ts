import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import path from 'node:path'

let logFile: string | null = null

function ensureLogFile(): string {
  if (logFile) return logFile
  const logDir = app.getPath('userData')
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
  logFile = path.join(logDir, 'postrack.log')
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
    console.error('Logger failed to write:', e)
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
