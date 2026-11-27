// 取り込み（component-backend.md 5.1・5.2・6.）。
// サインインしたら（onSignedIn）、立ち上げ時の取り戻し（catchup）を行い、その後は60秒ごとの定期の取り込み（live）に移る。
// 1回分: GitHub の通知 → 分解するスレッドを選ぶ（core/select-threads）→ GraphQL・ワークフロー実行で分解（core）
//        → 出来事と取り込みの記録を同じ書き込みで保存（I-5）→ 画面に知らせる。
// トークンは持たない。client が問い合わせのたびに認証から受け取る（I-7）。ログには件数と種類だけを書く（Q-15）。
import type { GitHubEvent, IngestMode } from '../../shared/domain'
import type { AppState } from '../../shared/ipc-contract'
import { DAY_MS, INGEST_OVERLAP_MS, THREAD_FAILURE_LIMIT } from '../core/constants'
import {
  expandThread,
  mentionFallbackEvent,
  type ExpandInput,
  type Viewer,
} from '../core/expand-thread'
import { expandWorkflowRuns } from '../core/expand-workflow-runs'
import {
  githubNotificationsSince,
  selectThreads,
  type SelectedThread,
  type ThreadCursor,
} from '../core/select-threads'
import type { GitHubClient, GitHubFailure } from '../github/client'
import {
  fetchGitHubNotifications,
  fetchLatestComment,
  type GitHubNotificationThread,
} from '../github/notifications'
import type { RateBudget } from '../github/rate-budget'
import {
  fetchExpandSubjects,
  type ExpandResults,
  type ExpandTarget,
  type SubjectFailureReason,
} from '../github/timeline'
import { fetchTeams } from '../github/viewer'
import { fetchWorkflowRuns } from '../github/workflow-runs'
import type { Logger } from '../log/logger'
import type { EventsChange, GitHubNotificationCursor, ThreadRecord } from '../store/events-store'
import { IngestStatus } from './ingest-status'
import { isRateLimitLow, nextPollDelay, type CycleOutcome, type Timer } from './scheduler'

/** 出来事の記録（store/events-store）のうち、取り込みが使うもの */
export interface IngestStorePort {
  githubNotificationCursor(): GitHubNotificationCursor
  thread(id: string): ThreadRecord | undefined
  commit(change: EventsChange, now: Date): Promise<GitHubEvent[]>
  listForDisplay(eventDays: number, now: Date): GitHubEvent[]
}

export interface IngestServiceDeps {
  client: GitHubClient
  store: IngestStorePort
  /** events.json を読み終えるまで待つ（立ち上げ時） */
  storeLoaded: Promise<unknown>
  /** 出来事の一覧の日数（設定。F-32） */
  eventDays: () => number
  rateBudget: Pick<RateBudget, 'remaining'>
  timer: Timer
  now: () => Date
  logger: Logger
  /** 受け取りの状態を画面に知らせる（N-08） */
  publish: (ingest: AppState['ingest']) => void
  /** 定期の取り込み（live）で新しく保存した出来事。画面に足す（S4 でデスクトップ通知にも渡す） */
  added: (events: GitHubEvent[]) => void
  /** 取り戻しの終わりに、出来事の一覧の全体を入れ替える（ipc-contract.md 3. の events:reset） */
  reset: (events: GitHubEvent[]) => void
  /** 401 を受けた。認証の側で、認証が切れた状態にする（auth-flow.md 5.） */
  authFailed: () => void
}

interface Session {
  generation: number
  login: string
  /** 所属チーム。読めなかったときは null（domain-model.md 10. #1） */
  teams: string[] | null
  teamsFetchedAt: number | undefined
  /** GitHub の通知の X-Poll-Interval（秒） */
  pollIntervalSeconds: number | undefined
  /** 立ち上げ時の取り戻しが成功するまでは catchup（デスクトップ通知を出さない。DN-1） */
  mode: IngestMode
  running: boolean
  cancelTimer: (() => void) | undefined
}

/** スレッドごとの分解の結果（保存する出来事と記録） */
interface Expansion {
  events: GitHubEvent[]
  threads: Record<string, ThreadRecord>
  /** 失敗して、次の回にやり直すスレッドがある（GitHub の通知の記録を進めない） */
  retrying: boolean
}

type Step<T> = { kind: 'ok'; value: T } | { kind: 'failed'; failure: GitHubFailure }

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()

/** 問い合わせそのものの失敗（その回の取り込みをやり直す）か。リポジトリに入れないのはスレッドだけの失敗 */
const stopsCycle = (failure: GitHubFailure) => failure.kind !== 'not_accessible'

export class IngestService {
  private generation = 0
  private session: Session | undefined
  private readonly status = new IngestStatus()

  constructor(private readonly deps: IngestServiceDeps) {}

  /** サインインした（GET /user で確かめた）。取り戻しから始める */
  start(login: string): void {
    this.stop()
    this.generation += 1
    const session: Session = {
      generation: this.generation,
      login,
      teams: null,
      teamsFetchedAt: undefined,
      pollIntervalSeconds: undefined,
      mode: 'catchup',
      running: false,
      cancelTimer: undefined,
    }
    this.session = session
    this.deps.publish(this.status.syncing())
    this.run(session)
  }

  /** サインアウト・認証が切れた・サインインし直す。予定を取り消し、途中の回の結果は捨てる */
  stop(): void {
    this.generation += 1
    this.session?.cancelTimer?.()
    this.session = undefined
  }

  /** OS がスリープから戻った。すぐ1回問い合わせる（component-backend.md 6.1）。利用制限で止めている間は待つ */
  wake(): void {
    const session = this.session
    if (session === undefined || session.running) return
    if (this.status.current().state === 'rate_limited') return
    session.cancelTimer?.()
    session.cancelTimer = undefined
    this.run(session)
  }

  private run(session: Session): void {
    session.running = true
    this.cycle(session)
      .catch((error: unknown) => {
        // 保存できなかったなど。記録を進めていないので、次の回にやり直す（I-5）
        this.deps.logger.error('ingest.unexpected', { error: errorName(error) })
        return { kind: 'error' } satisfies CycleOutcome
      })
      .then((outcome) => this.after(session, outcome))
      .catch((error: unknown) =>
        this.deps.logger.error('ingest.unexpected', { error: errorName(error) }),
      )
  }

  private after(session: Session, outcome: CycleOutcome): void {
    session.running = false
    if (session.generation !== this.generation) return
    const now = this.deps.now()
    if (outcome.kind === 'ok') this.deps.publish(this.status.succeeded(now))
    if (outcome.kind === 'failed') {
      this.deps.publish(this.status.failed(outcome.failure))
      if (outcome.failure.kind === 'auth_failed') {
        // 認証し直すまで再開しない（component-backend.md 6.1）
        this.stop()
        this.deps.authFailed()
        return
      }
    }
    const delay = nextPollDelay({
      outcome,
      pollIntervalSeconds: session.pollIntervalSeconds,
      rateLimitLow: isRateLimitLow(this.deps.rateBudget, now),
      now,
    })
    if (delay === undefined) return
    session.cancelTimer = this.deps.timer.schedule(() => {
      session.cancelTimer = undefined
      this.run(session)
    }, delay)
  }

  /** 取り込みの1回分（component-backend.md 5.2） */
  private async cycle(session: Session): Promise<CycleOutcome> {
    await this.deps.storeLoaded
    const started = this.deps.now()
    const startedAt = started.toISOString()

    const teams = await this.refreshTeams(session, started)
    if (teams !== undefined) return { kind: 'failed', failure: teams }

    // 1. GitHub の通知（前回の ETag を If-None-Match に。CR-003）
    const cursor = this.deps.store.githubNotificationCursor()
    const since = githubNotificationsSince({
      lastSuccessAt: cursor.lastSuccessAt,
      now: startedAt,
      eventDays: this.deps.eventDays(),
    })
    const listed = await fetchGitHubNotifications(this.deps.client, { since, etag: cursor.etag })
    if (listed.kind === 'failed') return listed
    session.pollIntervalSeconds = listed.pollIntervalSeconds ?? session.pollIntervalSeconds
    if (listed.kind === 'not_modified') {
      // 変わっていない。保存しない（component-backend.md 7.）
      this.finishCatchup(session)
      return { kind: 'ok' }
    }

    // 2. 分解するスレッドを選ぶ（domain-model.md 4.1・5.）
    const cursors = new Map<string, ThreadCursor>()
    for (const thread of listed.threads) {
      const record = this.deps.store.thread(thread.id)
      if (record !== undefined) cursors.set(thread.id, record)
    }
    const selected = selectThreads({
      threads: listed.threads,
      cursors,
      githubNotificationsSince: since,
    })

    // 3. 分解する
    const expansion = await this.expand(session, selected, listed.threads, startedAt)
    if (expansion.kind === 'failed') return expansion

    // 4. 出来事と取り込みの記録を同じ書き込みで保存する（I-5）。やり直すスレッドがあれば、GitHub の通知の記録は進めない
    // 途中でサインアウトなどがあれば保存しない（前のアカウントの出来事を残さない。auth-flow.md 6.）
    if (session.generation !== this.generation) return { kind: 'ok' }
    const change: EventsChange = {
      events: expansion.value.events,
      threads: expansion.value.threads,
      ...(expansion.value.retrying
        ? {}
        : {
            githubNotifications: {
              lastSuccessAt: startedAt,
              ...(listed.etag === undefined ? {} : { etag: listed.etag }),
            },
          }),
    }
    const added = await this.deps.store.commit(change, this.deps.now())
    this.deps.logger.info('ingest.cycle', {
      mode: session.mode,
      threads: listed.threads.length,
      selected: selected.length,
      added: added.length,
      retrying: expansion.value.retrying,
    })
    if (session.generation !== this.generation) return { kind: 'ok' }
    if (session.mode === 'live') {
      const visible = this.withinEventDays(added)
      if (visible.length > 0) this.deps.added(visible)
    }
    this.finishCatchup(session)
    return { kind: 'ok' }
  }

  /** 所属チームを、立ち上げたときと24時間ごとに読む（github-api.md 6.）。読めなければ前のまま（初めは null） */
  private async refreshTeams(session: Session, started: Date): Promise<GitHubFailure | undefined> {
    if (
      session.teamsFetchedAt !== undefined &&
      started.getTime() - session.teamsFetchedAt < DAY_MS
    ) {
      return undefined
    }
    const result = await fetchTeams(this.deps.client)
    if (result.kind === 'failed') {
      const { failure } = result
      // 認証・利用制限・つながらないは、その回をやり直す。障害・入れないは、チームを読めないときの判定で進める
      if (
        failure.kind === 'auth_failed' ||
        failure.kind === 'rate_limited' ||
        failure.kind === 'offline'
      ) {
        return failure
      }
      this.deps.logger.warn('ingest.teams_unavailable', { failure: failure.kind })
    } else {
      session.teams = result.teams
    }
    session.teamsFetchedAt = started.getTime()
    return undefined
  }

  private async expand(
    session: Session,
    selected: SelectedThread[],
    threads: GitHubNotificationThread[],
    startedAt: string,
  ): Promise<Step<Expansion>> {
    const byId = new Map(threads.map((thread) => [thread.id, thread]))
    const viewer: Viewer = { login: session.login, teams: session.teams }
    const expansion: Expansion = { events: [], threads: {}, retrying: false }

    const targets: ExpandTarget[] = []
    const ciThreads: SelectedThread[] = []
    for (const item of selected) {
      if (item.route.kind === 'ci') ciThreads.push(item)
      else targets.push({ threadId: item.id, ...item.route, since: item.since })
    }

    const [subjects, runs] = await Promise.all([
      targets.length === 0
        ? Promise.resolve<ExpandResults>({ kind: 'ok', subjects: new Map() })
        : fetchExpandSubjects(this.deps.client, targets),
      Promise.all(
        ciThreads.map((item) =>
          fetchWorkflowRuns(this.deps.client, {
            repository: byId.get(item.id)?.repository ?? '',
            actor: session.login,
            since: item.since,
          }),
        ),
      ),
    ])
    if (subjects.kind === 'failed') return subjects
    const runsFailure = runs.find(
      (result) => result.kind === 'failed' && stopsCycle(result.failure),
    )
    if (runsFailure?.kind === 'failed') return runsFailure

    // PR・issue（domain-model.md 4.1 M-0〜M-9）
    for (const item of selected) {
      const thread = byId.get(item.id)
      if (thread === undefined || item.route.kind === 'ci') continue
      const result = subjects.subjects.get(item.id)
      if (result === undefined || result.kind === 'failed') {
        this.recordFailure(expansion, thread, item, result?.reason ?? 'graphql_error', startedAt)
        continue
      }
      const record = this.deps.store.thread(item.id)
      const input: ExpandInput = {
        viewer,
        thread: {
          id: thread.id,
          reason: thread.reason,
          updatedAt: thread.updatedAt,
          repository: thread.repository,
        },
        subject: result.subject,
        since: item.since,
        wasParticipating: record?.participating ?? false,
        receivedAt: startedAt,
      }
      const expanded = expandThread(input)
      const events = [...expanded.events]
      if (expanded.needsMentionFallback) {
        // M-9: 最新のコメントを読む（CR-004）
        const fallback = await this.mentionFallback(input, thread.latestCommentUrl)
        if (fallback.kind === 'failed') return fallback
        if (fallback.value !== null) events.push(fallback.value)
      }
      expansion.events.push(...events)
      expansion.threads[item.id] = this.succeededRecord(thread, startedAt, expanded.participating)
    }

    // CI の結果（github-api.md 4.）
    ciThreads.forEach((item, index) => {
      const thread = byId.get(item.id)
      const result = runs[index]
      if (thread === undefined || result === undefined) return
      if (result.kind === 'failed') {
        this.recordFailure(expansion, thread, item, 'not_accessible', startedAt)
        return
      }
      expansion.events.push(
        ...expandWorkflowRuns({
          viewer: session.login,
          repository: thread.repository,
          runs: result.runs,
          since: item.since,
          receivedAt: startedAt,
        }),
      )
      const participating = this.deps.store.thread(item.id)?.participating ?? false
      expansion.threads[item.id] = this.succeededRecord(thread, startedAt, participating)
    })

    return { kind: 'ok', value: expansion }
  }

  private async mentionFallback(
    input: ExpandInput,
    latestCommentUrl: string | null,
  ): Promise<Step<GitHubEvent | null>> {
    if (latestCommentUrl === null) {
      return { kind: 'ok', value: mentionFallbackEvent(input, null) }
    }
    const latest = await fetchLatestComment(this.deps.client, latestCommentUrl)
    if (latest.kind === 'failed') return latest
    return {
      kind: 'ok',
      value: mentionFallbackEvent(input, latest.kind === 'ok' ? latest.comment : null),
    }
  }

  private succeededRecord(
    thread: GitHubNotificationThread,
    startedAt: string,
    participating: boolean,
  ): ThreadRecord {
    return {
      reason: thread.reason,
      updatedAt: thread.updatedAt,
      // 次はこの時刻 − 5分以降を分解する（domain-model.md 5.）
      expandedUntil: startedAt,
      participating,
      consecutiveFailures: 0,
    }
  }

  /**
   * 1つのスレッドの分解に失敗した。記録は進めず、次の回にやり直す。
   * 続けて3回失敗したら、ログに残して記録を進める（1つのスレッドのせいで全体が止まらないように。component-backend.md 5.2）
   */
  private recordFailure(
    expansion: Expansion,
    thread: GitHubNotificationThread,
    item: SelectedThread,
    reason: SubjectFailureReason,
    startedAt: string,
  ): void {
    const record = this.deps.store.thread(item.id)
    const failures = (record?.consecutiveFailures ?? 0) + 1
    const participating = record?.participating ?? false
    if (failures >= THREAD_FAILURE_LIMIT) {
      this.deps.logger.warn('ingest.thread_given_up', { reason, failures })
      expansion.threads[item.id] = this.succeededRecord(thread, startedAt, participating)
      return
    }
    this.deps.logger.warn('ingest.thread_failed', { reason, failures })
    expansion.retrying = true
    expansion.threads[item.id] = {
      reason: thread.reason,
      updatedAt: thread.updatedAt,
      // 記録の無いスレッドは、次も同じ since から分解するよう「since + 5分」にしておく
      expandedUntil: record?.expandedUntil ?? plus(item.since, INGEST_OVERLAP_MS),
      participating,
      consecutiveFailures: failures,
    }
  }

  /** 取り戻しが成功したら、一覧の全体を画面に送り、定期の取り込みに移る */
  private finishCatchup(session: Session): void {
    if (session.mode !== 'catchup' || session.generation !== this.generation) return
    session.mode = 'live'
    this.deps.reset(this.deps.store.listForDisplay(this.deps.eventDays(), this.deps.now()))
  }

  /** 出来事の一覧の日数以内のもの（I-4） */
  private withinEventDays(events: GitHubEvent[]): GitHubEvent[] {
    const oldest = this.deps.now().getTime() - this.deps.eventDays() * DAY_MS
    return events.filter((event) => Date.parse(event.occurredAt) >= oldest)
  }
}
