// テストで使う、safeStorage の偽物（component-backend.md 9.）。
// 暗号化の代わりに base64 にし、鍵の世代を前に付ける。世代を変えると「暗号化し直すべき」と返す。
import type { SecretCipher } from '../../src/main/auth/token-store'

export interface FakeSecretCipher extends SecretCipher {
  generation: number
  available: boolean
}

export function createFakeSecretCipher(change: Partial<SecretCipher> = {}): FakeSecretCipher {
  const cipher: FakeSecretCipher = {
    generation: 1,
    available: true,
    isAvailable: () => Promise.resolve(cipher.available),
    encrypt: (text) =>
      Promise.resolve(Buffer.from(`${cipher.generation}:${Buffer.from(text).toString('base64')}`)),
    decrypt: (data) => {
      const [generation, body] = data.toString().split(':')
      return Promise.resolve({
        text: Buffer.from(body ?? '', 'base64').toString(),
        shouldReEncrypt: Number(generation) !== cipher.generation,
      })
    },
    ...change,
  }
  return cipher
}
