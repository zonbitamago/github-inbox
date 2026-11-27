// トークンの保管（auth-flow.md 4.、ADR-004、N-05）。
// safeStorage の非同期版の関数で暗号化し、token.bin としてユーザーフォルダに置く。平文では置かない。
// 書くときは、同じフォルダの一時ファイルに書き、ディスクに書き切ってから名前を置き換える（ADR-009 と同じ）。
import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Logger } from '../log/logger'

/** safeStorage のうち使うもの（テストで偽物に差し替える。component-backend.md 9.） */
export interface SecretCipher {
  isAvailable(): Promise<boolean>
  encrypt(text: string): Promise<Buffer>
  decrypt(data: Buffer): Promise<{ text: string; shouldReEncrypt: boolean }>
}

export type TokenLoad =
  | { kind: 'ok'; token: string }
  | { kind: 'missing' }
  /** 復号できない（キーチェーンで断られた、鍵が無いなど）。ファイルは消さない（auth-flow.md 4.） */
  | { kind: 'unreadable' }

/** 持ち主だけが読み書きできる */
const OWNER_ONLY = 0o600

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export class TokenStore {
  constructor(
    private readonly path: string,
    private readonly cipher: SecretCipher,
    private readonly logger: Logger,
  ) {}

  async exists(): Promise<boolean> {
    try {
      await stat(this.path)
      return true
    } catch (error) {
      if (isNotFound(error)) return false
      throw error
    }
  }

  async save(token: string): Promise<'saved' | 'encryption_unavailable'> {
    if (!(await this.cipher.isAvailable())) return 'encryption_unavailable'
    const encrypted = await this.cipher.encrypt(token)
    await mkdir(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
    try {
      const handle = await open(temp, 'w', OWNER_ONLY)
      try {
        await handle.writeFile(encrypted)
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temp, this.path)
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
    return 'saved'
  }

  async load(): Promise<TokenLoad> {
    let data: Buffer
    try {
      data = await readFile(this.path)
    } catch (error) {
      if (isNotFound(error)) return { kind: 'missing' }
      throw error
    }
    let decrypted: { text: string; shouldReEncrypt: boolean }
    try {
      decrypted = await this.cipher.decrypt(data)
    } catch (error) {
      // 例外の文言は書かない（何が入るか分からないため。S-09）
      this.logger.warn('auth.token_unreadable', { error: errorName(error) })
      return { kind: 'unreadable' }
    }
    if (decrypted.shouldReEncrypt) {
      // 鍵が替わったなど。読めたトークンは使えるので、暗号化し直せなくても先へ進む（auth-flow.md 4.）
      try {
        await this.save(decrypted.text)
      } catch (error) {
        this.logger.warn('auth.token_reencrypt_failed', { error: errorName(error) })
      }
    }
    return { kind: 'ok', token: decrypted.text }
  }

  async remove(): Promise<void> {
    await rm(this.path, { force: true })
  }
}
