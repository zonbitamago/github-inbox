import { describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import type { AppState } from '../../shared/ipc-contract'
import { DAY_MS } from '../core/constants'
import type { LatestReleaseResult } from '../github/releases'
import { isNewerVersion, parseVersion, UpdateChecker } from './update-check'

const RELEASE_URL = 'https://github.com/zonbitamago/github-inbox/releases/tag/v1.2.3'

describe('版の読み方と比べ方（build-and-release.md 1.）', () => {
  it.each([
    ['1.2.3', [1, 2, 3]],
    ['v1.2.3', [1, 2, 3]],
    ['v10.0.12', [10, 0, 12]],
    ['0.0.0', [0, 0, 0]],
  ])('%s を読む', (text, expected) => {
    expect(parseVersion(text)).toEqual(expected)
  })

  it.each(['', 'v1.2', '1.2.3-beta.1', 'release-1.2.3', 'v1.2.3 '])(
    '「%s」は版として読まない',
    (text) => {
      expect(parseVersion(text)).toBeUndefined()
    },
  )

  it.each([
    ['1.2.4', '1.2.3', true],
    ['1.3.0', '1.2.9', true],
    ['2.0.0', '1.99.99', true],
    ['1.10.0', '1.9.0', true],
    ['1.2.3', '1.2.3', false],
    ['1.2.2', '1.2.3', false],
    ['0.9.9', '1.0.0', false],
  ])('%s は %s より新しいか: %s', (candidate, current, expected) => {
    const parse = (text: string) => {
      const version = parseVersion(text)
      if (version === undefined) throw new Error(text)
      return version
    }
    expect(isNewerVersion(parse(candidate), parse(current))).toBe(expected)
  })
})

// F-31、AC-31。component-backend.md 5.1
describe('新しい版の確認', () => {
  function setup(
    options: {
      current?: string
      answers?: (LatestReleaseResult | Promise<LatestReleaseResult>)[]
    } = {},
  ) {
    const answers = [...(options.answers ?? [])]
    let fetched = 0
    const scheduled: { callback: () => void; delayMs: number; cancelled: boolean }[] = []
    const published: AppState['update'][] = []
    const logger = createMemoryLogger()
    const checker = new UpdateChecker({
      fetchLatest: () => {
        fetched += 1
        const answer = answers.shift()
        return answer === undefined ? Promise.reject(new Error('想定外')) : Promise.resolve(answer)
      },
      currentVersion: options.current ?? '1.2.0',
      schedule: (callback, delayMs) => {
        const entry = { callback, delayMs, cancelled: false }
        scheduled.push(entry)
        return () => {
          entry.cancelled = true
        }
      },
      logger,
      publish: (update) => published.push(update),
    })
    return { checker, scheduled, published, logger, fetched: () => fetched }
  }

  const release = (tagName: string, htmlUrl = RELEASE_URL): LatestReleaseResult => ({
    kind: 'ok',
    tagName,
    htmlUrl,
  })

  it('今より新しい版が出ていたら、版と Releases のページを知らせる', async () => {
    const { checker, published, logger } = setup({ answers: [release('v1.2.3')] })
    await checker.start()
    expect(published).toEqual([{ version: '1.2.3', url: RELEASE_URL }])
    expect(logger.entries).toContainEqual({
      level: 'info',
      kind: 'update_check.checked',
      fields: { current: '1.2.0', latest: 'v1.2.3', newer: true },
    })
  })

  it('今と同じか古い版なら、知らせを消す', async () => {
    const { checker, published } = setup({ current: '1.2.3', answers: [release('v1.2.3')] })
    await checker.start()
    expect(published).toEqual([undefined])
  })

  it('版がまだ1つも無ければ、知らせを消す', async () => {
    const { checker, published } = setup({ answers: [{ kind: 'none' }] })
    await checker.start()
    expect(published).toEqual([undefined])
  })

  it('問い合わせに失敗したら、知らせを変えずにログに書く', async () => {
    const { checker, published, logger } = setup({
      answers: [{ kind: 'failed', failure: { kind: 'offline' } }],
    })
    await checker.start()
    expect(published).toEqual([])
    expect(logger.entries).toContainEqual({
      level: 'warn',
      kind: 'update_check.failed',
      fields: { failure: 'offline' },
    })
  })

  it('思わぬ例外でも、ログに書いて止まらない', async () => {
    const { checker, published, logger } = setup({ answers: [] })
    await checker.start()
    expect(published).toEqual([])
    expect(logger.entries.map((entry) => entry.kind)).toEqual(['update_check.unexpected'])
  })

  it('版として読めない名前なら、知らせない', async () => {
    const { checker, published } = setup({ answers: [release('nightly')] })
    await checker.start()
    expect(published).toEqual([])
  })

  it('Releases のページが https://github.com/ の外なら、知らせない（I-8）', async () => {
    const { checker, published, logger } = setup({
      answers: [release('v9.0.0', 'https://example.com/releases/v9.0.0')],
    })
    await checker.start()
    expect(published).toEqual([])
    expect(logger.entries.map((entry) => entry.kind)).toEqual(['update_check.url_not_allowed'])
  })

  it('今の版が読めなければ、問い合わせない', async () => {
    const { checker, fetched } = setup({ current: 'dev' })
    await checker.start()
    expect(fetched()).toBe(0)
  })

  it('確かめた後は、24時間後にもう一度確かめる', async () => {
    const { checker, scheduled, published } = setup({
      answers: [{ kind: 'none' }, release('v1.3.0')],
    })
    await checker.start()
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([DAY_MS])

    scheduled[0]?.callback()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(published).toEqual([undefined, { version: '1.3.0', url: RELEASE_URL }])
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([DAY_MS, DAY_MS])
  })

  it('サインインし直しても、次の確認を決めてあれば確かめ直さない', async () => {
    const { checker, fetched, scheduled } = setup({ answers: [{ kind: 'none' }] })
    await checker.start()
    await checker.start()
    expect(fetched()).toBe(1)
    expect(scheduled).toHaveLength(1)
  })

  it('サインアウトしたら次の確認を取り消し、サインインしたらすぐ確かめる', async () => {
    const { checker, fetched, scheduled } = setup({
      answers: [{ kind: 'none' }, { kind: 'none' }],
    })
    await checker.start()
    checker.stop()
    expect(scheduled[0]?.cancelled).toBe(true)

    await checker.start()
    expect(fetched()).toBe(2)
  })
})
