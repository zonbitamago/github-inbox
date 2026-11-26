// 参加中の PR の判定（domain-model.md 4.2）。一度 true になったら戻さない。

export interface ParticipationInput {
  /** スレッドの取り込みの記録に残っている値 */
  wasParticipating: boolean
  /** スレッドの今の理由 */
  threadReason: string
  viewerLatestReview: { state: string } | null
  /** 今回分解した出典（タイムラインと reviews の一覧）に、利用者のコメント・レビューがあるか */
  viewerAuthoredSource: boolean
}

export function isParticipating(input: ParticipationInput): boolean {
  return (
    input.wasParticipating ||
    // PT-1: 利用者がレビューしたことがある
    input.viewerLatestReview !== null ||
    // PT-2: 分解した出典に利用者のコメント・レビューがある
    input.viewerAuthoredSource ||
    // PT-3: スレッドの理由が comment
    input.threadReason === 'comment'
  )
}
