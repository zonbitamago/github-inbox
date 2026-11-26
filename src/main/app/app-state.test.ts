import { describe, expect, it, vi } from 'vitest'
import { AppStateSchema } from '../../shared/ipc-contract'
import { DEFAULT_SETTINGS } from '../../shared/domain'
import { AppStateHolder, buildAppState, type AppStateParts } from './app-state'

const parts: AppStateParts = {
  version: '0.1.0',
  platform: 'darwin',
  inApplicationsFolder: true,
  settings: DEFAULT_SETTINGS,
  loginItemEnabled: false,
  auth: { status: 'signed_out' },
  ingest: { state: 'signed_out' },
  desktopNotification: {},
  prList: { loading: false },
}

describe('画面に渡す状態（ipc-contract.md 3. の AppState）', () => {
  it('契約の形になる', () => {
    expect(AppStateSchema.safeParse(buildAppState(parts)).success).toBe(true)
  })

  it.each([
    [undefined, true],
    ['2026-01-01T00:00:00Z', false],
  ])('使い始めの案内を終えた時刻が %s なら、案内が要るか: %s', (completedAt, expected) => {
    const settings = {
      ...DEFAULT_SETTINGS,
      onboarding: completedAt === undefined ? {} : { completedAt },
    }
    expect(buildAppState({ ...parts, settings }).onboardingRequired).toBe(expected)
  })

  it('変わったときだけ知らせる', () => {
    const onChange = vi.fn()
    const holder = new AppStateHolder(parts, onChange)
    holder.update({ ingest: { state: 'signed_out' } })
    expect(onChange).not.toHaveBeenCalled()
    holder.update({ ingest: { state: 'syncing' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ ingest: { state: 'syncing' } })
    expect(holder.get().ingest).toEqual({ state: 'syncing' })
  })
})
