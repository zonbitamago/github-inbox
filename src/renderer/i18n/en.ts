import type { ja } from './ja'

// 画面の文言（英語）。キーは ja.ts と同じ（型で縛る）
export const en: Record<keyof typeof ja, string> = {
  'common.loading': 'Loading',
  'common.loadFailed': 'Could not load. Please reopen the app.',
  'common.bot': 'bot',
  'onboarding.title': 'Getting started',
  'onboarding.preparing': 'Sign-in steps will come in the next version.',
  'eventList.title': 'Events',
  'eventList.empty': 'No events yet',
  'eventType.review_requested': 'Review requested',
  'eventType.review': 'Review',
  'eventType.comment': 'Comment',
  'eventType.ci': 'CI result',
  'eventType.mention': 'Mention',
  'eventType.assign': 'Assigned',
  'eventType.participating': 'Activity on a PR you joined',
}
