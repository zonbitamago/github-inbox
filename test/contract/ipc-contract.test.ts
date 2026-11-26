import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/shared/domain'
import {
  AppStateSchema,
  INVOKE_CHANNELS,
  IPC_ERROR_CODES,
  PUSH_CHANNELS,
  SettingsPatchSchema,
  invokeContract,
  isInvokeChannel,
  isPushChannel,
  resultSchema,
} from '../../src/shared/ipc-contract'
import { codesIn, readDoc, section, tableRows } from '../support/markdown'

const doc = readDoc('docs/design/api-contract/ipc-contract.md')

function firstColumnCodes(markdown: string): string[] {
  return tableRows(markdown).map((cells) => codesIn(cells[0] ?? '')[0] ?? '')
}

describe('ipc-contract.md とコードが揃っている', () => {
  it('2. の依頼のチャンネルと、コードのチャンネルが同じ', () => {
    expect(INVOKE_CHANNELS.toSorted()).toEqual(firstColumnCodes(section(doc, '## 2.')).toSorted())
  })

  it('3. の知らせのチャンネルと、コードのチャンネルが同じ', () => {
    expect(PUSH_CHANNELS.toSorted()).toEqual(firstColumnCodes(section(doc, '## 3.')).toSorted())
  })

  it('4. の失敗のコードと、コードの IpcErrorCode が同じ', () => {
    expect([...IPC_ERROR_CODES].toSorted()).toEqual(
      firstColumnCodes(section(doc, '## 4.')).toSorted(),
    )
  })
})

describe('チャンネルの判定', () => {
  it.each([
    ['app:getState', true],
    ['events:list', true],
    ['shell:openExternal', false],
    ['toString', false],
    [42, false],
  ])('%s は依頼のチャンネルか: %s', (value, expected) => {
    expect(isInvokeChannel(value)).toBe(expected)
  })

  it.each([
    ['state:changed', true],
    ['ui:focusEvent', true],
    ['app:getState', false],
    ['hasOwnProperty', false],
  ])('%s は知らせのチャンネルか: %s', (value, expected) => {
    expect(isPushChannel(value)).toBe(expected)
  })
})

describe('引数の検査（S-08。.strict() で余分な項目も断る）', () => {
  it('引数の無いチャンネルは、何か渡されたら断る', () => {
    expect(invokeContract['app:getState'].args.safeParse(undefined).success).toBe(true)
    expect(invokeContract['app:getState'].args.safeParse({}).success).toBe(false)
  })

  it.each([
    [{ prPeriodDays: 1 }, true],
    [{ prPeriodDays: 30, eventDays: 7 }, true],
    [{}, true],
    [{ prPeriodDays: 0 }, false],
    [{ eventDays: 31 }, false],
    [{ eventDays: 1.5 }, false],
    [{ onboarding: {} }, false],
    [{ lastLaunchedVersion: '1.0.0' }, false],
    [{ desktopNotification: { bots: false } }, false],
    [{ desktopNotification: DEFAULT_SETTINGS.desktopNotification }, true],
  ])('設定の一部 %j を受けるか: %s', (patch, expected) => {
    expect(SettingsPatchSchema.safeParse(patch).success).toBe(expected)
  })

  it.each([
    ['', false],
    ['x', true],
    ['x'.repeat(255), true],
    ['x'.repeat(256), false],
  ])('PAT の長さ %#: 受けるか %s', (token, expected) => {
    expect(invokeContract['auth:submitPat'].args.safeParse({ token }).success).toBe(expected)
  })

  it('PAT の引数に余分な項目があれば断る', () => {
    expect(
      invokeContract['auth:submitPat'].args.safeParse({ token: 'test-token-not-real', extra: 1 })
        .success,
    ).toBe(false)
  })

  it('リンクのコピーは1,000件まで', () => {
    const urls = (count: number) => Array.from({ length: count }, () => 'https://github.com/')
    expect(invokeContract['clipboard:copyLinks'].args.safeParse({ urls: urls(1000) }).success).toBe(
      true,
    )
    expect(invokeContract['clipboard:copyLinks'].args.safeParse({ urls: urls(1001) }).success).toBe(
      false,
    )
  })
})

describe('戻り値の形（ipc-contract.md 4.）', () => {
  const schema = resultSchema(invokeContract['loginItem:set'].args)

  it.each([
    [{ ok: true, value: { enabled: true } }, true],
    [{ ok: false, error: { code: 'offline' } }, true],
    [{ ok: false, error: { code: 'unknown_code' } }, false],
    [{ ok: false, error: { code: 'offline', message: '文言はメインから送らない' } }, false],
    [{ ok: true }, false],
  ])('%j を受けるか: %s', (value, expected) => {
    expect(schema.safeParse(value).success).toBe(expected)
  })

  it('Result<void> は value を省いても受ける', () => {
    const voidResult = invokeContract['auth:signOut'].result
    expect(voidResult.safeParse({ ok: true }).success).toBe(true)
    expect(voidResult.safeParse({ ok: true, value: undefined }).success).toBe(true)
  })
})

describe('AppState', () => {
  const base = {
    appInfo: { version: '0.1.0', platform: 'darwin', inApplicationsFolder: true },
    auth: { status: 'signed_out' },
    ingest: { state: 'signed_out' },
    desktopNotification: {},
    settings: DEFAULT_SETTINGS,
    loginItem: { enabled: false },
    onboardingRequired: true,
    prList: { loading: false },
  }

  it('最小の状態を受ける', () => {
    expect(AppStateSchema.safeParse(base).success).toBe(true)
  })

  it('auth にトークンの項目を足すと断る（I-7）', () => {
    expect(
      AppStateSchema.safeParse({
        ...base,
        auth: { status: 'signed_in', login: 'alice', token: 'test-token-not-real' },
      }).success,
    ).toBe(false)
  })
})
