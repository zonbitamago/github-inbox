// I-8・security-rules.md S-06: 外で開く・コピーする URL の検査。
// 文字列の前方一致で判定しない（https://github.com.example.com/ などを通さないため）。

export function isGitHubUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === 'github.com' &&
    url.username === '' &&
    url.password === '' &&
    url.port === ''
  )
}
