# GitHub への問い合わせ（github-api.md）

- 作成: 2026-11-26（⑩.3 インターフェース設計）
- 入力: ADR-002・010、[domain-model.md](../components/domain-model.md)、[component-backend.md](../components/component-backend.md)、[non-functional.md](../quality/non-functional.md) Q-01・Q-02・Q-04
- 状態: 技術者が確認済み（2026-11-26）。REST と GraphQL を併用することは技術者が決めた（ADR-010）。「AI案」と書いた項目も技術者がこの内容で確認した
- 更新: 2026-11-26 ⑫ の設計レビューを反映（DR-09・16・17）
- 更新: 2026-11-27 デバイスフローをやめ、つなぎ先を `api.github.com` だけにした（CR-007）。`/user/teams` が `repo` スコープで読めることを書いた（0-5）
- 更新: 2026-11-27 まとめた分解の `$since` を、一番古いスレッドのものにした（CR-009。⑭ S3）

メインプロセスの `github/` だけが GitHub につなぐ（component-backend.md）。ここに書いていない API は使わない。足すときはこの文書を先に直す。

---

## 1. 共通の決まり

| 項目 | 内容 |
| --- | --- |
| つなぎ先 | `https://api.github.com`（REST・GraphQL）だけ。他には問い合わせない（デバイスフローの `https://github.com/login/…` は CR-007 で使わなくなった） |
| ヘッダー | `Authorization: Bearer <トークン>`、`Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2022-11-28`、`User-Agent: github-inbox/<版>` |
| 時間切れ | 30秒 |
| 書き込みをしない（N-06） | REST は GET だけ。GraphQL は `query` だけで、`mutation` は書かない。コードの検査で確かめる（Q-10） |
| 値の埋め込み | GraphQL の検索語・リポジトリ名・番号は**変数で渡し**、問い合わせの文字列に埋め込まない |
| 利用制限 | 応答のヘッダー（`x-ratelimit-remaining`・`x-ratelimit-reset`・`x-ratelimit-resource`・`retry-after`）を毎回読み、`rate-budget` に渡す（component-backend.md 6.） |
| ログ | 問い合わせ先の種類・状態コード・所要時間・利用制限の残りだけを書く。ヘッダーの `Authorization`、応答の本文は書かない（Q-15） |

---

## 2. GitHub の通知（REST）

`GET /notifications`

| 項目 | 値 |
| --- | --- |
| 問い合わせの値 | `all=true`（GitHub 側で既読にしたものも取る。D-007）、`since=<前回の成功の時刻 − 5分>`、`per_page=50` |
| ヘッダー | `If-None-Match: <前回の ETag>`。変わっていなければ 304 で、利用制限に数えられない。`If-Modified-Since` では 304 にならず 200 が返る（⑬ で確かめた。CR-003） |
| 次のページ | `Link` ヘッダーの `rel="next"` をたどる |
| 間隔 | 応答の `X-Poll-Interval`（秒）より短くしない。2026-11-26 に確かめた値は60 |
| 使う項目 | `id`、`reason`、`updated_at`、`subject.type`・`subject.url`・`subject.latest_comment_url`・`subject.title`、`repository.full_name` |

- `subject.url` が `…/repos/{owner}/{repo}/pulls/{number}` なら PR、`…/issues/{number}` なら issue として 3. で分解する
- 2026-11-26 の依頼者のデータ（`all=true` の50件）では、種類は `PullRequest` と `Issue` だけで、`subject.url` はすべてあった。`latest_comment_url` は空のものがあった（⑬ で数えた: 50件のうち、PR そのものを指す35・issue そのもの3・issue のコメント2・空10）
- **M-9 に当たったスレッドだけ**、`subject.latest_comment_url` を `GET` で読む（domain-model.md 4.1 M-9。CR-004）。使う項目は `user.login`・`user.type`・`html_url`・`body`（PR・issue・コメントのどれを指していても同じ名前）。空のとき・読めなかったときは読まない

---

## 3. 出来事への分解（GraphQL）

`POST /graphql`。変わったスレッドを**1回に20件まで**、別名（alias）を付けて1つの問い合わせにまとめる（AI案）。

```graphql
query Expand($since: DateTime!, $o0: String!, $r0: String!, $n0: Int!) {
  rateLimit { cost remaining resetAt }
  t0: repository(owner: $o0, name: $r0) {
    pullRequest(number: $n0) { ...PrExpand }   # issue のときは issue(number:) { ...IssueExpand }
  }
  # t1 … t19 も同じ形
}

fragment PrExpand on PullRequest {
  id number title url state isDraft createdAt body
  author { login __typename }
  viewerLatestReview { state }
  timelineItems(since: $since, first: 100,
    itemTypes: [ISSUE_COMMENT, REVIEW_REQUESTED_EVENT, ASSIGNED_EVENT]) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on IssueComment { id url createdAt body author { login __typename } }
      ... on ReviewRequestedEvent {
        id createdAt actor { login __typename }
        requestedReviewer { __typename ... on User { login } }
      }
      ... on AssignedEvent {
        id createdAt actor { login __typename }
        assignee { __typename ... on User { login } }
      }
    }
  }
  # レビューは timelineItems ではなく reviews の一覧で取る（CR-002）
  reviews(last: 50) {
    pageInfo { hasPreviousPage startCursor }
    nodes {
      id url state createdAt submittedAt body author { login __typename }
      comments(first: 20) { nodes { url body replyTo { id } } }
    }
  }
}

fragment IssueExpand on Issue {
  id number title url state createdAt body
  author { login __typename }
  timelineItems(since: $since, first: 100, itemTypes: [ISSUE_COMMENT, ASSIGNED_EVENT]) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      # issue には PullRequestReview・ReviewRequestedEvent の断片を入れられない（入れると問い合わせ全体が失敗する。CR-001）
      ... on IssueComment { id url createdAt body author { login __typename } }
      ... on AssignedEvent {
        id createdAt actor { login __typename }
        assignee { __typename ... on User { login } }
      }
    }
  }
}
```

- **レビューのスレッドへの返信は timelineItems に出てこない**（⑬ で依頼者のデータで確かめた。返信だけのレビュー285件のうち、timelineItems に出たのは0件）。そのためレビューは `reviews(last: 50)` で取り、提出した時刻（`submittedAt`）が「分解した時刻 − 5分」以降のものだけを使う。`submittedAt` が無いもの（下書き中）は使わない。一番古いものがまだ範囲内で `hasPreviousPage` が真なら、そのスレッドだけ `before` で前へたどる（CR-002）
- `reviews` の行へのコメントの `replyTo` は、REST の `in_reply_to_id` と一致する（⑬ で確かめた）。返信だけのレビューの見分け（domain-model.md 4.1 M-4）に使う
- `$since` は、まとめたスレッドのうち一番古い「分解した時刻 − 5分」（スレッドの取り込みの記録。domain-model.md 5.）。`$since` は断片の中にあるため、1つの問い合わせの中でスレッドごとに分けられない。そこでスレッドを since の順に並べ、近いものから20件ずつまとめる。スレッドごとの since での絞り込みは `core/expand-thread` が行う（CR-009）。`timelineItems` の `since` は、コメント・レビュー依頼・アサインの作られた時刻で絞る
- 1つのスレッドで timelineItems の `hasNextPage` が真なら、そのスレッドだけ `after` で続きを取る
- チーム（`Team`）の名前などの項目は読まない。`read:org` スコープが無いと読めないため（domain-model.md 10. 要確認 1）
- 一部の別名だけが失敗した（`errors` に入った）ときは、そのスレッドだけを失敗として扱う（component-backend.md 5.2）
- 2026-11-26 に依頼者のデータで確かめた: 3スレッドで1.2秒、利用制限の消費3。`since` で絞れた。⑬ で `reviews` に変えた後は、20スレッドで消費9〜10（30日分）。応答は30日分・20スレッドで約1MB になることがある

---

## 4. CI の結果（REST）

`ci_activity` のスレッドのリポジトリについて:

`GET /repos/{owner}/{repo}/actions/runs?actor={利用者}&status=completed&created=>={since の日付 − 1日}&per_page=100`

- `Link` ヘッダーで次のページもたどる。作られた日付で絞るのは `since` の前の日からにし、日付をまたいで終わった実行を落とさない。どれを出来事にするかは `updated_at` で決める（DR-09。⑬ で記録した応答で確かめる）

| 使う項目 | 出来事への写し方 |
| --- | --- |
| `node_id`・`run_attempt` | 出来事の id（domain-model.md 3.） |
| `conclusion` | `ciConclusion`（GitHub の値のまま） |
| `name`・`display_title`・`head_branch` | 対象のタイトル |
| `html_url` | 出来事の URL |
| `updated_at` | 発生の時刻。取り込みの記録より新しいものだけ |
| `triggering_actor.login` | 利用者と同じものだけ（再実行を含め、利用者が起動したもの） |

- ⑬ で本リポジトリの CI の実行で届いたものを記録して確かめた（domain-model.md 10. 要確認 2、R-05。`test/fixtures/github/notifications-repo-ci-activity.json`・`rest-workflow-runs.json`）
  - `ci_activity` のスレッドは、種類が `CheckSuite` で、`subject.url` と `latest_comment_url` はどちらも空。どの実行かはスレッドから分からないため、リポジトリのワークフロー実行を上の問い合わせで取る
  - **`actor` の絞り込みは効かない**（Dependabot が起動した実行も返ってきた）。出来事にするかは `triggering_actor.login` で手元で決める
  - やり直すと `run_attempt` が増え、`updated_at` だけが新しくなる（`created_at` は最初の実行のまま）。作られた日付で `since` の前の日から絞るため、**作られてから1日を超えた実行のやり直しは拾えない**（まれな場面として受け入れる。R-05）
  - 届くのは、利用者が GitHub の通知の設定で Actions を「on GitHub」にし、「Only notify for failed workflows」を外しているときだけ（⑬ で技術者の設定で確かめた。F-36 (3)、ADR-002）
  - 対象のタイトルは「ワークフロー名: 表示のタイトル（ブランチ）」（⑬ で AI が決めた。build-plan.md 8.）

---

## 5. PR の一覧（GraphQL。検索3本を同時に）

| 本 | 検索語（`<境目>` は「今の時刻 − 期間の日数」の時刻。ISO 8601） | 取る項目 | 使い道 |
| --- | --- | --- | --- |
| A | `is:pr involves:@me updated:><境目>` | `id number title url state isDraft updatedAt author { login __typename } repository { nameWithOwner } assignees(first: 10) { nodes { login } }` | 一覧の本体（github-prs と同じ範囲）、`assigned` |
| B | `is:pr review-requested:@me updated:><境目>` | A と同じ | 一覧に足す（business-data.md 3.）、`review_pending`（チーム宛てを含む） |
| C | `is:pr is:open author:@me updated:><境目>` | `id reviewDecision latestOpinionatedReviews(first: 20, writersOnly: true) { nodes { state } } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }` | `changes_requested`・`approved`・`ci_failed` |

- どれも `search(query: $q, type: ISSUE, first: 100)`。100件を超えたら `after` で続きを取る（A は30日で150件程度になりうる）
- 境目は github-prs と同じく時刻で数える（github-prs は「今 − 7日」の時刻を `updated:>` に入れている。⑫ で公開されているソースを確かめた）。日付で数えないので、時間帯の違いで1日ずれることは無い（DR-17）
- A と B を合わせ、同じ PR（id）は1つにする。C の結果は id で A・B の行に重ねる
- **1つの問い合わせで全部の項目を取らない**。2026-11-26 に依頼者のデータで測った結果は下のとおりで、1本にまとめると5秒（Q-02）を超えた

| 測ったもの（依頼者のアカウント、gh CLI 経由） | 時間 | 利用制限の消費 |
| --- | --- | --- |
| A・B に C の項目まで入れて1本（7日・52件） | 6.1秒 | 4 |
| 同じく30日（158件のうち100件） | 7.8秒 | 4 |
| A だけ（7日） | 1.6〜2.0秒 | — |
| C だけ（7日） | 1.3〜1.6秒 | — |
| B だけ（open） | 1.0〜1.1秒 | — |
| 参考: REST の検索 `involves:@me`（7日） | 1.7秒 | — |

3本を同時に投げれば、一番遅いもの（約2秒）で揃う見込み。30日で A が2ページになる場合も10秒以内の見込み。⑮ で依頼者の PC で測る（Q-02）。

---

## 6. 利用者・版（REST）

| API | いつ | 使い道 |
| --- | --- | --- |
| `GET /user` | 認証したとき、立ち上げたとき | 利用者のユーザー名（自分の操作を除く。M-0）。応答の `X-OAuth-Scopes` に `repo` があるか確かめる（auth-flow.md 3.） |
| `GET /user/teams?per_page=100` | 立ち上げたとき、24時間ごと | 所属チーム（チームへのメンションの判定。M-7）。`repo` スコープで読める（2026-11-27 に classic PAT で確かめた。domain-model.md 10. 要確認 1） |
| `GET /repos/{owner}/{repo}/releases/latest` | 立ち上げたとき、24時間ごと | 新しい版（F-31）。owner・repo は配布用の公開リポジトリ（build-and-release.md 1.）。`tag_name`（`v1.2.3`）と今の版を比べる。`html_url` を画面に渡す |

---

## 7. 利用制限の見積もり（Q-04）

REST と GraphQL は別々の枠（どちらも1時間5,000）。Q-04 の目安（平常時1時間300以内・取り戻し1,000以内・残り500で減速）を、**REST と GraphQL のそれぞれに当てはめる**（AI案）。

| 場面 | REST | GraphQL（点） |
| --- | --- | --- |
| 平常の1時間 | GitHub の通知 60回（変化が無ければ `If-None-Match` で 304 になり数えられない。CR-003）＋ CI 数回 ＋ 版の確認 0〜1回 ≒ **75回以内** | 分解: 変化のあった回だけ1回、1回あたりスレッド数ほど ≒ 100点以内。PR の一覧: リロード1回で数点 × 10回 ≒ 100点以内。合わせて **200点程度** |
| 立ち上げ時の取り戻し（30日） | GitHub の通知 数ページ ＋ CI 数回 ≒ **20回程度** | 200スレッドとして、20件ずつ10回 ≒ **200〜300点** |

---

## 8. 記録した応答（テストの材料）

- 模擬の GitHub（MSW など）で使う応答は、**実際の応答を記録し、架空のデータに置き換えてから**使う。推測で作らない（test-strategy.md 5.）
- 置き換えるもの: ユーザー名・チーム名・組織名・リポジトリ名・タイトル・本文・URL の中の名前・node ID・番号。リポジトリが公開されるため（ADR-005）
- 置き場所: `test/fixtures/github/`。どの API の、どの場面の応答かをファイル名で分かるようにする
- **AI は記録のために GitHub 上で出来事を起こさない**。CI の結果（`ci_activity`）は本リポジトリの CI の実行で届くものを記録する。依頼者の最近のデータに無い場面は、起きたときに記録し、それまでは記録した応答をテストの中で書き換えて使う（DR-16）
- ⑬ の最初に記録するもの: GitHub の通知（PR・issue・`ci_activity`）、3. の分解（コメント・レビュー・返信だけのレビュー・チーム宛てのレビュー依頼・bot）、4. のワークフロー実行、5. の検索3本、`/user/teams`
- ⑬ B2 で記録したものと、まだ無い場面（`ci_activity`・チーム宛てのレビュー依頼など）は `test/fixtures/github/README.md`。記録と置き換えの道具は `scripts/fixtures/`

---

## 9. 要確認

domain-model.md 10. にまとめた（チームの読み取り、`ci_activity` の形、`since` の基準の時刻、参加中の判定、返信だけのレビュー）。
