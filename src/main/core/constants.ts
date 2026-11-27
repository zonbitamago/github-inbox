// メインプロセスの数値の決まりを1か所に置く（coding-standards.md 4.「数値の決まり」）。
// core に置くのは、core が src/shared と core の中しか import できず、ほかの部品は core を import できるため。

/** 取り込みの重なり。GitHub 側の時刻のずれと、GitHub の通知が作られるまでの遅れを吸収する（domain-model.md 5.。AI案） */
export const INGEST_OVERLAP_MS = 5 * 60 * 1000

/** デスクトップ通知を出すのは、発生からこの時間以内の出来事だけ（domain-model.md 4.4 DN-2、D-026、Q-06） */
export const DESKTOP_NOTIFICATION_WINDOW_MS = 10 * 60 * 1000

/** 出来事の本文の抜粋の長さ（文字数。⑬ B3 で AI が決めた） */
export const EXCERPT_MAX_LENGTH = 200

/** 作者が消えたアカウントのとき、GitHub と同じく "ghost" と出す（⑬ B3 で AI が決めた） */
export const GHOST_LOGIN = 'ghost'

/** 保存する出来事は、発生からこの日数まで。過ぎたら消す（domain-model.md 7. I-4、N-10、AC-40） */
export const EVENT_RETENTION_DAYS = 30

/** ログを残す日数（non-functional.md Q-15、security-rules.md S-09） */
export const LOG_RETENTION_DAYS = 7

/** 壊れて退避した保存のファイルを残す日数（component-backend.md 7.。AI案） */
export const CORRUPT_FILE_RETENTION_DAYS = 7

export const DAY_MS = 24 * 60 * 60 * 1000

/** GitHub への問い合わせの時間切れ（github-api.md 1.）。過ぎたら「つながらない」とする（component-backend.md 6.3） */
export const GITHUB_REQUEST_TIMEOUT_MS = 30 * 1000

/** GitHub に同時に投げる問い合わせの数。REST と GraphQL を合わせて（component-backend.md 6.2、Q-04） */
export const MAX_CONCURRENT_GITHUB_REQUESTS = 4

/** 平常の問い合わせの間隔。立ち上げ時の GET /user がつながらなかったときも、この間隔でやり直す（component-backend.md 5.1・6.1、N-01） */
export const POLL_INTERVAL_MS = 60 * 1000
