// 利用者（github-api.md 6.）。GET /user で、ユーザー名とトークンのスコープを取る。
// GET /user/teams で、所属チーム（チームへのメンションの判定。M-7）を取る。
import { z } from 'zod'
import { getAllPages, type GitHubClient, type GitHubFailure } from './client'

export type ViewerResult =
  /** scopes は X-OAuth-Scopes。ヘッダーが無ければ null（fine-grained PAT。auth-flow.md 3.） */
  | { kind: 'ok'; login: string; scopes: string[] | null }
  | { kind: 'failed'; failure: GitHubFailure }

// 使う項目だけを検査する（ほかの項目は捨てる）
const ViewerSchema = z.object({ login: z.string().min(1) })

export function parseScopes(header: string | null): string[] | null {
  if (header === null) return null
  return header
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope !== '')
}

export async function fetchViewer(client: GitHubClient): Promise<ViewerResult> {
  const result = await client.get({ endpoint: 'user', path: '/user' })
  if (result.kind === 'failed') return result
  if (result.kind === 'not_modified') {
    return { kind: 'failed', failure: { kind: 'github_error', status: 304 } }
  }
  const parsed = ViewerSchema.safeParse(result.body)
  if (!parsed.success) {
    return { kind: 'failed', failure: { kind: 'github_error', status: result.status } }
  }
  return {
    kind: 'ok',
    login: parsed.data.login,
    scopes: parseScopes(result.headers.get('x-oauth-scopes')),
  }
}

export type TeamsResult =
  /** "組織/チーム"（@組織/チーム の形。D-020） */
  { kind: 'ok'; teams: string[] } | { kind: 'failed'; failure: GitHubFailure }

const TeamsPageSchema = z.array(
  z.object({ slug: z.string().min(1), organization: z.object({ login: z.string().min(1) }) }),
)

/** 所属チーム（`repo` スコープで読める。0-5 で確かめた。domain-model.md 10. #1） */
export async function fetchTeams(client: GitHubClient): Promise<TeamsResult> {
  const result = await getAllPages(
    client,
    { endpoint: 'user_teams', path: '/user/teams?per_page=100' },
    (body) => {
      const parsed = TeamsPageSchema.safeParse(body)
      return parsed.success
        ? parsed.data.map((team) => `${team.organization.login}/${team.slug}`)
        : undefined
    },
  )
  if (result.kind === 'failed') return result
  if (result.kind === 'not_modified') {
    return { kind: 'failed', failure: { kind: 'github_error', status: 304 } }
  }
  return { kind: 'ok', teams: result.items }
}
