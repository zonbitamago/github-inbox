import { describe, expect, it } from 'vitest'
import {
  RECORDED_SINCE,
  VIEWER,
  botIssue,
  latestCommentIssueBody,
  latestCommentIssueComment,
  latestCommentPrBody,
  othersPrMention,
  othersPrParticipating,
  othersPrRequested,
  ownMergedPr,
  ownOpenPr,
} from '../../../test/support/github-fixtures'
import { GitHubEventSchema } from '../../shared/domain'
import { EXCERPT_MAX_LENGTH } from './constants'
import { expandThread, mentionFallbackEvent, type ExpandInput } from './expand-thread'
import type { GhIssueNode, GhPullRequestNode, GhReviewNode, GhTimelineNode } from './github-shapes'

const RECEIVED_AT = '2026-01-31T01:00:00.000Z'

function prInput(node: GhPullRequestNode, change: Partial<ExpandInput> = {}): ExpandInput {
  return {
    viewer: { login: VIEWER, teams: ['example-org/reviewers'] },
    thread: {
      id: '48060042228',
      reason: 'mention',
      updatedAt: '2026-01-30T23:47:29Z',
      repository: 'example-org/app',
    },
    subject: { kind: 'pull_request', node },
    since: RECORDED_SINCE,
    wasParticipating: false,
    receivedAt: RECEIVED_AT,
    ...change,
  }
}

function issueInput(node: GhIssueNode, change: Partial<ExpandInput> = {}): ExpandInput {
  return { ...prInput(ownOpenPr(), change), subject: { kind: 'issue', node }, ...change }
}

/** PR の出典を1つだけにする（書き換えた応答。判定の規則を1つずつ確かめるため） */
function onlyTimeline(node: GhPullRequestNode, item: GhTimelineNode): GhPullRequestNode {
  return {
    ...node,
    timelineItems: { nodes: [item] },
    reviews: { nodes: [] },
    createdAt: '2025-12-01T00:00:00Z',
  }
}
function onlyReview(node: GhPullRequestNode, review: GhReviewNode): GhPullRequestNode {
  return {
    ...node,
    timelineItems: { nodes: [] },
    reviews: { nodes: [review] },
    createdAt: '2025-12-01T00:00:00Z',
  }
}

function findTimeline<T extends GhTimelineNode['__typename']>(
  node: GhPullRequestNode | GhIssueNode,
  typename: T,
  predicate: (item: Extract<GhTimelineNode, { __typename: T }>) => boolean = () => true,
): Extract<GhTimelineNode, { __typename: T }> {
  const found = (node.timelineItems.nodes as GhTimelineNode[]).find(
    (item): item is Extract<GhTimelineNode, { __typename: T }> =>
      item.__typename === typename && predicate(item as Extract<GhTimelineNode, { __typename: T }>),
  )
  if (found === undefined) throw new Error(`記録した応答に ${typename} が無い`)
  return found
}

function findReview(
  node: GhPullRequestNode,
  predicate: (review: GhReviewNode) => boolean,
): GhReviewNode {
  const found = node.reviews.nodes.find(predicate)
  if (found === undefined) throw new Error('記録した応答に当てはまるレビューが無い')
  return found
}

const isReplyOnly = (review: GhReviewNode) =>
  review.body === '' &&
  review.comments.nodes.length === 1 &&
  review.comments.nodes[0]?.replyTo !== null

describe('出来事への分解（domain-model.md 4.1）', () => {
  describe('記録した応答をそのまま分解する', () => {
    it('利用者が作った open の PR（#101）: bot のコメントはコメント、他人のレビューはレビュー、利用者自身の操作は出来事にしない', () => {
      const { events } = expandThread(prInput(ownOpenPr()))
      expect(
        events.map((event) => [event.type, event.actor.login, event.reviewResult ?? null]),
      ).toEqual([
        ['comment', 'example-bot', null],
        ['review', 'example-bot', 'commented'],
        ['review', 'example-bot-2', 'commented'],
        ['review', 'example-bot-2', 'commented'],
        ['review', 'dave', 'approved'],
        ['review', 'grace', 'approved'],
      ])
    })

    it('出来事は発生の古い順で、どれも GitHubEvent の形（I-3）', () => {
      for (const node of [
        ownOpenPr(),
        ownMergedPr(),
        othersPrRequested(),
        othersPrMention(),
        othersPrParticipating(),
      ]) {
        const { events } = expandThread(prInput(node, { wasParticipating: true }))
        expect(events.map((event) => event.occurredAt)).toEqual(
          events.map((event) => event.occurredAt).toSorted(),
        )
        for (const event of events) {
          expect(GitHubEventSchema.safeParse(event).success).toBe(true)
          expect(event.receivedAt).toBe(RECEIVED_AT)
        }
      }
    })

    it('I-1: 同じ応答を2回分解しても、同じ id の出来事になる', () => {
      const first = expandThread(prInput(ownMergedPr())).events.map((event) => event.id)
      const second = expandThread(prInput(ownMergedPr())).events.map((event) => event.id)
      expect(second).toEqual(first)
      expect(new Set(first).size).toBe(first.length)
    })

    it('対象は PR の番号・タイトル・ページとスレッドのリポジトリ', () => {
      const node = ownOpenPr()
      const [event] = expandThread(prInput(node)).events
      expect(event?.target).toEqual({
        kind: 'pull_request',
        repository: 'example-org/app',
        number: node.number,
        title: node.title,
        url: node.url,
      })
    })
  })

  describe('M-0: 出典を作った人が利用者自身なら出来事にしない（I-2）', () => {
    it.each([
      [
        '利用者が出したレビュー依頼',
        () => onlyTimeline(ownOpenPr(), findTimeline(ownOpenPr(), 'ReviewRequestedEvent')),
      ],
      [
        '利用者が自分をアサイン',
        () => onlyTimeline(ownOpenPr(), findTimeline(ownOpenPr(), 'AssignedEvent')),
      ],
      [
        '利用者の返信だけのレビュー',
        () =>
          onlyReview(
            ownOpenPr(),
            findReview(ownOpenPr(), (r) => r.author?.login === VIEWER),
          ),
      ],
      [
        '利用者のコメント（他人の PR）',
        () =>
          onlyTimeline(
            othersPrParticipating(),
            findTimeline(
              othersPrParticipating(),
              'IssueComment',
              (c) => c.author?.login === VIEWER,
            ),
          ),
      ],
    ])('%s', (_name, node) => {
      expect(expandThread(prInput(node(), { wasParticipating: true })).events).toEqual([])
    })

    it('大文字と小文字を区別しない（書き換えた応答）', () => {
      const node = onlyTimeline(
        othersPrRequested(),
        findTimeline(othersPrRequested(), 'IssueComment'),
      )
      const comment = node.timelineItems.nodes[0] as Extract<
        GhTimelineNode,
        { __typename: 'IssueComment' }
      >
      comment.author = { login: 'Alice', __typename: 'User' }
      expect(expandThread(prInput(node, { wasParticipating: true })).events).toEqual([])
    })
  })

  describe('M-1・M-2: レビュー依頼', () => {
    it('M-1: 依頼先が利用者なら review_requested。開く先は PR のページ', () => {
      const pr = othersPrRequested()
      const request = findTimeline(
        pr,
        'ReviewRequestedEvent',
        (e) => e.requestedReviewer?.login === VIEWER,
      )
      const [event] = expandThread(prInput(onlyTimeline(pr, request))).events
      expect(event).toMatchObject({
        id: request.id,
        type: 'review_requested',
        actor: { login: 'frank', isBot: false },
        url: pr.url,
      })
      expect(event?.viaTeam).toBeUndefined()
    })

    it('依頼先が他の人なら出来事にしない', () => {
      const pr = othersPrRequested()
      const request = findTimeline(
        pr,
        'ReviewRequestedEvent',
        (e) => e.requestedReviewer?.login === 'erin',
      )
      expect(expandThread(prInput(onlyTimeline(pr, request))).events).toEqual([])
    })

    it.each([
      ['review_requested', [{ type: 'review_requested', viaTeam: true }]],
      ['mention', []],
    ])('M-2: 依頼先がチームで、スレッドの理由が %s（書き換えた応答）', (reason, expected) => {
      const pr = othersPrRequested()
      const request = {
        ...findTimeline(pr, 'ReviewRequestedEvent'),
        requestedReviewer: { __typename: 'Team' },
      }
      const events = expandThread(
        prInput(onlyTimeline(pr, request), { thread: { ...prInput(pr).thread, reason } }),
      ).events
      expect(events).toMatchObject(expected)
    })

    it('依頼先が消えている（null）なら出来事にしない（書き換えた応答）', () => {
      const pr = othersPrRequested()
      const request = { ...findTimeline(pr, 'ReviewRequestedEvent'), requestedReviewer: null }
      expect(expandThread(prInput(onlyTimeline(pr, request))).events).toEqual([])
    })
  })

  describe('M-3: アサイン', () => {
    it('担当者が利用者なら assign。bot がアサインしたなら isBot', () => {
      const issue = botIssue()
      const assigned = findTimeline(issue, 'AssignedEvent', (e) => e.assignee?.login === VIEWER)
      const node = {
        ...issue,
        timelineItems: { nodes: [assigned] },
        createdAt: '2025-12-01T00:00:00Z',
      }
      const [event] = expandThread(issueInput(node)).events
      expect(event).toMatchObject({
        id: assigned.id,
        type: 'assign',
        actor: { login: 'example-bot-3', isBot: true },
        target: { kind: 'issue', number: issue.number },
        url: issue.url,
      })
    })

    it.each([
      [
        '担当者が他の人',
        (issue: GhIssueNode) =>
          findTimeline(issue, 'AssignedEvent', (e) => e.assignee?.login === 'grace'),
      ],
      [
        '担当者が消えている（書き換えた応答）',
        (issue: GhIssueNode) => ({ ...findTimeline(issue, 'AssignedEvent'), assignee: null }),
      ],
    ])('%s なら出来事にしない', (_name, pick) => {
      const issue = botIssue()
      const node = {
        ...issue,
        timelineItems: { nodes: [pick(issue)] },
        createdAt: '2025-12-01T00:00:00Z',
      }
      expect(expandThread(issueInput(node)).events).toEqual([])
    })
  })

  describe('M-4〜M-6: 利用者が作った PR へのレビューとコメント', () => {
    it('M-4: 返信だけのレビューは comment。開く先と抜粋は返信のコメント', () => {
      const pr = ownMergedPr()
      const reply = findReview(pr, (r) => isReplyOnly(r) && r.author?.login === 'dave')
      const [event] = expandThread(prInput(onlyReview(pr, reply))).events
      expect(event).toMatchObject({
        id: reply.id,
        type: 'comment',
        actor: { login: 'dave' },
        url: reply.comments.nodes[0]?.url,
        excerpt: reply.comments.nodes[0]?.body,
        occurredAt: reply.submittedAt,
      })
      expect(event?.reviewResult).toBeUndefined()
    })

    it('M-5 は M-7 より先: @alice を含むレビューでも review', () => {
      const pr = ownMergedPr()
      const review = findReview(pr, (r) => r.state === 'APPROVED' && r.body.includes(`@${VIEWER}`))
      const [event] = expandThread(prInput(onlyReview(pr, review))).events
      expect(event).toMatchObject({
        type: 'review',
        reviewResult: 'approved',
        excerpt: review.body,
      })
    })

    it('M-5: 本文が空で行へのコメントがあるレビューは、抜粋を最初の行へのコメントにする', () => {
      const pr = ownMergedPr()
      const review = findReview(
        pr,
        (r) => r.body === '' && r.comments.nodes.length === 1 && !isReplyOnly(r),
      )
      const [event] = expandThread(prInput(onlyReview(pr, review))).events
      expect(event).toMatchObject({
        type: 'review',
        url: review.url,
        excerpt: review.comments.nodes[0]?.body,
      })
    })

    it.each([
      ['APPROVED', 'approved'],
      ['CHANGES_REQUESTED', 'changes_requested'],
      ['COMMENTED', 'commented'],
      ['DISMISSED', 'commented'],
    ])('M-5: 状態 %s → 結果 %s（CR-005。書き換えた応答）', (state, expected) => {
      const pr = ownOpenPr()
      const review = { ...findReview(pr, (r) => r.author?.login === 'dave'), state }
      expect(expandThread(prInput(onlyReview(pr, review))).events[0]?.reviewResult).toBe(expected)
    })

    it('M-5: 下書き中（PENDING・提出の時刻なし）のレビューは出来事にしない（書き換えた応答）', () => {
      const pr = ownOpenPr()
      const review = {
        ...findReview(pr, (r) => r.author?.login === 'dave'),
        state: 'PENDING',
        submittedAt: null,
      }
      expect(expandThread(prInput(onlyReview(pr, review))).events).toEqual([])
    })

    it('M-6 は M-7 より先: 自分の PR への @alice を含むコメントは comment（書き換えた応答）', () => {
      const pr = ownOpenPr()
      const comment = { ...findTimeline(pr, 'IssueComment'), body: `@${VIEWER} 見てください` }
      const [event] = expandThread(prInput(onlyTimeline(pr, comment))).events
      expect(event).toMatchObject({
        type: 'comment',
        url: comment.url,
        actor: { login: 'example-bot', isBot: true },
      })
    })

    it('自分の issue へのコメントは comment にしない（M-6 は PR だけ）', () => {
      const issue = botIssue()
      const comment = findTimeline(issue, 'IssueComment', (c) => c.author?.login === 'grace')
      const node = {
        ...issue,
        author: { login: VIEWER, __typename: 'User' },
        timelineItems: { nodes: [comment] },
        createdAt: '2025-12-01T00:00:00Z',
      }
      expect(expandThread(issueInput(node)).events).toEqual([])
    })
  })

  describe('M-7: メンション', () => {
    it('他人の PR へのコメントで @alice → mention', () => {
      const pr = othersPrMention()
      const comment = findTimeline(pr, 'IssueComment', (c) => c.body.includes(`@${VIEWER}`))
      const [event] = expandThread(prInput(onlyTimeline(pr, comment))).events
      expect(event).toMatchObject({
        id: comment.id,
        type: 'mention',
        actor: { login: 'bob' },
        url: comment.url,
      })
    })

    it('新しい issue の本文で @alice → mention。id は issue の id ＋ :body、発生は作った時刻', () => {
      const issue = botIssue()
      const node = { ...issue, timelineItems: { nodes: [] } }
      const [event] = expandThread(issueInput(node)).events
      expect(event).toMatchObject({
        id: `${issue.id}:body`,
        type: 'mention',
        actor: { login: 'example-bot-3', isBot: true },
        occurredAt: issue.createdAt,
        url: issue.url,
      })
    })

    it('since より前に作った本文は見ない', () => {
      const issue = botIssue()
      const node = { ...issue, timelineItems: { nodes: [] } }
      const since = new Date(Date.parse(issue.createdAt) + 1000).toISOString()
      expect(expandThread(issueInput(node, { since })).events).toEqual([])
    })

    it('利用者が作った PR の本文は、@alice があっても出来事にしない（M-0）', () => {
      const pr = {
        ...ownOpenPr(),
        body: `@${VIEWER} メモ`,
        timelineItems: { nodes: [] },
        reviews: { nodes: [] },
      }
      expect(expandThread(prInput(pr)).events).toEqual([])
    })

    it('レビューの行へのコメントの @alice も見る（書き換えた応答）', () => {
      const pr = othersPrParticipating()
      const review = findReview(pr, (r) => isReplyOnly(r) && r.author?.login === 'peggy')
      const changed = {
        ...review,
        comments: { nodes: [{ ...review.comments.nodes[0]!, body: `@${VIEWER} どうでしょう` }] },
      }
      expect(expandThread(prInput(onlyReview(pr, changed))).events[0]?.type).toBe('mention')
    })

    it.each([
      [
        '所属チームが分かり、そのチームへのメンション',
        ['example-org/reviewers'],
        'mention',
        'mention',
      ],
      [
        '所属チームが分かり、他のチームへのメンション',
        ['example-org/reviewers-2'],
        'team_mention',
        null,
      ],
      [
        '所属チームを読めず、理由が team_mention で @組織/チームの形がある',
        null,
        'team_mention',
        'mention',
      ],
      ['所属チームを読めず、理由が mention', null, 'mention', null],
    ])('チームへのメンション: %s（書き換えた応答）', (_name, teams, reason, expected) => {
      const pr = othersPrRequested()
      const comment = {
        ...findTimeline(pr, 'IssueComment'),
        body: '@example-org/reviewers 見てください',
      }
      // 参加中でない PR にして、M-8 に当たらないようにする
      const node = { ...onlyTimeline(pr, comment), viewerLatestReview: null }
      const input = prInput(node, {
        viewer: { login: VIEWER, teams },
        thread: { ...prInput(pr).thread, reason },
      })
      expect(expandThread(input).events[0]?.type ?? null).toBe(expected)
    })
  })

  describe('M-8: 参加中の PR への発言', () => {
    it('利用者が承認した他人の open の PR で、他人の返信・bot のレビュー・作者のコメントは participating（利用者へのレビュー依頼は M-1 が先）', () => {
      const pr = othersPrParticipating()
      const { events, participating } = expandThread(prInput(pr))
      expect(participating).toBe(true)
      expect(events.filter((event) => event.type === 'participating').length).toBeGreaterThan(0)
      expect(new Set(events.map((event) => event.type))).toEqual(
        new Set(['review_requested', 'participating']),
      )
      expect(events.some((event) => event.actor.isBot)).toBe(true)
      expect(events.every((event) => event.actor.login !== VIEWER)).toBe(true)
    })

    it.each([
      ['merged', { state: 'MERGED' }],
      ['closed', { state: 'CLOSED' }],
      ['下書き', { isDraft: true }],
    ])('%s の PR では participating にしない（書き換えた応答）', (_name, change) => {
      const pr = { ...othersPrParticipating(), ...change }
      const types = expandThread(prInput(pr)).events.map((event) => event.type)
      expect(types).not.toContain('participating')
      expect(types).toContain('review_requested')
    })

    it('参加していない PR では出来事にしない（書き換えた応答）', () => {
      const pr = othersPrRequested()
      const comment = findTimeline(pr, 'IssueComment', (c) => c.author?.__typename === 'Bot')
      const node = { ...onlyTimeline(pr, comment), viewerLatestReview: null }
      const result = expandThread(
        prInput(node, { thread: { ...prInput(pr).thread, reason: 'review_requested' } }),
      )
      expect(result).toMatchObject({ events: [], participating: false })
    })

    it('他人の issue へのコメントは participating にしない（PR だけ）', () => {
      const issue = botIssue()
      const comments = issue.timelineItems.nodes.filter(
        (item) => item.__typename === 'IssueComment',
      )
      const node = {
        ...issue,
        timelineItems: { nodes: comments },
        createdAt: '2025-12-01T00:00:00Z',
      }
      expect(expandThread(issueInput(node, { wasParticipating: true })).events).toEqual([])
    })
  })

  describe('参加中の判定（domain-model.md 4.2）の結果', () => {
    it.each([
      ['PT-1: 利用者がレビューしたことがある', othersPrParticipating, {}, true],
      [
        'PT-2: この分解の出典に利用者のコメントがある（書き換えた応答）',
        () => ({ ...othersPrParticipating(), viewerLatestReview: null }),
        {},
        true,
      ],
      [
        'PT-3: スレッドの理由が comment（書き換えた応答）',
        () => ({
          ...onlyTimeline(othersPrRequested(), findTimeline(othersPrRequested(), 'IssueComment')),
          viewerLatestReview: null,
        }),
        { reason: 'comment' },
        true,
      ],
    ])('%s', (_name, node, thread, expected) => {
      const base = prInput(node())
      expect(expandThread({ ...base, thread: { ...base.thread, ...thread } }).participating).toBe(
        expected,
      )
    })

    it('issue では、前の取り込みの値をそのまま返す', () => {
      expect(expandThread(issueInput(botIssue(), { wasParticipating: true })).participating).toBe(
        true,
      )
      expect(expandThread(issueInput(botIssue(), { wasParticipating: false })).participating).toBe(
        false,
      )
    })
  })

  describe('分解する範囲（domain-model.md 5.）', () => {
    it('since ちょうどの出典は入れ、それより前は入れない', () => {
      const pr = ownOpenPr()
      const review = findReview(pr, (r) => r.author?.login === 'dave')
      const at = (since: string) =>
        expandThread(prInput(onlyReview(pr, review), { since })).events.length
      expect(at(review.submittedAt!)).toBe(1)
      expect(at(new Date(Date.parse(review.submittedAt!) + 1000).toISOString())).toBe(0)
    })
  })

  describe('作者と抜粋', () => {
    it('作者が消えたアカウント（null）なら ghost（書き換えた応答）', () => {
      const pr = ownOpenPr()
      const comment = { ...findTimeline(pr, 'IssueComment'), author: null }
      expect(expandThread(prInput(onlyTimeline(pr, comment))).events[0]?.actor).toEqual({
        login: 'ghost',
        isBot: false,
      })
    })

    it(`抜粋は ${EXCERPT_MAX_LENGTH} 文字まで。本文が空なら抜粋なし（書き換えた応答）`, () => {
      const pr = ownOpenPr()
      const long = {
        ...findTimeline(pr, 'IssueComment'),
        body: 'あ'.repeat(EXCERPT_MAX_LENGTH + 10),
      }
      expect(expandThread(prInput(onlyTimeline(pr, long))).events[0]?.excerpt).toHaveLength(
        EXCERPT_MAX_LENGTH,
      )
      const empty = { ...findTimeline(pr, 'IssueComment'), body: '' }
      expect(expandThread(prInput(onlyTimeline(pr, empty))).events[0]?.excerpt).toBeUndefined()
    })
  })
})

describe('M-9: 理由がメンションなのに @alice が見つからないとき（CR-004）', () => {
  const oldIssue = () => {
    const issue = botIssue()
    return { ...issue, timelineItems: { nodes: [] } }
  }
  const afterBody = (issue: GhIssueNode) =>
    new Date(Date.parse(issue.createdAt) + 1000).toISOString()

  it.each([
    ['理由が mention で、どの出典にも @alice が無い', 'mention', true],
    ['理由が team_mention で、どの出典にも無い', 'team_mention', true],
    ['理由が mention 以外', 'assign', false],
  ])('%s → 最新のコメントを読む: %s', (_name, reason, expected) => {
    const issue = oldIssue()
    const input = issueInput(issue, {
      since: afterBody(issue),
      thread: { ...prInput(ownOpenPr()).thread, reason },
    })
    expect(expandThread(input).needsMentionFallback).toBe(expected)
  })

  it('@alice が見つかれば、種類がコメントになっていても読まない（M-6 が M-7 より先のとき）', () => {
    const pr = ownOpenPr()
    const comment = { ...findTimeline(pr, 'IssueComment'), body: `@${VIEWER} 見てください` }
    expect(expandThread(prInput(onlyTimeline(pr, comment))).needsMentionFallback).toBe(false)
  })

  it('本文の @alice が見つかれば読まない', () => {
    expect(expandThread(issueInput(oldIssue())).needsMentionFallback).toBe(false)
  })

  const fallbackInput = () => {
    const issue = oldIssue()
    return issueInput(issue, { since: afterBody(issue) })
  }

  it.each([
    ['issue のコメント', latestCommentIssueComment, 'bob', false],
    ['PR の本文', latestCommentPrBody, 'heidi', false],
    ['bot が作った issue の本文', latestCommentIssueBody, 'example-bot-3[bot]', true],
  ])('最新のコメントが %s なら、その発言者・開く先・抜粋を使う', (_name, latest, login, isBot) => {
    const input = fallbackInput()
    const comment = latest()
    const event = mentionFallbackEvent(input, comment)
    expect(event).toMatchObject({
      id: `${input.thread.id}@${input.thread.updatedAt}`,
      type: 'mention',
      actor: { login, isBot },
      url: comment.html_url,
      occurredAt: input.thread.updatedAt,
      receivedAt: RECEIVED_AT,
    })
    expect(event?.excerpt).toBe(comment.body?.slice(0, EXCERPT_MAX_LENGTH))
    expect(GitHubEventSchema.safeParse(event).success).toBe(true)
  })

  it('最新のコメントが空か読めなければ、対象の作者・対象のページ・抜粋なし', () => {
    const input = fallbackInput()
    const event = mentionFallbackEvent(input, null)
    expect(event).toMatchObject({
      actor: { login: 'example-bot-3', isBot: true },
      url: botIssue().url,
    })
    expect(event?.excerpt).toBeUndefined()
  })

  it('最新のコメントに発言者が無ければ（消えたアカウント）ghost（書き換えた応答）', () => {
    const event = mentionFallbackEvent(fallbackInput(), {
      ...latestCommentIssueComment(),
      user: null,
    })
    expect(event?.actor).toEqual({ login: 'ghost', isBot: false })
  })

  it('最新のコメントの発言者が利用者自身なら出来事にしない（M-0。書き換えた応答）', () => {
    const comment = { ...latestCommentIssueComment(), user: { login: 'ALICE', type: 'User' } }
    expect(mentionFallbackEvent(fallbackInput(), comment)).toBeNull()
  })

  it('PR のスレッドでも、対象は PR（書き換えた応答）', () => {
    const pr = { ...ownOpenPr(), author: null }
    const event = mentionFallbackEvent(prInput(pr), null)
    expect(event).toMatchObject({
      target: { kind: 'pull_request', number: pr.number },
      actor: { login: 'ghost' },
    })
  })
})
