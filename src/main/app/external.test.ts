import { describe, expect, it } from 'vitest'
import { createGitHubOpener } from './external'

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
