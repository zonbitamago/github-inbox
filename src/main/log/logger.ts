// 手元のログ（non-functional.md Q-15、security-rules.md S-09、component-backend.md 4.）。
// 1行1件の JSON、1日1ファイル（UTC の日付）、7日で消す。外には送らない。
// 書くのは、問い合わせ先の種類・状態コード・所要時間・利用制限の残り・エラーの分類・スレッドの id・
// デスクトップ通知を出した記録（出来事の id・種類・発生の時刻・出した時刻）だけ。
// **トークン・出来事の本文・PR や issue のタイトルを渡さない**。トークンの形の文字列は書く前に消す。
import { appendFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { DAY_MS, LOG_RETENTION_DAYS } from '../core/constants'

export type LogValue = string | number | boolean | null | undefined
export type LogFields = Record<string, LogValue>

export interface Logger {
  info(kind: string, fields?: LogFields): void
  warn(kind: string, fields?: LogFields): void
  error(kind: string, fields?: LogFields): void
}

export interface FileLogger extends Logger {
  /** 書き込みを待つ（終了の前とテストで使う） */
  flush(): Promise<void>
  /** 7日より前のログのファイルを消し、消した数を返す */
  removeOldFiles(): Promise<number>
  /** 書けなかった回数（ログに書けない失敗は、ほかに知らせる先が無いため数えておく） */
  failures(): number
}

const TOKEN = /\b(gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g
const LOG_FILE = /^(\d{4}-\d{2}-\d{2})\.log$/

function redact(value: LogValue): LogValue {
  return typeof value === 'string' ? value.replace(TOKEN, '[REDACTED]') : value
}

export function createLogger(options: { dir: string; now?: () => Date }): FileLogger {
  const now = options.now ?? (() => new Date())
  let queue: Promise<void> = Promise.resolve()
  let failed = 0

  function write(level: 'info' | 'warn' | 'error', kind: string, fields: LogFields = {}): void {
    const at = now()
    const entry: LogFields = { at: at.toISOString(), level, kind }
    for (const [key, value] of Object.entries(fields)) entry[key] = redact(value)
    const line = `${JSON.stringify(entry)}\n`
    const file = join(options.dir, `${at.toISOString().slice(0, 10)}.log`)
    queue = queue.then(async () => {
      try {
        await mkdir(options.dir, { recursive: true })
        await appendFile(file, line, 'utf-8')
      } catch {
        failed += 1
      }
    })
  }

  return {
    info: (kind, fields) => write('info', kind, fields),
    warn: (kind, fields) => write('warn', kind, fields),
    error: (kind, fields) => write('error', kind, fields),
    flush: () => queue,
    failures: () => failed,
    async removeOldFiles() {
      let names: string[]
      try {
        names = await readdir(options.dir)
      } catch {
        // フォルダがまだ無い（一度も書いていない）
        return 0
      }
      const oldest = new Date(now().getTime() - LOG_RETENTION_DAYS * DAY_MS)
        .toISOString()
        .slice(0, 10)
      let removed = 0
      for (const name of names) {
        const date = LOG_FILE.exec(name)?.[1]
        if (date !== undefined && date < oldest) {
          await rm(join(options.dir, name), { force: true })
          removed += 1
        }
      }
      return removed
    },
  }
}
