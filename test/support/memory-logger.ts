// テストで使う、書いたログを覚えておくだけのログ
import type { LogFields, Logger } from '../../src/main/log/logger'

export interface MemoryLogger extends Logger {
  entries: { level: 'info' | 'warn' | 'error'; kind: string; fields: LogFields }[]
}

export function createMemoryLogger(): MemoryLogger {
  const entries: MemoryLogger['entries'] = []
  return {
    entries,
    info: (kind, fields = {}) => entries.push({ level: 'info', kind, fields }),
    warn: (kind, fields = {}) => entries.push({ level: 'warn', kind, fields }),
    error: (kind, fields = {}) => entries.push({ level: 'error', kind, fields }),
  }
}
