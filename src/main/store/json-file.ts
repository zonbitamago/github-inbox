// JSON のファイルの読み書き（ADR-009、component-backend.md 7.）。
// 書くときは、同じフォルダの一時ファイルに書き、ディスクに書き切ってから名前を置き換える（途中で落ちても前のファイルが残る）。
// 読むときは、スキーマで検査する。読めない・合わないときは `*.corrupt-日時` に退避する。
import { randomBytes } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CORRUPT_FILE_RETENTION_DAYS, DAY_MS } from '../core/constants'

export type ReadResult<T> =
  { kind: 'ok'; value: T } | { kind: 'missing' } | { kind: 'corrupt'; movedTo: string }

/** zod のスキーマ（preprocess を含む）を受けるための形 */
export interface SafeParser<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false }
}

const CORRUPT = '.corrupt-'

function stampOf(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown }).code === 'ENOENT'
}

async function moveAside(path: string, now: Date): Promise<ReadResult<never>> {
  const movedTo = `${path}${CORRUPT}${stampOf(now)}`
  await rename(path, movedTo)
  return { kind: 'corrupt', movedTo }
}

export async function readJsonFile<T>(
  path: string,
  schema: SafeParser<T>,
  now: Date,
): Promise<ReadResult<T>> {
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch (error) {
    if (isNotFound(error)) return { kind: 'missing' }
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return moveAside(path, now)
  }
  const result = schema.safeParse(parsed)
  return result.success ? { kind: 'ok', value: result.data } : moveAside(path, now)
}

export async function writeJsonFileAtomic(path: string, value: unknown): Promise<void> {
  // 先に文字にする（循環などで失敗するなら、一時ファイルを作る前に止まる）
  const text = `${JSON.stringify(value)}\n`
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
  try {
    const handle = await open(temp, 'w')
    try {
      await handle.writeFile(text, 'utf-8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/** 退避したファイルのうち、7日より前のものを消し、消した数を返す（component-backend.md 7.。AI案） */
export async function removeOldCorruptFiles(path: string, now: Date): Promise<number> {
  const prefix = `${basename(path)}${CORRUPT}`
  const oldest = now.getTime() - CORRUPT_FILE_RETENTION_DAYS * DAY_MS
  let removed = 0
  for (const name of await readdir(dirname(path))) {
    if (!name.startsWith(prefix)) continue
    const iso = name
      .slice(prefix.length)
      .replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1T$2:$3:$4.$5Z')
    const time = Date.parse(iso)
    if (!Number.isNaN(time) && time < oldest) {
      await rm(join(dirname(path), name), { force: true })
      removed += 1
    }
  }
  return removed
}
