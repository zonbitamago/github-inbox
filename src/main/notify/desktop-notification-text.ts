// デスクトップ通知の文言（component-backend.md 5.4）。タイトルは「種類・リポジトリ」、本文は「誰が・対象のタイトル」。
// 抜粋は出さない（画面の外に出る文字を少なくするため）。
// 種類・レビューの結果の言葉は、画面の i18n（src/renderer/i18n/）と同じにする（メインから画面は読めないため、ここに持つ）。
// CI の結果は訳さず GitHub の値のまま（business-data.md 2.3）。GitHub から取った文字も訳さない。
import type { EventType, GitHubEvent, Language, ReviewResult } from '../../shared/domain'

export interface DesktopNotificationText {
  title: string
  body: string
}

const EVENT_TYPE_LABELS: Record<Language, Record<EventType, string>> = {
  ja: {
    review_requested: 'レビュー依頼',
    review: 'レビュー',
    comment: 'コメント',
    ci: 'CI の結果',
    mention: 'メンション',
    assign: 'アサイン',
    participating: '参加中の PR への発言',
  },
  en: {
    review_requested: 'Review requested',
    review: 'Review',
    comment: 'Comment',
    ci: 'CI result',
    mention: 'Mention',
    assign: 'Assigned',
    participating: 'Activity on a PR you joined',
  },
}

const REVIEW_RESULT_LABELS: Record<Language, Record<ReviewResult, string>> = {
  ja: { approved: '承認', changes_requested: '修正依頼', commented: 'コメントのみ' },
  en: { approved: 'Approved', changes_requested: 'Changes requested', commented: 'Commented' },
}

/** 種類に添える結果（レビューの結果・CI の結果）。無ければ undefined */
function resultOf(event: GitHubEvent, language: Language): string | undefined {
  if (event.reviewResult !== undefined) return REVIEW_RESULT_LABELS[language][event.reviewResult]
  return event.ciConclusion
}

export function desktopNotificationText(
  event: GitHubEvent,
  language: Language,
): DesktopNotificationText {
  const type = EVENT_TYPE_LABELS[language][event.type]
  const result = resultOf(event, language)
  let label = type
  if (result !== undefined)
    label = language === 'ja' ? `${type}（${result}）` : `${type} (${result})`
  const { repository, number } = event.target
  const where = number === undefined ? repository : `${repository} #${String(number)}`
  return {
    title: `${label} · ${where}`,
    body: `${event.actor.login}: ${event.target.title}`,
  }
}
