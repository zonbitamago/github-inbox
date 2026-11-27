import { describe, expect, it } from 'vitest'
import { ciConclusionTone, reviewResultTone } from './result-badge'

// design-system.md 2.2「ラベル（Badge）」
describe('結果のラベルの色（design-system.md 2.2）', () => {
  it.each([
    ['approved', 'success'],
    ['changes_requested', 'danger'],
    ['commented', 'neutral'],
  ] as const)('レビューの結果 %s → %s', (result, tone) => {
    expect(reviewResultTone(result)).toBe(tone)
  })

  it.each([
    ['success', 'success'],
    ['failure', 'danger'],
    ['timed_out', 'danger'],
    ['startup_failure', 'danger'],
    ['cancelled', 'neutral'],
    ['skipped', 'neutral'],
    ['action_required', 'neutral'],
  ])('CI の結果 %s → %s', (conclusion, tone) => {
    expect(ciConclusionTone(conclusion)).toBe(tone)
  })
})
