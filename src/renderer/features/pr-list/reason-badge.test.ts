import { describe, expect, it } from 'vitest'
import type { WaitingReason } from '../../../shared/domain'
import type { BadgeTone } from '../../ui/Badge'
import { waitingReasonTone } from './reason-badge'

// design-system.md 2.2 の表のとおり
describe('自分待ちの理由のラベルの色（design-system.md 2.2）', () => {
  it.each<[WaitingReason, BadgeTone]>([
    ['review_pending', 'primary'],
    ['changes_requested', 'danger'],
    ['ci_failed', 'danger'],
    ['approved', 'success'],
    ['assigned', 'neutral'],
  ])('%s は %s', (reason, tone) => {
    expect(waitingReasonTone(reason)).toBe(tone)
  })
})
