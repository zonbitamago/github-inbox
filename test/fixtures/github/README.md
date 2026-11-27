# 記録した GitHub の応答（fixtures）

実際の応答を読み取りだけで記録し、架空のデータに置き換えたもの（test-conventions.md 3.、security-rules.md S-10）。**推測で作らない**。

- 記録した日: 2026-11-26（⑬ B2。CI の2件は 0-7）。日時は「記録の30日前 = 2026-01-01T00:00:00Z」になるようにずらしてある（間隔は実際のまま）。CI の2件だけは、ワークフロー実行の絞り込みの日（記録の前の日）が 2026-01-01 になるようにずらしてある
- 記録の道具: `scripts/fixtures/record.ts`（生の応答はリポジトリの外に置く）
- 置き換えの道具: `scripts/fixtures/anonymize.ts`（置き換えの対応表はリポジトリの外に置く。生の文字列が残っていたら書かずに止まる）
- 利用者は `alice`。他の人は `bob`・`carol`・`dave`… の順、bot は `example-bot`・`example-bot-2`…、組織は `example-org`、リポジトリは `example-org/app`・`example-org/api`…
- 本文は、行の形（引用・箇条書き・見出し・コードの囲み）と `@メンション` だけを残し、文は架空のものにしてある。タイトルも架空のもの

## ファイル

| ファイル | API と場面 | 主に使うテスト |
| --- | --- | --- |
| `user.json` | `GET /user`。`X-OAuth-Scopes` を含む（gh CLI のトークンのため `gist, read:org, repo, workflow`） | 認証（S2） |
| `user-teams.json` | `GET /user/teams?per_page=100`（9チーム）。`read:org` を持つトークンでの応答。`repo` と `notifications` だけの classic PAT でも同じ9件が読めることを、0-5（R-03）で確かめた（2026-11-27。件数だけを比べた） | M-7 のチームへのメンション |
| `notifications-all.json` | `GET /notifications?all=true&per_page=50`。50件（理由: mention 24・review_requested 15・assign 7・comment 2・author 2。種類: PullRequest 47・Issue 3）。`Link` で次のページあり。`latest_comment_url` が空のものが10件 | 取り込み（S3） |
| `notifications-not-modified.json` | 同じ問い合わせに `If-None-Match`（前回の ETag）を付けたときの 304（CR-003） | 取り込み（S3） |
| `graphql-expand-own-prs.json` | 分解（github-api.md 3.）。利用者が作った PR 2件（open 1・merged 1）。返信だけのレビュー（計6件）、bot の発言、自分の PR での `@alice`、利用者自身の操作 | M-0・M-4・M-5・M-6、bot |
| `graphql-expand-others-prs-and-issue.json` | 分解。他人の open の PR 3件と、bot が作った closed の issue 1件を1つの問い合わせで。`@alice` のメンション、利用者がレビューした PR への返信、利用者へのレビュー依頼、利用者へのアサイン（issue） | M-1・M-3・M-7・M-8、PT、issue の断片（CR-001） |
| `graphql-search-a-involves.json` | PR の一覧の検索 A（`involves:@me`、7日、48件） | PR の一覧（S5） |
| `graphql-search-b-review-requested.json` | 検索 B（`review-requested:@me`、1件） | WR-1（`review_pending`） |
| `graphql-search-c-own-open.json` | 検索 C（自分の open の PR、3件。`reviewDecision`・`latestOpinionatedReviews`・`statusCheckRollup`） | WR-2〜4 |
| `rest-latest-comment-pr-body.json` | M-9 の出典（CR-004）。`latest_comment_url` が PR そのものを指すとき（本文に `@alice`） | M-9 |
| `rest-latest-comment-issue-body.json` | 同じく issue そのもの（bot が作った issue。本文に `@alice`） | M-9、bot |
| `rest-latest-comment-issue-comment.json` | 同じく issue のコメント（PR の会話のコメント。`@alice`） | M-9 |
| `notifications-repo-ci-activity.json` | `GET /repos/{owner}/{repo}/notifications?all=true`（本リポジトリ。架空の名前では `alice/tools`）。`ci_activity` のスレッド1件（種類 `CheckSuite`、`subject.url` は空）と、PR の状態の変化 | CI（S3） |
| `rest-releases-latest-none.json` | `GET /repos/{owner}/{repo}/releases/latest`（配布用のリポジトリ。github-api.md 6.）。版がまだ1つも無いときの 404。記録した日は 2026-11-27（⑭ S6b）。中に入っているのは配布用のリポジトリの名前（公開しているアプリそのもの。build-and-release.md 1.）だけで、`documentation_url` は `example.com` に置き換えた（記録した応答の検査が GitHub と example.com の外の URL を断るため） | 新しい版の確認（S6b） |
| `rest-workflow-runs.json` | `GET /repos/{owner}/{repo}/actions/runs?actor=…&status=completed&created=>=…`（github-api.md 4.）。11件。利用者の push・PR の実行、やり直し（`run_attempt` 2）、`actor` で絞っても返ってくる bot の実行 | CI の分解（`expand-workflow-runs`） |

- S3 の取り込みのテスト（`src/main/ingest/`・`test/integration/ingest.test.ts`）は、`notifications-all.json` のうち分解の応答を記録してある6スレッドだけを取り出し、分解の問い合わせには、記録した PR・issue を別名ごとに組み直して返す（`test/support/github-fixtures.ts` の `recordedExpandResponse`。書き換えた応答）

## まだ無い場面（起きたときに記録する。それまではテストの中で書き換えて使い、テストに「書き換えた応答」と書く。DR-16）

| 場面 | 状態 |
| --- | --- |
| チーム宛てのレビュー依頼（`requestedReviewer` が `Team`） | 依頼者の直近30日のデータに無かった |
| M-9（理由が `mention` なのに、本文に `@利用者` が無い） | 出典（最新のコメント）の応答は記録した。分解の応答（M-9 に当たるスレッドのもの）は記録していないため、テストで書き換える |
| 取り消されたレビュー（DISMISSED） | 記録に無い。テストで書き換える（CR-005） |
| `reviews` が50件を超えて前へたどる場面（`hasPreviousPage`） | 依頼者のデータにはあった（30日分で 10スレッド）が、記録はしていない。必要ならテストで書き換える |
| 版のある `releases/latest`（200） | 配布用のリポジトリにまだ版が無い。S7 で最初の版を出したら記録する。それまでは、テストの中で github-api.md 6. で使う項目（`tag_name`・`html_url`）だけを持つ応答を作る（2026-11-27 技術者が決めた） |
| `repo` と `notifications` だけのトークンでの `/user/teams` | 0-5（R-03）で、読めることを件数で確かめた（2026-11-27）。応答は記録していない（`user-teams.json` と同じ形のため） |
