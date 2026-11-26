// 画面の文言（日本語）。部品に文言を直接書かず、ここのキーを使う（coding-standards.md 4.、F-26）。
// 区分値の表示名は business-data.md の業務語。CI の結果と GitHub から取った文字は訳さない。
export const ja = {
  'common.loading': '読み込み中',
  'common.loadFailed': '読み込めませんでした。アプリを開き直してください。',
  'common.bot': 'bot',
  'onboarding.title': '使い始めの案内',
  'onboarding.preparing': 'サインインの手順は、次の版で作ります。',
  'eventList.title': '出来事',
  'eventList.empty': 'まだ出来事はありません',
  'eventType.review_requested': 'レビュー依頼',
  'eventType.review': 'レビュー',
  'eventType.comment': 'コメント',
  'eventType.ci': 'CI の結果',
  'eventType.mention': 'メンション',
  'eventType.assign': 'アサイン',
  'eventType.participating': '参加中の PR への発言',
} as const
