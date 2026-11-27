// 新しい版（github-api.md 6.、F-31）。配布用の公開リポジトリの最新の版（GET /repos/{owner}/{repo}/releases/latest）を取る。
// 下書き・試しの版（prerelease）は GitHub が返さない。版と今の版を比べるのは app/update-check.ts。
import { z } from 'zod'
import type { GitHubClient, GitHubFailure } from './client'

/** 配布用のリポジトリ（build-and-release.md 1.） */
export const RELEASES_REPOSITORY = 'zonbitamago/github-inbox'

export type LatestReleaseResult =
  /** tagName は `v1.2.3` の形（build-and-release.md 1.）。htmlUrl は Releases のページ */
  | { kind: 'ok'; tagName: string; htmlUrl: string }
  /** 版がまだ1つも無い（404） */
  | { kind: 'none' }
  | { kind: 'failed'; failure: GitHubFailure }

// 使う項目だけを検査する（ほかの項目は捨てる）
const LatestReleaseSchema = z.object({
  tag_name: z.string().min(1),
  html_url: z.string().min(1),
})

export async function fetchLatestRelease(client: GitHubClient): Promise<LatestReleaseResult> {
  const result = await client.get({
    endpoint: 'releases_latest',
    path: `/repos/${RELEASES_REPOSITORY}/releases/latest`,
  })
  if (result.kind === 'failed') {
    const { failure } = result
    return failure.kind === 'not_accessible' && failure.status === 404 ? { kind: 'none' } : result
  }
  if (result.kind === 'not_modified') {
    return { kind: 'failed', failure: { kind: 'github_error', status: 304 } }
  }
  const parsed = LatestReleaseSchema.safeParse(result.body)
  if (!parsed.success) {
    return { kind: 'failed', failure: { kind: 'github_error', status: result.status } }
  }
  return { kind: 'ok', tagName: parsed.data.tag_name, htmlUrl: parsed.data.html_url }
}
