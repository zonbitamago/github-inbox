// 新しい版の確認（F-31、component-backend.md 5.1）。サインインしたら（立ち上げ直後の確かめを含む）確かめ、その後は24時間ごと。
// GitHub への問い合わせはトークンが要るため、サインインしていない間は確かめない（⑭ S6b。2026-11-27 技術者が決めた）。
// 今の版より新しい版が出ていたら、版と Releases のページを画面に知らせる（AppState.update）。失敗したらログに書き、次の回を待つ。
import type { AppState } from '../../shared/ipc-contract'
import { DAY_MS } from '../core/constants'
import { isGitHubUrl } from '../core/url-guard'
import type { LatestReleaseResult } from '../github/releases'
import type { Logger } from '../log/logger'

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)

export type Version = readonly [major: number, minor: number, patch: number]

/** `1.2.3`・`v1.2.3`（build-and-release.md 1.）を読む。ほかの形（試しの版の印を含むものなど）は undefined */
export function parseVersion(text: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (match === null) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function isNewerVersion(candidate: Version, current: Version): boolean {
  const [major, minor, patch] = candidate
  const [currentMajor, currentMinor, currentPatch] = current
  if (major !== currentMajor) return major > currentMajor
  if (minor !== currentMinor) return minor > currentMinor
  return patch > currentPatch
}

export interface UpdateCheckerDeps {
  fetchLatest: () => Promise<LatestReleaseResult>
  /** 今の版（package.json の version） */
  currentVersion: string
  /** callback を delayMs 後に呼ぶ。戻り値で取り消す */
  schedule: (callback: () => void, delayMs: number) => () => void
  logger: Logger
  publish: (update: AppState['update']) => void
}

export class UpdateChecker {
  private cancelNext: (() => void) | undefined

  constructor(private readonly deps: UpdateCheckerDeps) {}

  /** サインインしたとき。もう次の確認を決めてあれば何もしない。戻り値は今回の確認が終わるとき（失敗しても reject しない） */
  start(): Promise<void> {
    if (this.cancelNext !== undefined) return Promise.resolve()
    return this.run()
  }

  /** サインアウトしたとき・認証が切れたとき。知らせた新しい版は残す（アカウントに関わらないため） */
  stop(): void {
    this.cancelNext?.()
    this.cancelNext = undefined
  }

  private run(): Promise<void> {
    this.cancelNext = this.deps.schedule(() => void this.run(), DAY_MS)
    return this.check().catch((error: unknown) =>
      this.deps.logger.error('update_check.unexpected', { error: errorName(error) }),
    )
  }

  private async check(): Promise<void> {
    const { logger, currentVersion } = this.deps
    const current = parseVersion(currentVersion)
    if (current === undefined) {
      logger.warn('update_check.unparsable', { which: 'current' })
      return
    }
    const result = await this.deps.fetchLatest()
    if (result.kind === 'failed') {
      logger.warn('update_check.failed', { failure: result.failure.kind })
      return
    }
    if (result.kind === 'none') {
      logger.info('update_check.checked', { current: currentVersion, newer: false })
      this.deps.publish(undefined)
      return
    }
    const latest = parseVersion(result.tagName)
    if (latest === undefined) {
      logger.warn('update_check.unparsable', { which: 'latest' })
      return
    }
    // 画面から開くときも shell:openGitHub で確かめるが、https://github.com/ の外は知らせもしない（I-8）
    if (!isGitHubUrl(result.htmlUrl)) {
      logger.warn('update_check.url_not_allowed')
      return
    }
    const newer = isNewerVersion(latest, current)
    logger.info('update_check.checked', {
      current: currentVersion,
      latest: result.tagName,
      newer,
    })
    this.deps.publish(newer ? { version: latest.join('.'), url: result.htmlUrl } : undefined)
  }
}
