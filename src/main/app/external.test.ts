import { describe, expect, it } from 'vitest'
import { createDesktopNotificationSettingsOpener, createGitHubOpener } from './external'

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
