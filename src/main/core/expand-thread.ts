// GitHub の通知のスレッドを出来事に分解する（domain-model.md 4.1。I-1 の分解の側・I-2・I-3）。
// 規則は M-0〜M-9 の番号と1対1にする。出典ごとに上から当てはめ、最初に当たったもので決める。
import type { Actor, EventType, GitHubEvent, ReviewResult, Target } from '../../shared/domain'
import { EXCERPT_MAX_LENGTH, GHOST_LOGIN } from './constants'
import type {
  GhAuthor,
  GhIssueNode,
  GhLatestComment,
  GhPullRequestNode,
  GhReviewNode,
  GhTimelineNode,
} from './github-shapes'
import { containsTeamMention, mentionsLogin, mentionsTeam } from './mention'
import { isParticipating } from './participation'

export interface Viewer {
  login: string
  /** 所属チーム（"組織/チーム"）。読めなかったときは null（domain-model.md 10. #1） */
  teams: readonly string[] | null
}

export interface ThreadInfo {
  /** GitHub の通知のスレッドの id */
  id: string
  /** スレッドの最新の理由（reason） */
  reason: string
  /** スレッドの更新時刻（updated_at） */
  updatedAt: string
  /** "owner/name" */
  repository: string
}

export type ExpandSubject =
  { kind: 'pull_request'; node: GhPullRequestNode } | { kind: 'issue'; node: GhIssueNode }

export interface ExpandInput {
  viewer: Viewer
  thread: ThreadInfo
  subject: ExpandSubject
  /** この時刻以降の出典だけを分解する（取り込みの記録の「分解した時刻 − 5分」。domain-model.md 5.） */
  since: string
  /** スレッドの取り込みの記録に残っている「参加中」 */
  wasParticipating: boolean
  /** 受け取った時刻（core は時計に触れない） */
  receivedAt: string
}

export interface ExpandResult {
  /** 発生の古い順 */
  events: GitHubEvent[]
  /** スレッドの取り込みの記録に残す「参加中」（domain-model.md 4.2） */
  participating: boolean
  /** M-9 に当たる。最新のコメントを読んで mentionFallbackEvent に渡す（CR-004） */
  needsMentionFallback: boolean
}

/** 出典1つ分。種類の判定に要るものだけ */
interface Source {
  id: string
  occurredAt: string
  author: GhAuthor | null
  /** メンションを探す本文（コメント・レビューの本文と行へのコメント・新しい本文） */
  texts: string[]
  url: string
  excerpt: string | undefined
  kind:
    | { type: 'comment' }
    | { type: 'review'; review: GhReviewNode }
    | { type: 'review_requested'; requestedReviewer: { __typename: string; login?: string } | null }
    | { type: 'assigned'; assignee: { __typename: string; login?: string } | null }
    | { type: 'body' }
}

type Classified = { type: EventType; reviewResult?: ReviewResult; viaTeam?: true } | null

const sameLogin = (a: string | undefined, b: string) =>
  a !== undefined && a.toLowerCase() === b.toLowerCase()

function toActor(author: GhAuthor | null): Actor {
  return author === null
    ? { login: GHOST_LOGIN, isBot: false }
    : { login: author.login, isBot: author.__typename === 'Bot' }
}

function excerptOf(text: string | null | undefined): string | undefined {
  if (text === null || text === undefined || text === '') return undefined
  return Array.from(text).slice(0, EXCERPT_MAX_LENGTH).join('')
}

/** 本文が空で、行へのコメントが既存のスレッドへの返信1件だけのレビュー（M-4。CR-002） */
function isReplyOnly(review: GhReviewNode): boolean {
  const [first, ...rest] = review.comments.nodes
  return review.body === '' && first !== undefined && rest.length === 0 && first.replyTo !== null
}

/** M-5: GitHub のレビューの状態 → レビューの結果（business-data.md 2.2。DISMISSED は commented。CR-005） */
function toReviewResult(state: string): ReviewResult {
  if (state === 'APPROVED') return 'approved'
  if (state === 'CHANGES_REQUESTED') return 'changes_requested'
  return 'commented'
}

function sourcesOf(subject: ExpandSubject): Source[] {
  const { node } = subject
  const sources: Source[] = [
    {
      id: `${node.id}:body`,
      occurredAt: node.createdAt,
      author: node.author,
      texts: [node.body],
      url: node.url,
      excerpt: excerptOf(node.body),
      kind: { type: 'body' },
    },
  ]
  for (const item of node.timelineItems.nodes as GhTimelineNode[]) {
    if (item.__typename === 'IssueComment') {
      sources.push({
        id: item.id,
        occurredAt: item.createdAt,
        author: item.author,
        texts: [item.body],
        url: item.url,
        excerpt: excerptOf(item.body),
        kind: { type: 'comment' },
      })
    } else if (item.__typename === 'ReviewRequestedEvent') {
      sources.push({
        id: item.id,
        occurredAt: item.createdAt,
        author: item.actor,
        texts: [],
        url: node.url,
        excerpt: undefined,
        kind: { type: 'review_requested', requestedReviewer: item.requestedReviewer },
      })
    } else {
      sources.push({
        id: item.id,
        occurredAt: item.createdAt,
        author: item.actor,
        texts: [],
        url: node.url,
        excerpt: undefined,
        kind: { type: 'assigned', assignee: item.assignee },
      })
    }
  }
  if (subject.kind === 'pull_request') {
    for (const review of subject.node.reviews.nodes) {
      // 下書き中（提出していない）のレビューは使わない（M-5）
      if (review.submittedAt === null) continue
      const firstComment = review.comments.nodes[0]
      sources.push({
        id: review.id,
        occurredAt: review.submittedAt,
        author: review.author,
        texts: [review.body, ...review.comments.nodes.map((comment) => comment.body)],
        // 返信だけのレビューは、開く先を返信のコメントにする
        url: isReplyOnly(review) && firstComment !== undefined ? firstComment.url : review.url,
        excerpt: excerptOf(review.body === '' ? firstComment?.body : review.body),
        kind: { type: 'review', review },
      })
    }
  }
  return sources
}

interface Context {
  viewer: Viewer
  threadReason: string
  isPullRequest: boolean
  /** 利用者が作った PR・issue */
  ownSubject: boolean
  /** 他人が作った open（下書きを除く）の PR（M-8） */
  othersOpenPr: boolean
  participating: boolean
}

/** M-7: 本文に @利用者 か、所属チームへのメンションがあるか */
function mentionsViewer(source: Source, context: Context): boolean {
  const { viewer } = context
  return source.texts.some((text) => {
    if (mentionsLogin(text, viewer.login)) return true
    if (viewer.teams !== null) return mentionsTeam(text, viewer.teams)
    // 所属チームを読めないときは、理由が team_mention のスレッドで @組織/チーム の形があること（domain-model.md 10. #1）
    return context.threadReason === 'team_mention' && containsTeamMention(text)
  })
}

function classify(source: Source, context: Context): Classified {
  const { kind } = source
  // M-0: 出典を作った人が利用者自身
  if (sameLogin(source.author?.login, context.viewer.login)) return null
  if (kind.type === 'review_requested') {
    const reviewer = kind.requestedReviewer
    // M-1: 依頼先が利用者
    if (reviewer?.__typename === 'User' && sameLogin(reviewer.login, context.viewer.login)) {
      return { type: 'review_requested' }
    }
    // M-2: 依頼先がチームで、スレッドの理由が review_requested
    if (reviewer?.__typename === 'Team' && context.threadReason === 'review_requested') {
      return { type: 'review_requested', viaTeam: true }
    }
    return null
  }
  if (kind.type === 'assigned') {
    // M-3: 担当者が利用者
    const assignee = kind.assignee
    return assignee?.__typename === 'User' && sameLogin(assignee.login, context.viewer.login)
      ? { type: 'assign' }
      : null
  }
  const ownPullRequest = context.isPullRequest && context.ownSubject
  if (kind.type === 'review' && ownPullRequest) {
    // M-4: 返信だけのレビュー
    if (isReplyOnly(kind.review)) return { type: 'comment' }
    // M-5: レビュー
    return { type: 'review', reviewResult: toReviewResult(kind.review.state) }
  }
  // M-6: 利用者が作った PR へのコメント
  if (kind.type === 'comment' && ownPullRequest) return { type: 'comment' }
  // M-7: メンション
  if (mentionsViewer(source, context)) return { type: 'mention' }
  // M-8: 参加中の、他人が作った open の PR へのコメント・レビュー
  if (kind.type !== 'body' && context.othersOpenPr && context.participating) {
    return { type: 'participating' }
  }
  return null
}

function targetOf(input: ExpandInput): Target {
  const { node } = input.subject
  return {
    kind: input.subject.kind,
    repository: input.thread.repository,
    number: node.number,
    title: node.title,
    url: node.url,
  }
}

export function expandThread(input: ExpandInput): ExpandResult {
  const { subject, viewer } = input
  const sources = sourcesOf(subject).filter((source) => source.occurredAt >= input.since)
  const isPullRequest = subject.kind === 'pull_request'
  const participating = isPullRequest
    ? isParticipating({
        wasParticipating: input.wasParticipating,
        threadReason: input.thread.reason,
        viewerLatestReview: subject.node.viewerLatestReview,
        viewerAuthoredSource: sources.some(
          (source) =>
            (source.kind.type === 'comment' || source.kind.type === 'review') &&
            sameLogin(source.author?.login, viewer.login),
        ),
      })
    : input.wasParticipating
  const context: Context = {
    viewer,
    threadReason: input.thread.reason,
    isPullRequest,
    ownSubject: sameLogin(subject.node.author?.login, viewer.login),
    othersOpenPr:
      isPullRequest &&
      !sameLogin(subject.node.author?.login, viewer.login) &&
      subject.node.state === 'OPEN' &&
      !subject.node.isDraft,
    participating,
  }

  const target = targetOf(input)
  const events: GitHubEvent[] = []
  let mentionFound = false
  for (const source of sources) {
    if (!sameLogin(source.author?.login, viewer.login) && mentionsViewer(source, context)) {
      mentionFound = true
    }
    const classified = classify(source, context)
    if (classified === null) continue
    events.push({
      id: source.id,
      type: classified.type,
      ...(classified.reviewResult === undefined ? {} : { reviewResult: classified.reviewResult }),
      ...(classified.viaTeam === undefined ? {} : { viaTeam: classified.viaTeam }),
      target,
      actor: toActor(source.author),
      occurredAt: source.occurredAt,
      ...(source.excerpt === undefined ? {} : { excerpt: source.excerpt }),
      url: source.url,
      receivedAt: input.receivedAt,
    })
  }

  return {
    events: events.toSorted((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    participating,
    // M-9: 理由がメンションなのに、M-7 で1件も見つからなかった
    needsMentionFallback:
      (input.thread.reason === 'mention' || input.thread.reason === 'team_mention') &&
      !mentionFound,
  }
}

/**
 * M-9 の出来事（CR-004）。出典は GitHub の通知の最新のコメント（subject.latest_comment_url を読んだもの）。
 * 空か読めなかったとき（null）は、対象の作者・対象のページ・抜粋なしにする。
 * 発言者が利用者自身なら作らない（M-0）。
 */
export function mentionFallbackEvent(
  input: ExpandInput,
  latestComment: GhLatestComment | null,
): GitHubEvent | null {
  const user = latestComment === null ? undefined : latestComment.user
  if (user !== undefined && user !== null && sameLogin(user.login, input.viewer.login)) return null
  let actor: Actor
  if (user === undefined) {
    actor = toActor(input.subject.node.author)
  } else if (user === null) {
    actor = { login: GHOST_LOGIN, isBot: false }
  } else {
    actor = { login: user.login, isBot: user.type === 'Bot' }
  }
  const excerpt = excerptOf(latestComment?.body)
  return {
    // domain-model.md 3. の最後の行
    id: `${input.thread.id}@${input.thread.updatedAt}`,
    type: 'mention',
    target: targetOf(input),
    actor,
    occurredAt: input.thread.updatedAt,
    ...(excerpt === undefined ? {} : { excerpt }),
    url: latestComment?.html_url ?? input.subject.node.url,
    receivedAt: input.receivedAt,
  }
}
