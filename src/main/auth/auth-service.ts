// 認証の流れ（auth-flow.md、component-backend.md 5.1）。
// 立ち上げ時のトークンの読み出し・版が変わったときのキーチェーンの案内・PAT の受け付け・サインアウトを受け持つ。
// 状態（AppState の auth と ingest）は publish で組み立てに渡す。auth/ を読めるのは組み立てだけ（component-backend.md 3.1）。
// GET /user で確かめられたら onSignedIn で取り込みに引き継ぎ、そこから先の受け取りの状態は取り込みが知らせる（⑭ S3）。
// トークンは token() で github/ の client にだけ渡す（I-7）。
import type { AppState, IpcErrorCode, Result } from '../../shared/ipc-contract'
import { POLL_INTERVAL_MS } from '../core/constants'
import type { ViewerResult } from '../github/viewer'
import type { Logger } from '../log/logger'
import { judgePat, normalizePat } from './pat'
import type { TokenLoad } from './token-store'

/** 認証が決める AppState の部分 */
export interface AuthView {
  auth: AppState['auth']
  ingest: AppState['ingest']
}

export interface TokenStorePort {
  exists(): Promise<boolean>
  load(): Promise<TokenLoad>
  save(token: string): Promise<'saved' | 'encryption_unavailable'>
  remove(): Promise<void>
}

/** やり直しの予約（テストで偽物に差し替える）。戻り値を呼ぶと取り消す */
export interface Timer {
  schedule(callback: () => void, delayMs: number): () => void
}

export interface AuthServiceDeps {
  tokenStore: TokenStorePort
  /** そのトークンで GET /user を問い合わせる */
  fetchViewer: (token: string) => Promise<ViewerResult>
  /** 今の版 */
  version: string
  platform: 'darwin' | 'win32'
  lastLaunchedVersion: () => string | undefined
  saveLastLaunchedVersion: (version: string) => Promise<void>
  /** 出来事と取り込みの記録を消し、画面に知らせる（auth-flow.md 6.） */
  clearEvents: () => Promise<void>
  publish: (view: AuthView) => void
  /** トークンを確かめられた。取り込みを始める（取り戻しから。component-backend.md 5.1、auth-flow.md 5.） */
  onSignedIn: (login: string) => void
  /** サインアウト・サインインし直しの前に、今の取り込みを止める */
  onSignedOut: () => void
  timer: Timer
  now: () => Date
  logger: Logger
}

const SIGNED_OUT: AuthView = { auth: { status: 'signed_out' }, ingest: { state: 'signed_out' } }
const KEYCHAIN_NOTICE: AuthView = {
  auth: { status: 'keychain_notice' },
  ingest: { state: 'signed_out' },
}
/** 認証し直す画面（使い始めの案内の手順2だけ）。トークンは消さない（auth-flow.md 4.） */
const SIGNING_IN: AuthView = { auth: { status: 'signing_in' }, ingest: { state: 'signed_out' } }

const okResult = <T>(value: T): Result<T> => ({ ok: true, value })
const failure = (code: IpcErrorCode) => ({ ok: false as const, error: { code } })
const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)

export class AuthService {
  private view: AuthView = SIGNED_OUT
  private current: string | undefined
  private login: string | undefined
  /** サインアウト・サインインのたびに進める。前の流れの結果で状態を戻さないため */
  private generation = 0
  private pendingUnlock = false
  private cancelRetry: (() => void) | undefined

  constructor(private readonly deps: AuthServiceDeps) {}

  /** 今のトークン。github/ の client にだけ渡す（I-7） */
  token(): string | undefined {
    return this.current
  }

  /**
   * 立ち上げの最初に、キーチェーンに触れずに決められる状態を返す（窓を開く前の AppState に使う）。
   * トークンの読み出しは resume で行う（component-backend.md 5.1）
   */
  async prepare(): Promise<AuthView> {
    if (!(await this.deps.tokenStore.exists())) {
      this.view = SIGNED_OUT
      return this.view
    }
    // 署名しないアプリは、版を上げるたびにキーチェーンの確認が出るため、読み出す前に案内する（auth-flow.md 4.）
    if (this.deps.platform === 'darwin' && this.deps.lastLaunchedVersion() !== this.deps.version) {
      this.view = KEYCHAIN_NOTICE
      return this.view
    }
    this.pendingUnlock = true
    this.view = this.signedIn({ state: 'syncing' })
    return this.view
  }

  /** prepare で読み出すと決めたなら、読み出して GET /user で確かめる */
  resume(): void {
    if (!this.pendingUnlock) return
    this.pendingUnlock = false
    this.unlock(this.generation).catch((error: unknown) => this.unexpected('unlock', error))
  }

  async continueAfterKeychainNotice(): Promise<Result<undefined>> {
    if (this.view.auth.status !== 'keychain_notice') return okResult(undefined)
    // ここでキーチェーンの確認が出る
    await this.unlock(this.generation)
    return okResult(undefined)
  }

  async submitPat(input: string): Promise<Result<{ login: string }>> {
    const token = normalizePat(input)
    if (token === '') return failure('pat_invalid')
    const judgement = judgePat(await this.deps.fetchViewer(token))
    if (!judgement.ok) return failure(judgement.code)
    if ((await this.deps.tokenStore.save(token)) === 'encryption_unavailable') {
      return failure('encryption_unavailable')
    }
    this.restart()
    this.current = token
    this.login = judgement.login
    // 同じ版で次に立ち上げたとき、キーチェーンの案内を出さないため（auth-flow.md 4.）
    await this.rememberVersion()
    this.publish(this.signedIn({ state: 'syncing' }))
    // 認証が切れた後にサインインし直したときも、取り戻しから再開する（auth-flow.md 5.）
    this.deps.onSignedIn(judgement.login)
    return okResult({ login: judgement.login })
  }

  async signOut(): Promise<Result<undefined>> {
    this.restart()
    await this.deps.tokenStore.remove()
    // 別のアカウントでサインインし直すときに、前のアカウントの出来事を残さない（auth-flow.md 6.）
    await this.deps.clearEvents()
    this.current = undefined
    this.login = undefined
    this.publish(SIGNED_OUT)
    return okResult(undefined)
  }

  /** 取り込みで 401 を受けた（auth-flow.md 5.）。認証し直すまで止める。保存済みの出来事は残す */
  expire(): void {
    if (this.view.auth.status !== 'signed_in') return
    this.restart()
    this.publish({ auth: this.authOf('auth_failed'), ingest: { state: 'auth_failed' } })
  }

  private async unlock(generation: number): Promise<void> {
    const loaded = await this.deps.tokenStore.load()
    if (generation !== this.generation) return
    if (loaded.kind === 'missing') {
      this.publish(SIGNED_OUT)
      return
    }
    if (loaded.kind === 'unreadable') {
      this.publish(SIGNING_IN)
      return
    }
    this.current = loaded.token
    await this.rememberVersion()
    if (generation !== this.generation) return
    this.publish(this.signedIn({ state: 'syncing' }))
    this.verify(generation).catch((error: unknown) => this.unexpected('verify', error))
  }

  /** GET /user で、トークンが使えるかとユーザー名を確かめる（component-backend.md 5.1） */
  private async verify(generation: number): Promise<void> {
    const token = this.current
    if (token === undefined) return
    const result = await this.deps.fetchViewer(token)
    if (generation !== this.generation) return
    if (result.kind === 'ok') {
      this.login = result.login
      // ここから先の受け取りの状態は、取り込みが知らせる（取り戻しの間は syncing。Q-03）
      this.publish(this.signedIn({ state: 'syncing' }))
      this.deps.onSignedIn(result.login)
      return
    }
    const failed = result.failure
    switch (failed.kind) {
      case 'auth_failed':
        // 認証し直すまで止める（auth-flow.md 5.、component-backend.md 6.1）
        this.publish({ auth: this.authOf('auth_failed'), ingest: { state: 'auth_failed' } })
        return
      case 'offline':
        this.publish(this.signedIn({ state: 'offline' }))
        this.retry(generation, POLL_INTERVAL_MS)
        return
      case 'rate_limited':
        this.publish(
          this.signedIn({ state: 'rate_limited', retryAt: failed.retryAt.toISOString() }),
        )
        this.retry(generation, Math.max(0, failed.retryAt.getTime() - this.deps.now().getTime()))
        return
      case 'not_accessible':
      case 'github_error':
        this.publish(this.signedIn({ state: 'github_error' }))
        this.retry(generation, POLL_INTERVAL_MS)
        return
    }
  }

  private retry(generation: number, delayMs: number): void {
    this.cancelRetry = this.deps.timer.schedule(() => {
      this.cancelRetry = undefined
      this.verify(generation).catch((error: unknown) => this.unexpected('verify', error))
    }, delayMs)
  }

  /** 今までの流れ（読み出し・やり直し・取り込み）を止める */
  private restart(): void {
    this.generation += 1
    this.pendingUnlock = false
    this.cancelRetry?.()
    this.cancelRetry = undefined
    this.deps.onSignedOut()
  }

  private async rememberVersion(): Promise<void> {
    if (this.deps.lastLaunchedVersion() === this.deps.version) return
    try {
      await this.deps.saveLastLaunchedVersion(this.deps.version)
    } catch (error) {
      // 覚えられなくても、次の立ち上げで案内が1回多く出るだけなので先へ進む
      this.deps.logger.warn('auth.version_save_failed', { error: errorName(error) })
    }
  }

  private authOf(status: 'signed_in' | 'auth_failed'): AppState['auth'] {
    return { status, ...(this.login === undefined ? {} : { login: this.login }), method: 'pat' }
  }

  private signedIn(ingest: AppState['ingest']): AuthView {
    return { auth: this.authOf('signed_in'), ingest }
  }

  private publish(view: AuthView): void {
    this.view = view
    this.deps.publish(view)
  }

  private unexpected(step: string, error: unknown): void {
    this.deps.logger.error('auth.unexpected', { step, error: errorName(error) })
  }
}
