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
