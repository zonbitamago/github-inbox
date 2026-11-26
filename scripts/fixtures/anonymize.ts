// 記録した生の応答（record.ts）を、架空のデータに置き換えて test/fixtures/github/ に置く（test-conventions.md 3.）。
// 置き換えの対応表（実際の値 → 架空の値）は実データを含むため、**リポジトリの外**にだけ書く。
// 最後に、生の応答の文字列が出力に1つも残っていないかを検査し、残っていたら何も書かずに止める。
// 出力するのは件数・キーの位置だけで、実際の値は出さない（CLAUDE.md）。
//
// 使い方:
//   node scripts/fixtures/anonymize.ts <生の応答のフォルダ> <対応表のファイル> <生の名前>:<出力の名前> ...
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '../..')
const OUT_DIR = join(REPO_ROOT, 'test/fixtures/github')

class SafeError extends Error {}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

// ---- 架空の値（test-conventions.md 3. の表） ----

const PEOPLE = [
  'bob',
  'carol',
  'dave',
  'erin',
  'frank',
  'grace',
  'heidi',
  'ivan',
  'judy',
  'mallory',
  'niaj',
  'olivia',
  'peggy',
  'rupert',
  'sybil',
  'trent',
  'victor',
  'walter',
]
const ORG_REPOS = ['app', 'api', 'web', 'docs', 'infra', 'mobile', 'cli', 'data', 'batch', 'admin']
const VIEWER_REPOS = ['tools', 'notes', 'sandbox', 'dotfiles']
const TITLES = [
  'ログイン画面の文言を直す',
  '一覧の並び順を更新日時にする',
  '設定の保存に失敗したときの表示を足す',
  'CI の待ち時間を短くする',
  'README に使い方を足す',
  '依存パッケージを更新する',
  'API のタイムアウトを延ばす',
  'テストの名前を揃える',
  'エラーの文言を見直す',
  '日付の表示を地域の時刻にする',
  '検索の条件に期間を足す',
  'ログの出力先を設定で変えられるようにする',
]
const SENTENCES = [
  'ここの条件は逆ではないでしょうか。',
  '直しました。もう一度見てください。',
  'テストを足しておきます。',
  'この名前のほうが分かりやすいと思います。',
  '了解です。',
  '手元で動くことを確かめました。',
  'こちらは別の PR で対応します。',
  '念のため確認させてください。',
]

/** そのまま残してよい値（GitHub の区分値など。実データではない） */
const SAFE_STRINGS = new Set([
  'PullRequest',
  'Issue',
  'CheckSuite',
  'Discussion',
  'Release',
  'Commit',
  'RepositoryVulnerabilityAlert',
  'User',
  'Bot',
  'Organization',
  'Mannequin',
  'Team',
  'IssueComment',
  'PullRequestReview',
  'ReviewRequestedEvent',
  'AssignedEvent',
  'PullRequestReviewComment',
  'OPEN',
  'CLOSED',
  'MERGED',
  'APPROVED',
  'COMMENTED',
  'CHANGES_REQUESTED',
  'PENDING',
  'DISMISSED',
  'REVIEW_REQUIRED',
  'SUCCESS',
  'FAILURE',
  'ERROR',
  'EXPECTED',
  'open',
  'closed',
  'all',
  'public',
  'private',
  'internal',
  'pull',
  'push',
  'admin',
  'maintain',
  'triage',
  'closed',
  'secret',
  'notifications_enabled',
  'notifications_disabled',
  'member',
  'maintainer',
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
  'CONTRIBUTOR',
  'NONE',
  'FIRST_TIME_CONTRIBUTOR',
  'FIRST_TIMER',
  'completed',
  'success',
  'failure',
  'cancelled',
  'skipped',
  'timed_out',
  'action_required',
  'neutral',
  'stale',
  'startup_failure',
  'assign',
  'author',
  'comment',
  'ci_activity',
  'invitation',
  'manual',
  'mention',
  'review_requested',
  'security_alert',
  'state_change',
  'subscribed',
  'team_mention',
  'your_activity',
  'approval_requested',
  'graphql',
  'core',
  'search',
  'GET',
  // ブランチ名・ワークフロー名のうち、一般的な語
  'main',
  'master',
  'ci',
  // GitHub Actions の event・status
  'pull_request',
  'dynamic',
  'workflow_dispatch',
  'schedule',
  'queued',
  'in_progress',
  'requested',
  'waiting',
  'POST',
])
/** キーごとに、値をそのまま残すもの */
const SAFE_KEYS = new Set([
  '__typename',
  'reason',
  'state',
  'type',
  'conclusion',
  'status',
  'event',
  'author_association',
  'user_view_type',
  'reviewDecision',
  'visibility',
  'permission',
  'privacy',
  'notification_setting',
  'role_name',
  'gravatar_id',
  'query',
  'resource',
])
/** 数を 0 にするキー（利用者の非公開の数など） */
const ZEROED_NUMBER_KEY =
  /private|disk_usage|collaborators|followers|following|public_repos|public_gists|seats|space|filled_seats|members_count|repos_count|^size$|^additions$|^deletions$|^changed_files$/

// ---- 対応表 ----

interface Mapping {
  viewer: string
  timeDeltaMs: number
  logins: Record<string, string>
  owners: Record<string, string>
  repos: Record<string, string> // "owner/name" → "owner/name"
  teams: Record<string, string>
  numbers: Record<string, string>
  ids: Record<string, string>
  titles: Record<string, string>
  counters: Record<string, number>
}

function loadMapping(path: string, viewer: string, anchor: string): Mapping {
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8')) as Mapping
  }
  return {
    viewer,
    timeDeltaMs: Date.parse('2026-01-01T00:00:00Z') - Date.parse(anchor),
    logins: { [viewer.toLowerCase()]: 'alice' },
    owners: { [viewer.toLowerCase()]: 'alice' },
    repos: {},
    teams: {},
    numbers: {},
    ids: {},
    titles: {},
    counters: {},
  }
}

function next(mapping: Mapping, name: string): number {
  const value = mapping.counters[name] ?? 0
  mapping.counters[name] = value + 1
  return value
}

/** 決まった種から作る、形を保った架空の文字列 */
function pseudo(mapping: Mapping, length: number, alphabet: string): string {
  // xorshift32。32ビットの整数だけで計算する（大きな数の掛け算で精度が落ちないように）
  let seed = (Math.imul(next(mapping, 'pseudo') + 1, 2654435761) ^ 0x9e3779b9) >>> 0
  let out = ''
  for (let i = 0; i < length; i++) {
    seed ^= seed << 13
    seed >>>= 0
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0
    out += alphabet[seed % alphabet.length]
  }
  return out
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function mapLogin(mapping: Mapping, login: string, isBot: boolean): string {
  const bot = isBot || login.endsWith('[bot]')
  const base = login.replace(/\[bot\]$/, '').toLowerCase()
  let mapped = mapping.logins[base] ?? mapping.owners[base]
  if (mapped === undefined) {
    if (bot) {
      const n = next(mapping, 'bot')
      mapped = n === 0 ? 'example-bot' : `example-bot-${n + 1}`
    } else {
      const n = next(mapping, 'person')
      mapped = PEOPLE[n] ?? `person-${n + 1}`
    }
    mapping.logins[base] = mapped
  }
  return login.endsWith('[bot]') ? `${mapped}[bot]` : mapped
}

function mapOwner(mapping: Mapping, owner: string): string {
  const key = owner.toLowerCase()
  const known = mapping.owners[key] ?? mapping.logins[key]
  if (known !== undefined) {
    mapping.owners[key] = known
    return known
  }
  const n = next(mapping, 'org')
  const mapped = n === 0 ? 'example-org' : `example-org-${n + 1}`
  mapping.owners[key] = mapped
  return mapped
}

function mapRepo(mapping: Mapping, owner: string, name: string): string {
  const key = `${owner}/${name}`.toLowerCase()
  const known = mapping.repos[key]
  if (known !== undefined) return known
  const mappedOwner = mapOwner(mapping, owner)
  const pool = mappedOwner === 'alice' ? VIEWER_REPOS : ORG_REPOS
  const n = next(mapping, `repo:${mappedOwner}`)
  const mapped = `${mappedOwner}/${pool[n] ?? `repo-${n + 1}`}`
  mapping.repos[key] = mapped
  return mapped
}

function mapRepoName(mapping: Mapping, name: string): string | undefined {
  // 名前だけのとき: 対応表にある "owner/name" のうち name が一致するもの
  const lower = name.toLowerCase()
  const hit = Object.entries(mapping.repos).find(([real]) => real.split('/')[1] === lower)
  return hit?.[1].split('/')[1]
}

function mapTeam(mapping: Mapping, slug: string): string {
  const key = slug.toLowerCase()
  const known = mapping.teams[key]
  if (known !== undefined) return known
  const n = next(mapping, 'team')
  const mapped = n === 0 ? 'reviewers' : `reviewers-${n + 1}`
  mapping.teams[key] = mapped
  return mapped
}

function mapNumber(mapping: Mapping, value: string): string {
  const known = mapping.numbers[value]
  if (known !== undefined) return known
  let mapped: string
  if (value.length <= 4) {
    mapped = String(101 + next(mapping, 'small'))
  } else {
    mapped = `${'123456789'[next(mapping, 'lead') % 9]}${pseudo(mapping, value.length - 1, '0123456789')}`
  }
  mapping.numbers[value] = mapped
  return mapped
}

function mapId(mapping: Mapping, value: string): string {
  const known = mapping.ids[value]
  if (known !== undefined) return known
  const match = /^([A-Z][A-Za-z]{0,5}_)(.+)$/.exec(value)
  const mapped =
    match !== null
      ? `${match[1] ?? ''}${pseudo(mapping, (match[2] ?? '').length, `${ALNUM}_-`)}`
      : pseudo(mapping, value.length, ALNUM)
  mapping.ids[value] = mapped
  return mapped
}

function mapTitle(mapping: Mapping, title: string): string {
  const known = mapping.titles[title]
  if (known !== undefined) return known
  const n = next(mapping, 'title')
  const mapped =
    n < TITLES.length
      ? (TITLES[n] ?? '')
      : `${TITLES[n % TITLES.length] ?? ''}（${Math.floor(n / TITLES.length) + 1}）`
  mapping.titles[title] = mapped
  return mapped
}

function mapEtag(mapping: Mapping, etag: string): string {
  const known = mapping.ids[`etag:${etag}`]
  if (known !== undefined) return known
  const mapped = etag.replace(/[0-9a-f]{16,}/g, (hex) =>
    pseudo(mapping, hex.length, '0123456789abcdef'),
  )
  mapping.ids[`etag:${etag}`] = mapped
  return mapped
}

function shiftTime(mapping: Mapping, iso: string): string {
  const shifted = new Date(Date.parse(iso) + mapping.timeDeltaMs).toISOString()
  // 元が秒までなら秒までにそろえる
  return /\.\d+Z$/.test(iso) ? shifted : shifted.replace(/\.\d{3}Z$/, 'Z')
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

function mapMention(mapping: Mapping, mention: string): string {
  const [first = '', second] = mention.split('/')
  if (second !== undefined) {
    return `${mapOwner(mapping, first)}/${mapTeam(mapping, second)}`
  }
  return mapLogin(mapping, first, false)
}

function fakeBody(mapping: Mapping, body: string): string {
  if (body === '') return ''
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  let carriedMentions: string[] = []
  for (const line of lines) {
    const mentions = [
      ...line.matchAll(
        /(?<![A-Za-z0-9`])@([A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?)/g,
      ),
    ].map((match) => `@${mapMention(mapping, match[1] ?? '')}`)
    if (out.length >= 8) {
      carriedMentions = [...carriedMentions, ...mentions]
      continue
    }
    if (line.trim() === '') {
      out.push('')
      continue
    }
    const prefix = /^(\s*(?:>\s?)*(?:[-*]\s|\d+\.\s|#{1,6}\s)?)/.exec(line)?.[1] ?? ''
    if (line.trim().startsWith('```')) {
      out.push('```')
      continue
    }
    const sentence = SENTENCES[next(mapping, 'sentence') % SENTENCES.length] ?? ''
    out.push(`${prefix}${mentions.length > 0 ? `${mentions.join(' ')} ` : ''}${sentence}`)
  }
  if (carriedMentions.length > 0) {
    out.push(`${carriedMentions.join(' ')} ${SENTENCES[0] ?? ''}`)
  }
  // 開いたままのコードの囲みを閉じる
  if (out.filter((line) => line === '```').length % 2 === 1) out.push('```')
  return out.join('\n')
}

const KEEP_SEGMENTS = new Set([
  'repos',
  'pulls',
  'pull',
  'issues',
  'comments',
  'notifications',
  'threads',
  'users',
  'orgs',
  'u',
  'actions',
  'runs',
  'teams',
  'members',
  'subscription',
  'events',
  'labels',
  'milestones',
  'assignees',
  'commits',
  'statuses',
  'releases',
  'latest',
  'git',
  'trees',
  'blobs',
  'tags',
  'branches',
  'contents',
  'compare',
  'keys',
  'hooks',
  'forks',
  'stargazers',
  'subscribers',
  'collaborators',
  'deployments',
  'downloads',
  'languages',
  'merges',
  'archive',
  'invitations',
  'followers',
  'following',
  'gists',
  'starred',
  'subscriptions',
  'received_events',
  'public_members',
  'reviews',
  'requested_reviewers',
  'review_comments',
  'check-runs',
  'check-suites',
  'jobs',
  'logs',
  'workflow',
  'workflows',
  'attempts',
  'graphql',
  'user',
  'search',
  'login',
  'device',
  'code',
  'oauth',
  'access_token',
  'files',
  'changes',
  'checks',
  'discussion',
  'v4',
])

function mapUrlPath(mapping: Mapping, segments: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] ?? ''
    const templateAt = segment.search(/TPL\d+TPL/)
    const head = templateAt === -1 ? segment : segment.slice(0, templateAt)
    const suffix = templateAt === -1 ? '' : segment.slice(templateAt)
    const previous = segments[i - 1] ?? ''
    let mapped = head
    if (head === '' || KEEP_SEGMENTS.has(head)) {
      mapped = head
    } else if (/^\d+$/.test(head)) {
      mapped = mapNumber(mapping, head)
    } else if (previous === 'teams') {
      mapped = mapTeam(mapping, head)
    } else if (previous === 'repos' || previous === 'users' || previous === 'orgs' || i === 0) {
      mapped = mapOwner(mapping, head)
      // repos/{owner}/{repo} の repo
      const repo = segments[i + 1]
      if (
        repo !== undefined &&
        previous === 'repos' &&
        !KEEP_SEGMENTS.has(repo.replace(/TPL\d+TPL.*$/, ''))
      ) {
        out.push(`${mapped}${suffix}`)
        const repoTemplateAt = repo.search(/TPL\d+TPL/)
        const repoHead = repoTemplateAt === -1 ? repo : repo.slice(0, repoTemplateAt)
        const repoSuffix = repoTemplateAt === -1 ? '' : repo.slice(repoTemplateAt)
        out.push(`${mapRepo(mapping, head, repoHead).split('/')[1] ?? ''}${repoSuffix}`)
        i++
        continue
      }
      if (i === 0 && repo !== undefined && !KEEP_SEGMENTS.has(repo.replace(/TPL\d+TPL.*$/, ''))) {
        // github.com/{owner}/{repo}
        out.push(`${mapped}${suffix}`)
        const repoTemplateAt = repo.search(/TPL\d+TPL/)
        const repoHead = repoTemplateAt === -1 ? repo : repo.slice(0, repoTemplateAt)
        const repoSuffix = repoTemplateAt === -1 ? '' : repo.slice(repoTemplateAt)
        out.push(`${mapRepo(mapping, head, repoHead).split('/')[1] ?? ''}${repoSuffix}`)
        i++
        continue
      }
    } else if (/^[0-9a-f]{40}$/.test(head)) {
      mapped = pseudo(mapping, 40, '0123456789abcdef')
    } else {
      mapped = mapRepoName(mapping, head) ?? 'example'
    }
    out.push(`${mapped}${suffix}`)
  }
  return out
}

function mapUrl(mapping: Mapping, original: string): string {
  // URL のテンプレート（{/number} など）は、解釈の前に印に置き換え、最後に戻す
  const templates: string[] = []
  const value = original.replace(/\{[^}]*\}/g, (template) => {
    templates.push(template)
    return `TPL${templates.length - 1}TPL`
  })
  const restore = (text: string) =>
    text.replace(/TPL(\d+)TPL/g, (_all, index: string) => templates[Number(index)] ?? '')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'https://example.com/'
  }
  const hosts = ['github.com', 'api.github.com', 'avatars.githubusercontent.com']
  if (!hosts.includes(url.hostname)) {
    return 'https://example.com/'
  }
  const segments = url.pathname.split('/').slice(1)
  // avatars の /u/{id} は番号だけを変える
  const mappedPath =
    url.hostname === 'avatars.githubusercontent.com'
      ? segments.map((segment) => (/^\d+$/.test(segment) ? mapNumber(mapping, segment) : segment))
      : mapUrlPath(mapping, segments)
  const params = new URLSearchParams(url.search)
  const mappedParams = new URLSearchParams()
  for (const [name, param] of params) {
    const dateOnly = /^(>=|<=|>|<)?(\d{4}-\d{2}-\d{2})$/.exec(param)
    if (ISO.test(param)) mappedParams.set(name, shiftTime(mapping, param))
    else if (dateOnly !== null)
      // created=>=2026-11-25 のような日付だけの条件（github-api.md 4.）
      mappedParams.set(
        name,
        `${dateOnly[1] ?? ''}${shiftTime(mapping, `${dateOnly[2] ?? ''}T00:00:00Z`).slice(0, 10)}`,
      )
    else if (name === 'actor') mappedParams.set(name, mapLogin(mapping, param, false))
    else if (/^(all|per_page|page|v|participating|s)$/.test(name) || SAFE_STRINGS.has(param))
      mappedParams.set(name, param)
    else mappedParams.set(name, 'example')
  }
  const search = mappedParams.toString()
  const hash = url.hash.replace(/\d+/g, (digits) => mapNumber(mapping, digits))
  return restore(
    `${url.protocol}//${url.host}/${mappedPath.join('/')}${search === '' ? '' : `?${search}`}${hash}`,
  )
}

// ---- 1. 実際の名前を集める（対応表を先に作る。リポジトリと組織 → 人の順に割り当てる） ----

function isOrganization(node: Record<string, Json>, parentKey: string): boolean {
  return (
    node['type'] === 'Organization' ||
    node['__typename'] === 'Organization' ||
    parentKey === 'organization'
  )
}

function collectOwners(mapping: Mapping, node: Json, parentKey: string): void {
  if (Array.isArray(node)) {
    for (const item of node) collectOwners(mapping, item, parentKey)
    return
  }
  if (node === null || typeof node !== 'object') return
  const login = node['login']
  if (typeof login === 'string' && isOrganization(node, parentKey)) {
    mapOwner(mapping, login)
  }
  for (const key of ['full_name', 'nameWithOwner']) {
    const value = node[key]
    if (typeof value === 'string' && value.includes('/')) {
      const [owner = '', name = ''] = value.split('/')
      mapRepo(mapping, owner, name)
    }
  }
  for (const [key, value] of Object.entries(node)) collectOwners(mapping, value, key)
}

function collectPeople(mapping: Mapping, node: Json, parentKey: string): void {
  if (Array.isArray(node)) {
    for (const item of node) collectPeople(mapping, item, parentKey)
    return
  }
  if (node === null || typeof node !== 'object') return
  const login = node['login']
  if (typeof login === 'string' && !isOrganization(node, parentKey)) {
    mapLogin(mapping, login, node['__typename'] === 'Bot' || node['type'] === 'Bot')
  }
  for (const [key, value] of Object.entries(node)) collectPeople(mapping, value, key)
}

// ---- 2. 置き換える ----

const replacedPaths = new Map<string, number>()

function transform(
  mapping: Mapping,
  node: Json,
  key: string,
  parent: Record<string, Json> | null,
  path: string,
): Json {
  if (Array.isArray(node)) {
    return node.map((item) => transform(mapping, item, key, parent, `${path}[]`))
  }
  if (node === null || typeof node === 'boolean') return node
  if (typeof node === 'number') {
    if (
      key === 'id' ||
      key.endsWith('_id') ||
      key === 'number' ||
      key === 'databaseId' ||
      /^n\d+$/.test(key)
    ) {
      return Number(mapNumber(mapping, String(node)))
    }
    if (ZEROED_NUMBER_KEY.test(key)) return 0
    return node
  }
  if (typeof node === 'object') {
    const out: Record<string, Json> = {}
    for (const [childKey, value] of Object.entries(node)) {
      out[childKey] = transform(
        mapping,
        value,
        childKey,
        { ...node, '#parentKey': key },
        `${path}.${childKey}`,
      )
    }
    return out
  }
  // 文字列
  const value = node
  if (value === '') return ''
  if (SAFE_KEYS.has(key) && (key === 'query' || SAFE_STRINGS.has(value) || key === 'gravatar_id'))
    return value
  if (SAFE_STRINGS.has(value)) return value
  if (ISO.test(value)) return shiftTime(mapping, value)
  if (key === 'login') {
    const parentKey = parent?.['#parentKey']
    if (parent !== null && isOrganization(parent, typeof parentKey === 'string' ? parentKey : ''))
      return mapOwner(mapping, value)
    return mapLogin(mapping, value, parent?.['__typename'] === 'Bot' || parent?.['type'] === 'Bot')
  }
  if (/^(o\d+)$/.test(key)) return mapOwner(mapping, value)
  if (/^(r\d+)$/.test(key)) {
    const ownerKey = `o${key.slice(1)}`
    const owner = parent?.[ownerKey]
    return typeof owner === 'string'
      ? (mapRepo(mapping, owner, value).split('/')[1] ?? '')
      : 'example'
  }
  if (key === 'q') {
    return value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, (iso) =>
      shiftTime(mapping, iso),
    )
  }
  if ((key === 'id' || key.endsWith('_id')) && /^\d+$/.test(value)) return mapNumber(mapping, value)
  if (key === 'id' || key === 'node_id' || key.endsWith('_node_id') || key.endsWith('Id'))
    return mapId(mapping, value)
  if (/^https?:\/\//.test(value)) return mapUrl(mapping, value)
  if (key === 'full_name' || key === 'nameWithOwner') {
    const [owner = '', name = ''] = value.split('/')
    return mapRepo(mapping, owner, name)
  }
  if (key === 'slug') return mapTeam(mapping, value)
  if (key === 'title' || key === 'display_title') return mapTitle(mapping, value)
  if (key === 'body') return fakeBody(mapping, value)
  if (key === 'name' && parent !== null && typeof parent['full_name'] === 'string') {
    const [owner = ''] = parent['full_name'].split('/')
    return mapRepo(mapping, owner, value).split('/')[1] ?? 'example'
  }
  if (/^[0-9a-f]{40}$/.test(value)) return pseudo(mapping, 40, '0123456789abcdef')
  if (/^\d+$/.test(value)) return mapNumber(mapping, value)
  replacedPaths.set(path, (replacedPaths.get(path) ?? 0) + 1)
  return 'example'
}

function transformHeaders(
  mapping: Mapping,
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (name === 'etag') {
      out[name] = mapEtag(mapping, value)
    } else if (name === 'last-modified') {
      out[name] = new Date(Date.parse(value) + mapping.timeDeltaMs).toUTCString()
    } else if (name === 'x-ratelimit-reset') {
      out[name] = String(Math.floor((Number(value) * 1000 + mapping.timeDeltaMs) / 1000))
    } else if (name === 'link') {
      out[name] = value.replace(/<([^>]+)>/g, (_all, url: string) => `<${mapUrl(mapping, url)}>`)
    } else {
      out[name] = value
    }
  }
  return out
}

// ---- 3. 生の文字列が残っていないかの検査 ----

/** 生の応答の文字列（4文字以上）と、その中の英数字の語（4文字以上）、5桁以上の数を集める */
function rawStrings(node: Json, key: string, out: Map<string, string>, path: string): void {
  if (Array.isArray(node)) {
    for (const item of node) rawStrings(item, key, out, `${path}[]`)
    return
  }
  if (node !== null && typeof node === 'object') {
    for (const [childKey, value] of Object.entries(node))
      rawStrings(value, childKey, out, `${path}.${childKey}`)
    return
  }
  if (typeof node === 'number' && String(node).length >= 5) {
    out.set(String(node), path)
    return
  }
  if (typeof node !== 'string') return
  if (key === 'query' || key === 'q' || SAFE_STRINGS.has(node) || node.length < 4 || ISO.test(node))
    return
  // URL のテンプレート（{/number} など）は GitHub の決まった語なので見ない
  const text = node.replace(/\{[^}]*\}/g, '')
  out.set(text, path)
  for (const word of text.split(/[^A-Za-z0-9_.-]+/)) {
    // 4桁までの数は日付や件数と区別できないため見ない（5桁以上の数は上で見る）
    if (word.length >= 4 && !/^\d{1,4}$/.test(word)) out.set(word, path)
  }
}

/** 出力の値（キー名と問い合わせの文は除く）を、位置つきで集める */
function outputValues(
  node: Json,
  key: string,
  path: string,
  out: { path: string; value: string }[],
): void {
  if (Array.isArray(node)) {
    for (const item of node) outputValues(item, key, `${path}[]`, out)
    return
  }
  if (node !== null && typeof node === 'object') {
    for (const [childKey, value] of Object.entries(node))
      outputValues(value, childKey, `${path}.${childKey}`, out)
    return
  }
  // 問い合わせの文・検索の条件・自分で出した問い合わせのパスは、本アプリが書いたもの
  if (
    key === 'query' ||
    key === 'q' ||
    path === '.request.path' ||
    node === null ||
    typeof node === 'boolean'
  )
    return
  // URL のテンプレート（{/number} など）と、URL の問い合わせの部分（?per_page=50 など）は GitHub の決まった語
  const value = String(node)
    .toLowerCase()
    .replace(/\{[^}]*\}/g, '')
    .replace(/\?[^#\s>"]*/g, '')
  out.push({ path, value })
}

/** 架空の側の決まった言葉（これに含まれる語は、実データに同じ語があっても漏れとみなさない） */
const FIXED_VOCABULARY = [
  ...PEOPLE,
  ...ORG_REPOS,
  ...VIEWER_REPOS,
  ...TITLES,
  ...SENTENCES,
  ...SAFE_STRINGS,
  ...KEEP_SEGMENTS,
  'alice',
  'example',
  'example-org',
  'example-bot',
  'reviewers',
  'https://github.com/',
  'https://api.github.com/',
  'https://avatars.githubusercontent.com/',
  'https://example.com/',
  // Link ヘッダーの rel の値
  'next',
  'last',
  'prev',
  'first',
]
  .join('\n')
  .toLowerCase()

function main(): void {
  const [rawDirArg, mappingArg, ...pairs] = process.argv.slice(2)
  if (rawDirArg === undefined || mappingArg === undefined || pairs.length === 0) {
    throw new SafeError(
      '使い方: anonymize.ts <生の応答のフォルダ> <対応表のファイル> <生の名前>:<出力の名前> ...',
    )
  }
  const rawDir = resolve(rawDirArg)
  const mappingPath = resolve(mappingArg)
  for (const path of [rawDir, mappingPath]) {
    if (path === REPO_ROOT || path.startsWith(`${REPO_ROOT}/`)) {
      throw new SafeError('生の応答と対応表はリポジトリの外に置く')
    }
  }
  const meta = JSON.parse(readFileSync(join(rawDir, 'survey-meta.json'), 'utf-8')) as {
    viewer: string
    since: string
  }
  const mapping = loadMapping(mappingPath, meta.viewer, meta.since)

  const inputs = pairs.map((pair) => {
    const [rawName = '', outName = ''] = pair.split(':')
    return {
      rawName,
      outName,
      raw: JSON.parse(readFileSync(join(rawDir, `${rawName}.json`), 'utf-8')) as Json,
    }
  })
  // 名前の割り当てを、出てきた順に決めておく（利用者 → 他の人の順）
  for (const input of inputs) collectOwners(mapping, input.raw, '')
  for (const input of inputs) collectPeople(mapping, input.raw, '')

  const outputs = inputs.map((input) => {
    const raw = input.raw as {
      request: Record<string, Json>
      response: { status: number; headers: Record<string, string>; body: Json }
    }
    const request = transform(mapping, raw.request, 'request', null, 'request') as Record<
      string,
      Json
    >
    if (typeof raw.request['path'] === 'string') {
      const path = raw.request['path']
      request['path'] = mapUrl(mapping, `https://api.github.com${path}`).replace(
        'https://api.github.com',
        '',
      )
    }
    if (raw.request['headers'] !== undefined) {
      const headers = raw.request['headers'] as Record<string, string>
      // ETag は応答の中身から作られた値で、実データを含まない（形だけ残すため、架空の値に置き換える）
      request['headers'] = Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [
          name,
          name.toLowerCase() === 'if-none-match' ? mapEtag(mapping, value) : value,
        ]),
      )
    }
    return {
      outName: input.outName,
      text: `${JSON.stringify(
        {
          request,
          response: {
            status: raw.response.status,
            headers: transformHeaders(mapping, raw.response.headers),
            body: transform(mapping, raw.response.body, 'body-root', null, 'response.body'),
          },
        },
        null,
        2,
      )}\n`,
    }
  })

  // 検査: 生の応答の文字列（4文字以上）・5桁以上の数・対応表の実際の名前が、出力に残っていないか
  const secrets = new Map<string, string>()
  for (const input of inputs) {
    // 自分で出した問い合わせのパス・ヘッダーと、応答のヘッダー（利用制限の数など）は実データではない
    const raw = input.raw as { request: Record<string, Json>; response: { body: Json } }
    rawStrings(raw.request['body'] ?? null, '', secrets, `${input.rawName}.request.body`)
    rawStrings(raw.response.body, '', secrets, `${input.rawName}.response.body`)
  }
  for (const real of [
    ...Object.keys(mapping.logins),
    ...Object.keys(mapping.owners),
    ...Object.keys(mapping.teams),
    ...Object.keys(mapping.repos).flatMap((repo) => repo.split('/')),
    ...Object.keys(mapping.titles),
  ]) {
    if (real.length >= 3) secrets.set(real, 'mapping')
  }
  const forbiddenPath = join(REPO_ROOT, '.forbidden-words')
  const forbidden = existsSync(forbiddenPath)
    ? readFileSync(forbiddenPath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#'))
    : []
  const leaks: string[] = []
  for (const output of outputs) {
    const values: { path: string; value: string }[] = []
    outputValues(JSON.parse(output.text) as Json, '', '', values)
    for (const [secret, where] of secrets) {
      const lowerSecret = secret.toLowerCase()
      if (FIXED_VOCABULARY.includes(lowerSecret)) continue
      for (const { path, value } of values) {
        if (value.includes(lowerSecret)) {
          leaks.push(
            `${output.outName}${path}: 生の値が残っている（出どころ ${where}、長さ ${secret.length}）`,
          )
        }
      }
    }
    const lowerText = output.text.toLowerCase()
    for (const word of forbidden) {
      if (lowerText.includes(word.toLowerCase()))
        leaks.push(`${output.outName}: 禁止語リストの語が残っている`)
    }
  }
  if (leaks.length > 0) {
    for (const leak of [...new Set(leaks)].slice(0, 50)) console.log(leak)
    throw new SafeError(`置き換え漏れ ${leaks.length} 件。何も書かずに止めた`)
  }

  for (const output of outputs) {
    writeFileSync(join(OUT_DIR, `${output.outName}.json`), output.text)
  }
  writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`)
  console.log(`書いた: ${outputs.map((output) => output.outName).join(', ')}`)
  console.log(
    `禁止語リスト: ${existsSync(forbiddenPath) ? `${forbidden.length} 語で検査した` : '無い（技術者が用意するまで、この検査は未）'}`,
  )
  console.log(`"example" に置き換えたキーの位置（値は出さない）:`)
  for (const [path, count] of [...replacedPaths].sort()) console.log(`  ${path} × ${count}`)
}

try {
  main()
} catch (error) {
  console.error(
    error instanceof SafeError
      ? error.message
      : `失敗した（${error instanceof Error ? error.name : typeof error}）。中身は出さない`,
  )
  process.exitCode = 1
}
