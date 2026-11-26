import { describe, expect, it } from 'vitest'
import {
  AUTH_METHODS,
  AUTH_STATUSES,
  DEFAULT_SETTINGS,
  DESKTOP_NOTIFICATION_FAILURES,
  EVENT_TYPES,
  GitHubEventSchema,
  INGEST_MODES,
  INGEST_STATES,
  LANGUAGES,
  LAYOUTS,
  PULL_REQUEST_STATES,
  REVIEW_RESULTS,
  SettingsSchema,
  TARGET_KINDS,
  WAITING_REASONS,
} from '../../src/shared/domain'
import { codesIn, readDoc, section, tableRows } from '../support/markdown'

const businessData = readDoc('docs/requirements/business-data.md')
const domainModel = readDoc('docs/design/components/domain-model.md')

function businessCodes(heading: string): string[] {
  return tableRows(section(businessData, heading)).map((cells) => codesIn(cells[0] ?? '')[0] ?? '')
}

describe('business-data.md 2. の区分値と、コードが同じ（順番も）', () => {
  it.each([
    ['### 2.1', EVENT_TYPES],
    ['### 2.2', REVIEW_RESULTS],
    ['### 2.4', PULL_REQUEST_STATES],
    ['### 2.5', WAITING_REASONS],
  ])('%s', (heading, codes) => {
    expect([...codes]).toEqual(businessCodes(heading))
  })
})

describe('domain-model.md 6. の技術上の区分値と、コードが同じ（順番も）', () => {
  const rows = tableRows(section(domainModel, '## 6.'))
  const codesOf = (typeName: string) => {
    const row = rows.find((cells) => codesIn(cells[0] ?? '').includes(typeName))
    if (row === undefined) {
      throw new Error(`domain-model.md 6. に ${typeName} の行が無い`)
    }
    return codesIn(row[1] ?? '')
  }

  it.each([
    ['TargetKind', TARGET_KINDS],
    ['IngestMode', INGEST_MODES],
    ['IngestState', INGEST_STATES],
    ['DesktopNotificationFailure', DESKTOP_NOTIFICATION_FAILURES],
    ['Layout', LAYOUTS],
    ['Language', LANGUAGES],
    ['AuthMethod', AUTH_METHODS],
    ['AuthStatus', AUTH_STATUSES],
  ])('%s', (typeName, codes) => {
    expect([...codes]).toEqual(codesOf(typeName))
  })
})

describe('設定', () => {
  it('既定値はスキーマに合う', () => {
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true)
  })

  it('既定ではすべての種類でデスクトップ通知を出し、bot の発言も出す（D-014）', () => {
    expect(Object.values(DEFAULT_SETTINGS.desktopNotification.byType).every(Boolean)).toBe(true)
    expect(Object.keys(DEFAULT_SETTINGS.desktopNotification.byType).toSorted()).toEqual(
      [...EVENT_TYPES].toSorted(),
    )
    expect(DEFAULT_SETTINGS.desktopNotification.bots).toBe(true)
  })

  it('種類が1つでも欠けた設定は断る', () => {
    const byType: Partial<Record<string, boolean>> = {
      ...DEFAULT_SETTINGS.desktopNotification.byType,
    }
    delete byType['review']
    expect(
      SettingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        desktopNotification: { ...DEFAULT_SETTINGS.desktopNotification, byType },
      }).success,
    ).toBe(false)
  })
})

describe('出来事', () => {
  const comment = {
    id: 'IC_kwDOexample1',
    type: 'comment',
    target: {
      kind: 'pull_request',
      repository: 'example-org/app',
      number: 1,
      title: '架空の PR',
      url: 'https://github.com/example-org/app/pull/1',
    },
    actor: { login: 'bob', isBot: false },
    occurredAt: '2026-11-26T03:54:21Z',
    url: 'https://github.com/example-org/app/pull/1#issuecomment-1',
    receivedAt: '2026-11-26T03:55:00.000Z',
  }

  it('コメントの出来事を受ける', () => {
    expect(GitHubEventSchema.safeParse(comment).success).toBe(true)
  })

  it.each([
    ['reviewResult', 'approved', 'review'],
    ['ciConclusion', 'success', 'ci'],
    ['viaTeam', true, 'review_requested'],
  ])('%s は type = %s 以外では断る', (field, value, ownType) => {
    expect(GitHubEventSchema.safeParse({ ...comment, [field]: value }).success).toBe(false)
    expect(GitHubEventSchema.safeParse({ ...comment, type: ownType, [field]: value }).success).toBe(
      true,
    )
  })

  it.each([['example-org'], ['example-org/app/extra'], ['example org/app']])(
    'リポジトリが "owner/name" の形でなければ断る: %s',
    (repository) => {
      expect(
        GitHubEventSchema.safeParse({ ...comment, target: { ...comment.target, repository } })
          .success,
      ).toBe(false)
    },
  )

  it('時刻が UTC の ISO 8601 でなければ断る', () => {
    expect(
      GitHubEventSchema.safeParse({ ...comment, occurredAt: '2026-11-26T12:54:21+09:00' }).success,
    ).toBe(false)
  })
})
