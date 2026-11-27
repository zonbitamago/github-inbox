# テスト規約（test-conventions.md）

- 作成: 2026-11-26（⑪ 規約設計）
- 入力: [test-strategy.md](../quality/test-strategy.md)、[domain-model.md](../components/domain-model.md)、[github-api.md](../api-contract/github-api.md)、[ipc-contract.md](../api-contract/ipc-contract.md)
- 状態: 技術者が確認済み（2026-11-26）。「AI案」と書いた項目も技術者がこの内容で確認した
- 更新: 2026-11-26 ⑫ の設計レビューを反映（DR-16・17）
- 更新: 2026-11-27 ⑭ S2 で、MSW 3 の設定の名前と、画面のテストの後片付けを書いた

何をどの層で確かめるかは test-strategy.md にある。ここでは、テストの書き方の決まりを書く。

---

## 1. 道具

| 層 | 道具 |
| --- | --- |
| 単体・結合・契約 | Vitest |
| 画面の結合 | Vitest ＋ Testing Library（React）＋ jsdom |
| 模擬の GitHub | MSW（Node.js 用） |
| E2E | Playwright（Electron に対応した起動の仕組み） |
| 網羅の測定 | Vitest のカバレッジ |

---

## 2. 置き場所と名前

| 種類 | 置き場所 |
| --- | --- |
| 単体 | 対象の隣に `*.test.ts`・`*.test.tsx` |
| メインの結合 | `test/integration/` |
| 契約 | `test/contract/` |
| E2E | `test/e2e/` |
| 記録した GitHub の応答 | `test/fixtures/github/`（3.） |
| ビルドの設定（配布物の CSP など）と、決まりの検査（ファイル名・CSS の値・npm の部品・GitHub Actions・ESLint と構造の検査の決まりが効いていること。coding-standards.md 9.） | `test/config/`（⑬ B0 で足し、⑭ S1 の後に広げた。変えるときは PR で申告する。build-plan.md 6.3） |
| テストの補助（文書の表を読むなど） | `test/support/`（⑬ B1 で足した） |
| 記録と置き換えの道具 | `scripts/fixtures/`（⑬ B2 で足した。テストではなく開発の道具） |
| 手動のチェックリスト | `docs/build/manual-checklist.md`（⑬ で作る。試作のチェックリストを広げる） |

- テストの名前は日本語で、**振る舞い**を書く（例: 「利用者自身のコメントは出来事にしない」）。関数の名前を繰り返さない
- 規則に番号があるものは、名前に番号を入れる（例: 「M-4: 返信だけのレビューはコメントにする」）。domain-model.md と突き合わせられるようにする

---

## 3. 記録した GitHub の応答（fixtures）

- **推測で作らない**。実際の応答を記録し、架空のデータに置き換えてから使う（test-strategy.md 5.）
- 置き換えの表（どのファイルでも同じものを使う）

| 実際の値 | 置き換える値 |
| --- | --- |
| 利用者 | `alice` |
| 他の人 | `bob`・`carol`・`dave`。足りなければ `erin`・`frank`・`grace`… の順に続ける（⑬ B2。`scripts/fixtures/anonymize.ts` の並び） |
| bot | `example-bot[bot]` |
| 組織 | `example-org` |
| チーム | `example-org/reviewers` |
| リポジトリ | `example-org/app`・`example-org/api`・`alice/tools` |
| タイトル・本文 | 意味の通る架空の文（例:「ログイン画面の文言を直す」）。@ や引用などの形は残す |
| node ID・番号・id | 形を保った架空の値 |
| 日時 | 2026-01-01 を起点にした架空の日時 |
| URL | 上の置き換えに合わせて直す |

- 記録の手順と、置き換え漏れの確認（会社名・Organization 名・実在の人の名前・実在のリポジトリ名で検索して0件）は security-rules.md S-10
- 記録と置き換えの道具は `scripts/fixtures/`（⑬ B2）。`record.ts` は生の応答をリポジトリの外にだけ書き、`anonymize.ts` は置き換えの対応表をリポジトリの外にだけ書く。`anonymize.ts` は、生の応答の文字列（4文字以上の語と5桁以上の数）が出力に1つでも残っていれば、何も書かずに止まる。道具の出力（端末）にも、実際の値は出さない
- 記録した応答の一覧と、まだ無い場面は `test/fixtures/github/README.md`
- `test/contract/fixtures-anonymized.test.ts` が、記録した応答のユーザー名・リポジトリ・URL の持ち主が架空のものだけであること、トークンの形の文字列が無いことを CI で毎回確かめる
- ファイル名は「API と場面」が分かる形にする（例: `timeline-pr-reply-only-review.json`、`notifications-ci-activity.json`）
- テストの中で応答の一部だけ変えたいときは、記録した応答を読み込んでから、その場で書き換える。最初から全部を手で書かない
- **記録のために GitHub 上で出来事を起こさない**（AI は読み取りだけ）。CI の結果は本リポジトリの CI の実行で届くものを記録する。依頼者の最近のデータに無い場面は、起きたときに記録し、それまでは記録した応答を書き換えて使い、そのテストに「書き換えた応答」と書く（DR-16）

---

## 4. 層ごとの決まり

### 4.1 `src/main/core/`（判定）

- **先にテストを書いてから作る**（test-strategy.md 5.）
- 規則（domain-model.md 4.1 の M-0〜M-9、4.3 の自分待ちの理由、4.4 のデスクトップ通知の条件）は、**表の形のテスト（`it.each`）**にし、1行が1つの規則・1つの境目に当たるようにする
- 境目を必ず入れる: 10分ちょうど／10分を1秒過ぎた、30日ちょうど、期間の境目（今 − 日数 ちょうど）、`@alice` と `@alicex`・`@example-org/alice`、レビューの判定が空のときと空でないとき
- **分岐の網羅は 100%**（`src/main/core/` だけに Vitest のしきい値を置く）。他のフォルダには数値の目標を置かない
- 偽物は使わない（`core` は I/O を持たないため、要らないはず。要るなら `core` の作りが間違っている）

### 4.2 メインの結合

- GitHub への問い合わせは MSW で受ける。**登録していない問い合わせはエラーにする**（MSW 3 では `server.listen({ onUnhandledFrame: 'error' })`。2 までの `onUnhandledRequest` から名前が変わった。⑭ S2）。本物の GitHub にはつながない
- 時計は偽の時計（Vitest のタイマー）。間隔・利用制限・失敗が続いたときの状態の変わり方（component-backend.md 6.）を、時刻を進めて確かめる
- ファイルはテストごとの一時フォルダに書き、終わったら消す。壊れたファイル・書き込みの途中で落ちた状態（I-5）を作って確かめる
- 問い合わせの回数を数える（Q-04）。立ち上げ時の取り戻しで回数が目安を超えないこと

### 4.3 画面の結合

- `window.githubInbox` は、ipc-contract.md の型どおりの偽物を渡す。偽物は `test/` の1か所に置き、全部のテストで使い回す
- 描いた画面はテストごとに片付ける（`afterEach(cleanup)`。Vitest の globals を使っていないため、Testing Library が自動では片付けない。⑭ S2）
- 要素は役割（role）と見える文字で探す。CSS のクラス名や `data-testid` には頼らない（どうしても要るときだけ `data-testid`）
- 文言は i18n のキーではなく、日本語の表示で確かめる（言語の切り替えのテストだけ英語も）
- 画面全体のスナップショットのテストは書かない（見た目は人が判断する。Q-17）

### 4.4 契約

- ipc-contract.md 2. のすべてのチャンネルに受け口があること、不正な引数（型違い・余分な項目・範囲外）を断ることを確かめる
- メインが返す値と知らせの中身が、zod のスキーマに合うことを確かめる

### 4.5 E2E

- 重要な流れだけ（test-strategy.md 2. の5本程度）。模擬の GitHub をテストの中で立てて、アプリの問い合わせ先をそこへ向ける（向け先を変えられるのはテスト用のビルドだけにする）
- 配布物の CSP が緩んでいないこと（security-rules.md S-04）もここで確かめる

---

## 5. やってはいけないこと

- **本物のトークンをテスト・fixtures・CI の設定に入れない**。トークンが要る所は `test-token-not-real` のような、トークンの形をしていない文字列を使う
- 依頼者の実データ（記録したままの応答）をコミットしない
- テストを通すために、テスト側の期待値を実装に合わせて書き換えない。期待値が設計書とずれていたら、どちらが正しいかを技術者に聞く
- 失敗するテストを `skip` のまま残さない（残すなら理由と、いつ直すかを書く）
