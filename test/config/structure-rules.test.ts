import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { ICruiseResult } from 'dependency-cruiser'
import { afterAll, describe, expect, it } from 'vitest'

// 構造の検査（.dependency-cruiser.cjs）の決まりが本当に効いているかを、架空のフォルダで確かめる（coding-standards.md 9.）。
// 設定の書き間違いで、読んではいけない向きが黙って通るのを防ぐ（作るときに1度起きた: Feature どうしの import が通っていた）。

const CONFIG = resolve('.dependency-cruiser.cjs')
const CLI = resolve('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs')

/** 架空のファイル。読み先は相対パスで書く */
const PROBES: Record<string, string> = {
  // 許す向き
  'src/shared/domain.ts': 'export const d = 1',
  'src/main/core/constants.ts': "import { d } from '../../shared/domain'\nexport const c = d",
  'src/main/store/events-store.ts': "import { c } from '../core/constants'\nexport const s = c",
  'src/main/index.ts': "import { s } from './store/events-store'\nexport const m = s",
  'src/renderer/main-store/main-store.ts': 'export const ms = 1',
  'src/renderer/ui/Badge.tsx': 'export const b = 1',
  'src/renderer/features/event-list/EventRow.tsx':
    "import { b } from '../../ui/Badge'\nimport { ms } from '../../main-store/main-store'\nexport const r = b + ms",
  // 許さない向き
  'src/renderer/ui/Probe.tsx': "import { c } from '../../main/core/constants'\nexport const x = c",
  'src/renderer/ui/Probe2.tsx':
    "import { ms } from '../main-store/main-store'\nexport const y = ms",
  'src/renderer/features/other/other.ts':
    "import { r } from '../event-list/EventRow'\nexport const o = r",
  'src/preload/index.ts': "import { c } from '../main/core/constants'\nexport const p = c",
  'src/main/ingest/ingest-service.ts':
    "import { t } from '../auth/token-store'\nexport const i = t",
  'src/main/auth/token-store.ts': 'export const t = 1',
  'src/main/store/probe.ts': "import { i } from '../ingest/ingest-service'\nexport const q = i",
  'src/main/unknown-folder/x.ts': "import { c } from '../core/constants'\nexport const u = c",
  'src/main/log/a.ts': "import { b2 } from './b'\nexport const a2 = b2",
  'src/main/log/b.ts': "import { a2 } from './a'\nexport const b2 = a2",
}

const root = mkdtempSync(join(tmpdir(), 'structure-rules-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('構造の検査が効いている', { timeout: 60_000 }, () => {
  it('許さない向き・循環・設計書に無いフォルダを、違反として見つける', () => {
    for (const [path, code] of Object.entries(PROBES)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), code)
    }
    // 決まりのパスは src/ から書いてあるので、架空のフォルダを今の場所にして CI と同じ道具で調べる
    const run = spawnSync(
      process.execPath,
      [CLI, 'src', '--config', CONFIG, '--output-type', 'json'],
      {
        cwd: root,
        encoding: 'utf-8',
      },
    )
    const result = JSON.parse(run.stdout) as ICruiseResult
    const violations = (result.summary.violations ?? [])
      .map((v) => `${v.rule.name}: ${v.from} → ${v.to}`)
      .toSorted()
    expect(violations).toEqual([
      'no-circular: src/main/log/a.ts → src/main/log/b.ts',
      'not-in-allowed: src/main/ingest/ingest-service.ts → src/main/auth/token-store.ts',
      'not-in-allowed: src/main/store/probe.ts → src/main/ingest/ingest-service.ts',
      'not-in-allowed: src/main/unknown-folder/x.ts → src/main/core/constants.ts',
      'not-in-allowed: src/preload/index.ts → src/main/core/constants.ts',
      'not-in-allowed: src/renderer/features/other/other.ts → src/renderer/features/event-list/EventRow.tsx',
      'not-in-allowed: src/renderer/ui/Probe.tsx → src/main/core/constants.ts',
      'not-in-allowed: src/renderer/ui/Probe2.tsx → src/renderer/main-store/main-store.ts',
    ])
  })
})
