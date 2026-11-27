import { describe, expect, it } from 'vitest'
import { createLoginItemSetter } from './login-item'

// F-25、AC-27。component-backend.md 8.
describe('自動起動を切り替える（loginItem:set）', () => {
  function setup(options: { ignored?: boolean } = {}) {
    let enabled = false
    const published: boolean[] = []
    const set = createLoginItemSetter({
      set: (next) => {
        // OS が受け付けなかったことにする（ignored）
        if (options.ignored !== true) enabled = next
      },
      get: () => enabled,
      publish: (value) => published.push(value),
    })
    return { set, published }
  }

  it('オンにしたら、OS から読み直した値を返し、画面に知らせる', async () => {
    const { set, published } = setup()
    await expect(set({ enabled: true })).resolves.toEqual({ ok: true, value: { enabled: true } })
    expect(published).toEqual([true])
  })

  it('OS が受け付けなかったら、読み直した値（変わっていない）を返す', async () => {
    const { set, published } = setup({ ignored: true })
    await expect(set({ enabled: true })).resolves.toEqual({ ok: true, value: { enabled: false } })
    expect(published).toEqual([false])
  })
})
