// github/ の部品の単体テストで使う、偽の GitHubClient（component-backend.md 9.）。
// 受けた問い合わせを覚え、テストが決めた応答を返す。決めていない問い合わせはエラーにする（MSW の onUnhandledFrame と同じ考え）。
import type {
  GetRequest,
  GitHubClient,
  GitHubFailure,
  GitHubResult,
  GraphQLRequest,
} from '../../src/main/github/client'

export interface FakeGitHubClient extends GitHubClient {
  gets: GetRequest[]
  queries: GraphQLRequest[]
}

export interface FakeAnswers {
  get?: (request: GetRequest) => GitHubResult
  graphql?: (request: GraphQLRequest) => GitHubResult
}

export function createFakeGitHubClient(answers: FakeAnswers): FakeGitHubClient {
  const gets: GetRequest[] = []
  const queries: GraphQLRequest[] = []
  return {
    gets,
    queries,
    get(request) {
      gets.push(request)
      if (answers.get === undefined)
        return Promise.reject(new Error(`想定外の GET ${request.path}`))
      return Promise.resolve(answers.get(request))
    },
    graphql(request) {
      queries.push(request)
      if (answers.graphql === undefined) return Promise.reject(new Error('想定外の GraphQL'))
      return Promise.resolve(answers.graphql(request))
    },
  }
}

export function okResult(
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
): GitHubResult {
  return { kind: 'ok', status, headers: new Headers(headers), body }
}

export function notModifiedResult(headers: Record<string, string> = {}): GitHubResult {
  return { kind: 'not_modified', headers: new Headers(headers) }
}

export function failedResult(failure: GitHubFailure): GitHubResult {
  return { kind: 'failed', failure }
}
