// 利用者（github-api.md 6.）。GET /user で、ユーザー名とトークンのスコープを取る。
// 所属チーム（GET /user/teams）は、使う取り込み（S3）で足す。
import { z } from 'zod'
import type { GitHubClient, GitHubFailure } from './client'

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
