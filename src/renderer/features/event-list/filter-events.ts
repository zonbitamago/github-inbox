// 出来事の一覧の絞り込み（component-frontend.md 2.2 の filterEvents、F-13、AC-16）。部品から切り離して単体テストを書く（7.）。
import type { EventType, GitHubEvent } from '../../../shared/domain'

export interface EventFilter {
  /** 空なら絞らない。空白で区切った語を、すべて含む出来事だけを残す（大文字と小文字は区別しない） */
  text: string
  /** undefined なら絞らない */
  type: EventType | undefined
  /** "owner/name"。undefined なら絞らない */
  repository: string | undefined
}

export const NO_FILTER: EventFilter = { text: '', type: undefined, repository: undefined }

export function isFiltering(filter: EventFilter): boolean {
  return filter.text.trim() !== '' || filter.type !== undefined || filter.repository !== undefined
}

/** 一覧の行に出すリポジトリと番号（"owner/name #123"）。探すときも同じ形で探す（見たまま強調できるように） */
export function repositoryLabel(event: GitHubEvent): string {
  const number = event.target.number === undefined ? '' : ` #${event.target.number}`
  return `${event.target.repository}${number}`
}

/** 文字で探す語。空白で区切り、大文字と小文字は区別しない */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
}

/** 文字で探す対象: 対象のタイトル・リポジトリと番号・誰が・抜粋・CI の結果（GitHub から取った文字だけ） */
function searchableText(event: GitHubEvent): string {
  return [
    event.target.title,
    repositoryLabel(event),
    event.actor.login,
    event.excerpt ?? '',
    event.ciConclusion ?? '',
  ]
    .join('\n')
    .toLowerCase()
}

/** 条件に合う出来事だけを、並びを変えずに返す */
export function filterEvents(events: readonly GitHubEvent[], filter: EventFilter): GitHubEvent[] {
  const words = searchWords(filter.text)
  return events.filter((event) => {
    if (filter.type !== undefined && event.type !== filter.type) return false
    if (filter.repository !== undefined && event.target.repository !== filter.repository) {
      return false
    }
    if (words.length === 0) return true
    const text = searchableText(event)
    return words.every((word) => text.includes(word))
  })
}

/** 絞り込みの選択肢にするリポジトリ（重ねず、名前の順） */
export function repositoriesOf(events: readonly GitHubEvent[]): string[] {
  return [...new Set(events.map((event) => event.target.repository))].toSorted((a, b) =>
    a.localeCompare(b),
  )
}
