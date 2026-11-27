import { describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import { createApplicationsFolderMover } from './applications-folder'

// F-36 (1)、AC-41。component-backend.md 8.
describe('アプリケーションフォルダへ移す（onboarding:moveToApplicationsFolder）', () => {
  function setup(
    options: {
      platform?: 'darwin' | 'win32'
      packaged?: boolean
      inside?: boolean
      move?: () => boolean
    } = {},
  ) {
    let moved = 0
    const logger = createMemoryLogger()
    const moveToApplicationsFolder = createApplicationsFolderMover({
      platform: options.platform ?? 'darwin',
      packaged: options.packaged ?? true,
      isInApplicationsFolder: () => options.inside ?? false,
      move: () => {
        moved += 1
        return options.move?.() ?? true
      },
      logger,
    })
    return { moveToApplicationsFolder, logger, moved: () => moved }
  }

  it('Mac でアプリケーションフォルダの外なら移す', async () => {
    const { moveToApplicationsFolder, moved, logger } = setup()
    await expect(moveToApplicationsFolder()).resolves.toEqual({ ok: true, value: undefined })
    expect(moved()).toBe(1)
    expect(logger.entries.map((entry) => entry.kind)).toEqual(['app.moved_to_applications_folder'])
  })

  it('もうアプリケーションフォルダにあれば、移さずに成功とする', async () => {
    const { moveToApplicationsFolder, moved } = setup({ inside: true })
    await expect(moveToApplicationsFolder()).resolves.toEqual({ ok: true, value: undefined })
    expect(moved()).toBe(0)
  })

  it('Windows ではできない', async () => {
    const { moveToApplicationsFolder, moved } = setup({ platform: 'win32' })
    await expect(moveToApplicationsFolder()).resolves.toEqual({
      ok: false,
      error: { code: 'not_supported' },
    })
    expect(moved()).toBe(0)
  })

  it('開発用の立ち上げでは移さない（Electron そのものを移さないため）', async () => {
    const { moveToApplicationsFolder, moved } = setup({ packaged: false })
    await expect(moveToApplicationsFolder()).resolves.toEqual({
      ok: false,
      error: { code: 'not_supported' },
    })
    expect(moved()).toBe(0)
  })

  it('利用者が許可の確認でやめたら、移せなかったと返す', async () => {
    const { moveToApplicationsFolder, logger } = setup({ move: () => false })
    await expect(moveToApplicationsFolder()).resolves.toEqual({
      ok: false,
      error: { code: 'internal' },
    })
    expect(logger.entries.map((entry) => entry.kind)).toEqual([
      'app.move_to_applications_folder_cancelled',
    ])
  })

  it('移す途中で失敗したら、例外の名前だけをログに書き、移せなかったと返す', async () => {
    const { moveToApplicationsFolder, logger } = setup({
      move: () => {
        throw new TypeError('/Users/someone/Downloads/github-inbox.app')
      },
    })
    await expect(moveToApplicationsFolder()).resolves.toEqual({
      ok: false,
      error: { code: 'internal' },
    })
    expect(logger.entries).toEqual([
      {
        level: 'error',
        kind: 'app.move_to_applications_folder_failed',
        fields: { error: 'TypeError' },
      },
    ])
  })
})
