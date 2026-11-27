// 自分待ちの理由のラベルの色（design-system.md 2.2）。色は意味のあるところだけに使う。
import type { WaitingReason } from '../../../shared/domain'
import type { BadgeTone } from '../../ui/Badge'

const REASON_TONES: Record<WaitingReason, BadgeTone> = {
  review_pending: 'primary',
  changes_requested: 'danger',
  ci_failed: 'danger',
  approved: 'success',
  assigned: 'neutral',
}

export function waitingReasonTone(reason: WaitingReason): BadgeTone {
  return REASON_TONES[reason]
}
