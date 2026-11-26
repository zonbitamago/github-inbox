// @メンションの照合（domain-model.md 4.1 M-7）。
// 大文字と小文字を区別せず、前後が英数字・`-`・`/` でないことを条件にする（@foo が @foobar や @org/foo に当たらない）。

const BOUNDARY_BEFORE = '(?<![A-Za-z0-9/-])'
const BOUNDARY_AFTER = '(?![A-Za-z0-9/-])'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 本文に @login があるか */
export function mentionsLogin(text: string, login: string): boolean {
  return new RegExp(`${BOUNDARY_BEFORE}@${escapeRegExp(login)}${BOUNDARY_AFTER}`, 'i').test(text)
}

/** 本文に、所属チーム（"組織/チーム"）のどれかへの @組織/チーム があるか（D-020） */
export function mentionsTeam(text: string, teams: readonly string[]): boolean {
  return teams.some((team) =>
    new RegExp(`${BOUNDARY_BEFORE}@${escapeRegExp(team)}${BOUNDARY_AFTER}`, 'i').test(text),
  )
}

/**
 * 本文に @組織/チーム の形があるか。
 * 所属チームを読めないときの代わりの判定に使う（domain-model.md 10. #1）
 */
export function containsTeamMention(text: string): boolean {
  return new RegExp(`${BOUNDARY_BEFORE}@[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*`).test(
    text,
  )
}
