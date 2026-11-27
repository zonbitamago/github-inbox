import { describe, expect, it } from 'vitest'
import {
  createDesktopNotificationSettingsOpener,
  createGitHubOpener,
  createLinkCopier,
} from './external'

function setup() {
  const opened: string[] = []
  const openGitHub = createGitHubOpener((url) => {
    opened.push(url)
    return Promise.resolve()
  })
  return { openGitHub, opened }
}

describe('ブラウザで GitHub を開く（ipc-contract.md 2. の shell:openGitHub、I-8）', () => {
  it('github.com の URL は開く', async () => {
    const { openGitHub, opened } = setup()
    const url =
      'https://github.com/settings/tokens/new?scopes=repo,notifications&description=github-inbox'
    await expect(openGitHub(url)).resolves.toEqual({ ok: true, value: undefined })
    expect(opened).toEqual([url])
  })

  it.each([
    ['よく似たホスト', 'https://github.com.example.com/settings/tokens'],
    ['http', 'http://github.com/settings/tokens'],
    ['URL でない', 'settings/tokens'],
  ])('%s は開かずに断る', async (_name, url) => {
    const { openGitHub, opened } = setup()
    await expect(openGitHub(url)).resolves.toEqual({
      ok: false,
      error: { code: 'url_not_allowed' },
    })
    expect(opened).toEqual([])
  })
})

// N-09・F-36 (4)。開く先はメインが OS ごとに決めた固定の先だけ（ipc-contract.md 2.、security-rules.md S-06）
describe('OS のデスクトップ通知の設定を開く（os:openNotificationSettings）', () => {
  it.each([
    ['Mac', 'darwin', 'x-apple.systempreferences:com.apple.Notifications-Settings.extension'],
    ['Windows', 'win32', 'ms-settings:notifications'],
  ] satisfies [string, 'darwin' | 'win32', string][])(
    '%s は OS の設定の通知の画面を開く',
    async (_name, platform, url) => {
      const opened: string[] = []
      const openSettings = createDesktopNotificationSettingsOpener(platform, (target) => {
        opened.push(target)
        return Promise.resolve()
      })
      await expect(openSettings()).resolves.toEqual({ ok: true, value: undefined })
      expect(opened).toEqual([url])
    },
  )
})

// F-34、AC-36。コピーするのも URL の検査（I-8）を通したものだけ（ipc-contract.md 2. の clipboard:copyLinks）
describe('リンクをまとめてコピーする（clipboard:copyLinks）', () => {
  function copier() {
    const written: string[] = []
    const copy = createLinkCopier((text) => written.push(text))
    return { copy, written }
  }

  it('渡された順に、1行1つずつ書き、件数を返す', async () => {
    const { copy, written } = copier()
    const urls = [
      'https://github.com/example-org/app/pull/101',
      'https://github.com/example-org/api/pull/7',
    ]
    await expect(copy({ urls })).resolves.toEqual({ ok: true, value: { count: 2 } })
    expect(written).toEqual([
      'https://github.com/example-org/app/pull/101\nhttps://github.com/example-org/api/pull/7',
    ])
  })

  it('1件でも検査に通らなければ、全体を断り、何も書かない', async () => {
    const { copy, written } = copier()
    await expect(
      copy({
        urls: [
          'https://github.com/example-org/app/pull/101',
          'https://github.com.example.com/example-org/app/pull/1',
        ],
      }),
    ).resolves.toEqual({ ok: false, error: { code: 'url_not_allowed' } })
    expect(written).toEqual([])
  })

  it('0件なら何も書かない（前にコピーしたものを消さない）', async () => {
    const { copy, written } = copier()
    await expect(copy({ urls: [] })).resolves.toEqual({ ok: true, value: { count: 0 } })
    expect(written).toEqual([])
  })
})
