import { describe, expect, it } from 'vitest'
import { checkContractDocs } from '../../scripts/check-contract-docs'

// build-plan.md 6.3: 契約・判定を変える PR は、文書（domain-model.md・api-contract）か変更要求を同じ PR で直す
const CHECKED =
  '- [x] `src/shared/`・`src/main/core/` の変更は、契約・判定の変更ではない（整理だけ）'
const UNCHECKED =
  '- [ ] `src/shared/`・`src/main/core/` の変更は、契約・判定の変更ではない（整理だけ）'

describe('契約・判定の変更と文書の対応', () => {
  it.each([
    [
      '契約・判定に触れない',
      ['src/main/ingest/scheduler.ts', 'docs/build/build-plan.md'],
      UNCHECKED,
      true,
    ],
    ['判定のテストだけ', ['src/main/core/mention.test.ts'], UNCHECKED, true],
    ['フォルダの決まり（CLAUDE.md）だけ', ['src/shared/CLAUDE.md'], UNCHECKED, true],
    [
      '判定を変え、domain-model.md も直した',
      ['src/main/core/mention.ts', 'docs/design/components/domain-model.md'],
      UNCHECKED,
      true,
    ],
    [
      '契約を変え、api-contract も直した',
      ['src/shared/ipc-contract.ts', 'docs/design/api-contract/ipc-contract.md'],
      UNCHECKED,
      true,
    ],
    [
      '契約を変え、変更要求を起票した',
      ['src/shared/domain.ts', 'docs/build/change-requests/CR-006.md'],
      UNCHECKED,
      true,
    ],
    ['整理だけに印を付けた', ['src/main/core/expand-thread.ts'], CHECKED, true],
    [
      '整理だけに印を付けた（大文字の X）',
      ['src/main/core/expand-thread.ts'],
      CHECKED.replace('[x]', '[X]'),
      true,
    ],
    ['判定を変えたのに文書も印も無い', ['src/main/core/expand-thread.ts'], UNCHECKED, false],
    ['契約を変えたのに文書も印も無い（PR の本文が空）', ['src/shared/domain.ts'], '', false],
    [
      'ほかの設計書だけ直しても足りない',
      ['src/shared/domain.ts', 'docs/design/components/component-backend.md'],
      UNCHECKED,
      false,
    ],
  ])('%s → 通す: %s', (_name, changedFiles, prBody, expected) => {
    expect(checkContractDocs({ changedFiles, prBody }).ok).toBe(expected)
  })

  it('通さないときは、どのファイルが契約・判定かを伝える', () => {
    const result = checkContractDocs({
      changedFiles: ['src/shared/domain.ts', 'src/main/core/mention.ts'],
      prBody: '',
    })
    expect(result.message).toContain('src/shared/domain.ts')
    expect(result.message).toContain('src/main/core/mention.ts')
  })
})
