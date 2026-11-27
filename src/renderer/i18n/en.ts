import type { ja } from './ja'

// 画面の文言（英語）。キーは ja.ts と同じ（型で縛る）
export const en: Record<keyof typeof ja, string> = {
  'common.loading': 'Loading',
  'common.loadFailed': 'Could not load. Please reopen the app.',
  'common.bot': 'bot',
  'onboarding.title': 'Getting started',
  'onboarding.finish.title': 'You are all set',
  'onboarding.finish.signedInAs': 'Signed in as',
  'onboarding.finish.start': 'Start',
  'onboarding.finish.failed': 'Could not continue. Please try again.',
  'auth.signIn.title': 'Sign in to GitHub',
  'auth.signIn.again': 'Sign in to GitHub again',
  'auth.pat.intro':
    'Create a "personal access token (classic)" on GitHub and paste it here to sign in.',
  'auth.pat.scopeNotice':
    'The creation page describes repo as "Full control of private repositories", but this app only reads from GitHub and never writes to it.',
  'auth.pat.step.open':
    'Press "Open the creation page" (repo and notifications are already selected)',
  'auth.pat.step.generate':
    'Choose an Expiration and press "Generate token" at the bottom of the page',
  'auth.pat.step.paste': 'Copy the token shown and paste it below',
  'auth.pat.openCreatePage': 'Open the creation page',
  'auth.pat.openFailed': 'Could not open the creation page. Please try again.',
  'auth.pat.tokenLabel': 'Token',
  'auth.pat.submit': 'Sign in',
  'auth.pat.checking': 'Checking',
  'auth.pat.error.invalid':
    'Could not sign in to GitHub with this token. Check that it was pasted correctly and has not expired.',
  'auth.pat.error.missingScope':
    'The token does not have the repo scope. Create a classic token again with repo and notifications selected.',
  'auth.pat.error.offline': 'Cannot reach GitHub. Check your network and try again.',
  'auth.pat.error.rateLimited': 'GitHub rate limit reached. Please wait a while and try again.',
  'auth.pat.error.encryptionUnavailable':
    "The token cannot be saved because this computer's secure storage is not available.",
  'auth.pat.error.other': 'Could not sign in. Please try again.',
  'keychainNotice.title': 'A new version was installed',
  'keychainNotice.body': 'Next, a dialog will ask for access to the keychain. Press "Allow".',
  'keychainNotice.continue': 'Continue',
  'keychainNotice.failed': 'Could not continue. Please try again.',
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
