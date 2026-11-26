import { describe, expect, it } from 'vitest'
import { isGitHubUrl } from './url-guard'

// I-8・security-rules.md S-06: https で、ホストが github.com ちょうど、ユーザー名・パスワード・ポートが無いものだけ
describe('I-8: 外で開く・コピーする URL の検査', () => {
  it.each([
    ['https://github.com/'],
    ['https://github.com/example-org/app/pull/101'],
    ['https://github.com/example-org/app/pull/101#issuecomment-1'],
    ['https://github.com/login/device'],
    ['https://GitHub.com/example-org'],
    ['https://github.com:443/example-org'],
  ])('通す: %s', (url) => {
    expect(isGitHubUrl(url)).toBe(true)
  })

  it.each([
    ['http://github.com/'],
    ['https://github.com.example.com/'],
    ['https://example.com/github.com/'],
    ['https://api.github.com/repos/example-org/app'],
    ['https://gist.github.com/alice'],
    ['https://user:pass@github.com/'],
    ['https://user@github.com/'],
    ['https://github.com:8443/'],
    ['https://example.com\\@github.com/'],
    ['javascript:alert(1)'],
    ['github.com/example-org'],
    [''],
  ])('通さない: %s', (url) => {
    expect(isGitHubUrl(url)).toBe(false)
  })
})
