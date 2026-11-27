// レビューの結果・CI の結果のラベルの色（design-system.md 2.2）。色は意味のあるところだけに使う。
import type { ReviewResult } from '../../../shared/domain'
import type { BadgeTone } from '../../ui/Badge'

const REVIEW_TONES: Record<ReviewResult, BadgeTone> = {
  approved: 'success',
  changes_requested: 'danger',
  commented: 'neutral',
}

/** CI の結果のうち、失敗の色にする値。ほかの値（cancelled・skipped など）は neutral（business-data.md 2.3） */
const CI_FAILURES = new Set(['failure', 'timed_out', 'startup_failure'])

export function reviewResultTone(result: ReviewResult): BadgeTone {
  return REVIEW_TONES[result]
}

export function ciConclusionTone(conclusion: string): BadgeTone {
  if (conclusion === 'success') return 'success'
  return CI_FAILURES.has(conclusion) ? 'danger' : 'neutral'
}
