// 画面の文言（日本語）。部品に文言を直接書かず、ここのキーを使う（coding-standards.md 4.、F-26）。
// 区分値の表示名は business-data.md の業務語。CI の結果と GitHub から取った文字は訳さない。
export const ja = {
  'common.loading': '読み込み中',
  'common.loadFailed': '読み込めませんでした。アプリを開き直してください。',
  'common.bot': 'bot',
  'common.all': 'すべて',
  'onboarding.title': '使い始めの案内',
  'onboarding.finish.title': '準備ができました',
  'onboarding.finish.signedInAs': 'サインインしたアカウント',
  'onboarding.finish.start': '使い始める',
  'onboarding.finish.failed': '進めませんでした。もう一度押してください。',
  'auth.signIn.title': 'GitHub でサインイン',
  'auth.signIn.again': 'GitHub にサインインし直す',
  'auth.signIn.back': '出来事の一覧に戻る',
  'auth.pat.intro':
    'GitHub で「personal access token（classic）」を作り、ここに貼るとサインインできます。',
  'auth.pat.scopeNotice':
    '作成ページでは repo が「Full control of private repositories（プライベートリポジトリの完全な制御）」と表示されますが、このアプリは GitHub を読むだけで、書き込みはしません。',
  'auth.pat.step.open': '「作成ページを開く」を押す（repo と notifications は選んであります）',
  'auth.pat.step.generate': 'Expiration（有効期限）を選び、ページの下の「Generate token」を押す',
  'auth.pat.step.paste': '表示されたトークンをコピーして、下に貼る',
  'auth.pat.openCreatePage': '作成ページを開く',
  'auth.pat.openFailed': '作成ページを開けませんでした。もう一度押してください。',
  'auth.pat.tokenLabel': 'トークン',
  'auth.pat.submit': 'サインイン',
  'auth.pat.checking': '確かめています',
  'auth.pat.error.invalid':
    'このトークンでは GitHub にサインインできませんでした。貼り間違いや有効期限切れが無いか確かめてください。',
  'auth.pat.error.missingScope':
    'トークンに repo のスコープがありません。classic のトークンで、repo と notifications を選んで作り直してください。',
  'auth.pat.error.offline':
    'GitHub につながりません。ネットワークを確かめてから、もう一度押してください。',
  'auth.pat.error.rateLimited':
    'GitHub の利用制限にかかりました。しばらく待ってから、もう一度押してください。',
  'auth.pat.error.encryptionUnavailable':
    'この PC の安全な保管場所が使えないため、トークンを保存できません。',
  'auth.pat.error.other': 'サインインできませんでした。もう一度押してください。',
  'keychainNotice.title': '新しい版を入れました',
  'keychainNotice.body':
    'この後、キーチェーンへのアクセスを求める確認が出ます。「許可」を押してください。',
  'keychainNotice.continue': '続ける',
  'keychainNotice.failed': '続けられませんでした。もう一度押してください。',
  'eventList.title': '出来事',
  'eventList.empty': 'まだ出来事はありません',
  'eventList.noMatch': '条件に合う出来事はありません',
  'eventList.filter.label': '出来事の絞り込み',
  'eventList.filter.text': '文字で探す',
  'eventList.filter.type': '種類',
  'eventList.filter.repository': 'リポジトリ',
  'eventList.filter.clear': '絞り込みを解く',
  'eventList.openFailed': 'GitHub のページを開けませんでした。もう一度押してください。',
  'eventList.viaTeam': 'チーム宛て',
  'reviewResult.approved': '承認',
  'reviewResult.changes_requested': '修正依頼',
  'reviewResult.commented': 'コメントのみ',
  'ingestStatus.authFailed': 'GitHub の認証が切れたため、出来事を受け取れていません。',
  'ingestStatus.rateLimited': 'GitHub の利用制限にかかったため、受け取りを止めています。',
  'ingestStatus.offline':
    'GitHub につながらないため、出来事を受け取れていません。つながったら自動で再開します。',
  'ingestStatus.githubError':
    'GitHub の障害のため、出来事を受け取れていません。自動でやり直します。',
  'ingestStatus.syncing': '出来事を取り込んでいます。',
  'ingestStatus.signInAgain': 'サインインし直す',
  'ingestStatus.retryAt': '再開する時刻',
  'ingestStatus.lastSuccessAt': '最後に受け取った時刻',
  'desktopNotificationFailure.osRejected':
    'デスクトップ通知を出せませんでした。OS の通知の設定で、このアプリの通知がオフになっているかもしれません。',
  'desktopNotificationFailure.outsideApplicationsFolder':
    'デスクトップ通知を出せませんでした。アプリケーションフォルダの外から開いているためです。アプリケーションフォルダに移してから、開き直してください。',
  'desktopNotificationFailure.failedAt': '出せなかった時刻',
  'desktopNotificationFailure.openSettings': 'OS の通知の設定を開く',
  'desktopNotificationFailure.openSettingsFailed':
    'OS の通知の設定を開けませんでした。OS の設定から「通知」を開いてください。',
  'eventType.review_requested': 'レビュー依頼',
  'eventType.review': 'レビュー',
  'eventType.comment': 'コメント',
  'eventType.ci': 'CI の結果',
  'eventType.mention': 'メンション',
  'eventType.assign': 'アサイン',
  'eventType.participating': '参加中の PR への発言',
} as const
