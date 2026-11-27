// PR の一覧の絞り込み（component-frontend.md 2.2 の filterPrs、F-18、AC-22）。部品から切り離して単体テストを書く（7.）。
import type { PullRequestItem, PullRequestState, WaitingReason } from '../../../shared/domain'
import { searchWords } from '../../ui/highlight'

/** 理由の絞り込みの「自分待ちの理由あり（どれか1つ）」（F-18。AI案） */
export const ANY_REASON = 'any'
export type ReasonFilter = WaitingReason | typeof ANY_REASON

export interface PrFilter {
  /** 空なら絞らない。空白で区切った語を、すべて含む PR だけを残す（大文字と小文字は区別しない） */
  text: string
  /** undefined なら絞らない */
  state: PullRequestState | undefined
  /** "owner/name"。undefined なら絞らない */
  repository: string | undefined
  /** undefined なら絞らない */
  reason: ReasonFilter | undefined
}

export const NO_FILTER: PrFilter = {
  text: '',
  state: undefined,
  repository: undefined,
  reason: undefined,
}

export function isFiltering(filter: PrFilter): boolean {
  return (
    filter.text.trim() !== '' ||
    filter.state !== undefined ||
    filter.repository !== undefined ||
    filter.reason !== undefined
  )
}

/** 一覧の行に出すリポジトリと番号（"owner/name #123"）。探すときも同じ形で探す（見たまま強調できるように。D-032） */
export function repositoryLabel(item: PullRequestItem): string {
  return `${item.repository} #${item.number}`
}

/** 文字で探す対象: タイトル・リポジトリと番号・作成者（GitHub から取った文字だけ） */
function searchableText(item: PullRequestItem): string {
  return [item.title, repositoryLabel(item), item.author.login].join('\n').toLowerCase()
}

function matchesReason(item: PullRequestItem, reason: ReasonFilter): boolean {
  return reason === ANY_REASON
    ? item.waitingReasons.length > 0
    : item.waitingReasons.includes(reason)
}

/** 条件に合う PR だけを、並び（更新の新しい順）を変えずに返す */
export function filterPrs(items: readonly PullRequestItem[], filter: PrFilter): PullRequestItem[] {
  const words = searchWords(filter.text)
  return items.filter((item) => {
    if (filter.state !== undefined && item.state !== filter.state) return false
    if (filter.repository !== undefined && item.repository !== filter.repository) return false
    if (filter.reason !== undefined && !matchesReason(item, filter.reason)) return false
    if (words.length === 0) return true
    const text = searchableText(item)
    return words.every((word) => text.includes(word))
  })
}

/** 絞り込みの選択肢にするリポジトリ（重ねず、名前の順） */
export function repositoriesOf(items: readonly PullRequestItem[]): string[] {
  return [...new Set(items.map((item) => item.repository))].toSorted((a, b) => a.localeCompare(b))
}
