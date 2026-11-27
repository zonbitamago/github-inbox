// 文字で探した語を、行の中で強調する範囲（2026-11-27 依頼者が S3b の確かめで求めた。D-032。S5 で PR の一覧にも広げた）。
// 出来事の一覧と PR の一覧の両方で使うため ui/ に置く。部品から切り離して単体テストを書く（component-frontend.md 7.）。

/** 文字で探す語。空白で区切り、大文字と小文字は区別しない */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
}

export interface TextPart {
  text: string
  /** 探した語に当たる */
  highlighted: boolean
}

/**
 * 文字を、探した語に当たる所と当たらない所に分ける。大文字と小文字は区別しない。
 * 語が重なる・続くときは1つにまとめる。小文字にすると長さが変わる文字を含むときは強調しない（位置がずれるため）
 */
export function highlightParts(text: string, words: readonly string[]): TextPart[] {
  const lower = text.toLowerCase()
  if (words.length === 0 || lower.length !== text.length) return [{ text, highlighted: false }]
  const marked = Array.from({ length: text.length }, () => false)
  for (const word of words) {
    if (word === '') continue
    for (let start = lower.indexOf(word); start !== -1; start = lower.indexOf(word, start + 1)) {
      marked.fill(true, start, start + word.length)
    }
  }
  const parts: TextPart[] = []
  let start = 0
  for (let index = 1; index <= text.length; index += 1) {
    if (index === text.length || marked[index] !== marked[start]) {
      parts.push({ text: text.slice(start, index), highlighted: marked[start] === true })
      start = index
    }
  }
  return parts.length === 0 ? [{ text, highlighted: false }] : parts
}
