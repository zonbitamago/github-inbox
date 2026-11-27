// PR の一覧（component-backend.md 4.・5.3、F-14〜F-18・F-20、Q-02）。
// サインインしたとき（立ち上げを含む）とリロードで、検索3本を同時に投げ（github-api.md 5.）、
// core/waiting-reasons でまとめて自分待ちの理由を付け、画面に送る（prs:updated）。
// 取得中にもう一度リロードが押されたら、新しく投げずに今の取得の結果を返す。
// サインインし直したら、取得中のものは捨てて取り直す（前のアカウントの一覧を出さないため）。
// ログには件数・期間・時間だけを書く。タイトルは書かない（Q-15）。
import type { AppState, IpcErrorCode, PrListSnapshot, Result } from '../../shared/ipc-contract'
import { buildPrList } from '../core/waiting-reasons'
import type { GitHubClient, GitHubFailure } from '../github/client'
import {
  prSearchBoundary,
  searchInvolves,
  searchOwnOpen,
  searchReviewRequested,
} from '../github/pr-search'
import type { Logger } from '../log/logger'

export interface PrListServiceDeps {
  client: GitHubClient
  /** PR の一覧の期間（設定。F-16） */
  periodDays: () => number
  now: () => Date
  logger: Logger
  /** 取得の状況を画面に知らせる（AppState.prList） */
  publish: (view: AppState['prList']) => void
  /** 取り終えた一覧を画面に送る（ipc-contract.md 3. の prs:updated） */
  updated: (snapshot: PrListSnapshot) => void
  /** 401 を受けた。認証の側で、認証が切れた状態にする（auth-flow.md 5.） */
  authFailed: () => void
}

/** 問い合わせの失敗のうち、どれを返すか（受け取りの状態の重さの順。component-frontend.md 5.） */
const FAILURE_ORDER: GitHubFailure['kind'][] = [
  'auth_failed',
  'rate_limited',
  'offline',
  'github_error',
  'not_accessible',
]

const ERROR_CODES: Record<GitHubFailure['kind'], IpcErrorCode> = {
  auth_failed: 'auth_failed',
  rate_limited: 'rate_limited',
  offline: 'offline',
  github_error: 'github_error',
  // 検索そのものの 403・404 は、GitHub の想定外の応答として扱う
  not_accessible: 'github_error',
}

const failure = (code: IpcErrorCode): Result<PrListSnapshot> => ({ ok: false, error: { code } })

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)

export class PrListService {
  private snapshot: PrListSnapshot | null = null
  /** サインインしている利用者のユーザー名（`assigned` の判定。WR-5）。止めている間は undefined */
  private viewer: string | undefined
  /** サインインし直す・止めるたびに増やし、前の取得の結果を捨てる */
  private generation = 0
  private inFlight: Promise<Result<PrListSnapshot>> | undefined
  /** 最後に終えた取得の結果（捨てた取得を待っていた頼みに返す） */
  private lastResult: Result<PrListSnapshot> | undefined
  private error: IpcErrorCode | undefined

  constructor(private readonly deps: PrListServiceDeps) {}

  /** 最後に取った一覧（ipc-contract.md 2. の prs:get） */
  current(): PrListSnapshot | null {
    return this.snapshot
  }

  /** サインインした（立ち上げ・PAT の貼り付け・サインインし直し）。取得中のものは捨てて取り直す（F-20） */
  start(login: string): Promise<Result<PrListSnapshot>> {
    this.generation += 1
    this.viewer = login
    this.lastResult = undefined
    return this.fetch()
  }

  /** リロード（F-20）。取得中なら、その取得の結果を返す */
  reload(): Promise<Result<PrListSnapshot>> {
    if (this.inFlight !== undefined) return this.inFlight
    if (this.viewer === undefined) {
      this.publish({ loading: false }, 'not_signed_in')
      return Promise.resolve(failure('not_signed_in'))
    }
    return this.fetch()
  }

  /** 認証が切れた・サインアウトする・サインインし直す前。取得中のものは捨てる。最後に取った一覧は残す */
  stop(): void {
    this.generation += 1
    this.viewer = undefined
    this.inFlight = undefined
    this.lastResult = undefined
    this.publish({ loading: false }, this.error)
  }

  /** サインアウトした。前のアカウントの一覧を残さない（auth-flow.md 6.） */
  clear(): void {
    this.stop()
    this.snapshot = null
    this.publish({ loading: false }, undefined)
  }

  private fetch(): Promise<Result<PrListSnapshot>> {
    const generation = this.generation
    const promise = this.run(generation).then((result) => {
      if (generation !== this.generation) {
        // 途中で止めた・取り直した取得。新しい取得があれば、待っていた頼みにはその結果を返す
        return this.inFlight ?? this.lastResult ?? result
      }
      this.inFlight = undefined
      this.lastResult = result
      return result
    })
    this.inFlight = promise
    return promise
  }

  private async run(generation: number): Promise<Result<PrListSnapshot>> {
    const viewer = this.viewer ?? ''
    const periodDays = this.deps.periodDays()
    const started = this.deps.now()
    this.publish({ loading: true }, undefined)
    const boundary = prSearchBoundary(started, periodDays)
    try {
      const [involves, reviewRequested, ownOpen] = await Promise.all([
        searchInvolves(this.deps.client, boundary),
        searchReviewRequested(this.deps.client, boundary),
        searchOwnOpen(this.deps.client, boundary),
      ])
      if (generation !== this.generation) return failure('not_signed_in')

      if (
        involves.kind === 'failed' ||
        reviewRequested.kind === 'failed' ||
        ownOpen.kind === 'failed'
      ) {
        const failed = [involves, reviewRequested, ownOpen].flatMap((result) =>
          result.kind === 'failed' ? [result.failure.kind] : [],
        )
        const kind = FAILURE_ORDER.find((candidate) => failed.includes(candidate))
        this.deps.logger.warn('pr_list.failed', { failure: kind })
        const code = kind === undefined ? 'internal' : ERROR_CODES[kind]
        this.publish({ loading: false }, code)
        // 認証の側が認証の切れた状態にし、ここも止める（stop）
        if (kind === 'auth_failed') this.deps.authFailed()
        return failure(code)
      }

      const items = buildPrList({
        viewer,
        involves: involves.nodes,
        reviewRequested: reviewRequested.nodes,
        ownOpen: ownOpen.nodes,
      })
      const finished = this.deps.now()
      const snapshot: PrListSnapshot = { items, periodDays, fetchedAt: finished.toISOString() }
      this.deps.logger.info('pr_list.fetched', {
        count: items.length,
        periodDays,
        ms: finished.getTime() - started.getTime(),
        skipped: involves.skipped + reviewRequested.skipped + ownOpen.skipped,
      })
      this.snapshot = snapshot
      this.publish({ loading: false }, undefined)
      this.deps.updated(snapshot)
      return { ok: true, value: snapshot }
    } catch (error) {
      if (generation !== this.generation) return failure('not_signed_in')
      this.deps.logger.error('pr_list.unexpected', { error: errorName(error) })
      this.publish({ loading: false }, 'internal')
      return failure('internal')
    }
  }

  private publish(view: { loading: boolean }, error: IpcErrorCode | undefined): void {
    this.error = error
    this.deps.publish(error === undefined ? view : { ...view, error })
  }
}
