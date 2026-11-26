# セキュリティ規約（security-rules.md）

- 作成: 2026-11-26（⑪ 規約設計）
- 入力: ADR-002・004・005・007、[non-functional.md](../quality/non-functional.md) Q-09〜Q-12・Q-15、[domain-model.md](../components/domain-model.md) 7.、[auth-flow.md](../api-contract/auth-flow.md)、[container-overview.md](../architecture/container-overview.md) 5.
- 状態: 技術者が確認済み（2026-11-26）。「AI案」と書いた項目も技術者がこの内容で確認した
- 更新: 2026-11-26 ⑫ の設計レビューを反映（DR-02・12・14）

トークンは `repo` スコープ（読み書きを含む）を持ち、会社のプライベートリポジトリの内容を扱う。リポジトリは公開する（ADR-005）。この2つを前提に、守ることを番号で決める。

---

## 1. 決まり

| # | 決まり | 確かめ方 |
| --- | --- | --- |
| S-01 | **トークン**: safeStorage の非同期版の関数で暗号化して保存する。読み出すのは `src/main/auth/` だけ。画面（IPC）・ログ・保存した出来事・URL・エラーの文言に出さない。平文で保存できない環境なら保存しない（`encryption_unavailable`）（I-7、Q-10、N-05） | 単体（ログに出ない、IPC の値に無い）、手動（保存したファイルとログにトークンが無い。AC-32） |
| S-02 | **書き込まない**: REST は GET だけ、GraphQL は `query` だけ。スコープは `repo`・`notifications` だけを求める（N-06、ADR-002） | S-07 のテスト、コードレビュー |
| S-03 | **画面の設定**: `contextIsolation: true`・`nodeIntegration: false`・`sandbox: true`・`webSecurity: true`。`<webview>` を使わない。画面から別の URL への移動と新しい窓を止める（`will-navigate` で止め、`setWindowOpenHandler` は `deny`）（ADR-007） | 設定の単体テスト、E2E |
| S-04 | **CSP**: 配布物の画面は `index.html` の meta で `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'` にする。部品の `style` 属性は使わない（CSS Modules を使う）。開発中だけ、開発サーバーへの接続と画面の即時反映に要る分を electron-vite の設定で緩める（⑬ B0: `style-src` に `'unsafe-inline'`、`connect-src` に開発サーバー。`script-src` は緩めない。`electron.vite.config.ts`） | E2E（配布物の CSP が上のとおり）。`test/config/csp.test.ts` で `index.html` の meta も確かめる |
| S-05 | **GitHub から取った文字**（タイトル・本文の抜粋・ユーザー名）は文字としてだけ出す。HTML として解釈しない。Markdown を HTML にしない。外の画像（アバターなど）を読み込まない（Q-11） | ESLint `react/no-danger`、コードレビュー |
| S-06 | **外で開く URL・コピーする URL**: `URL` で解釈し、`https:` で、ホストが `github.com` ちょうどで、ユーザー名・パスワード・ポートが無いものだけ。文字列の前方一致で判定しない（`https://github.com.example.com` などを通さないため）。OS の設定画面を開くときは、メインが OS ごとに決めた固定の先だけを開く（I-8） | 単体（`core/url-guard`。通らない例を表で並べる） |
| S-07 | **書き込みが無いことの検査**: `src/main/github/` の中に、GET 以外の REST の呼び出しと、GraphQL の `mutation` が無いことをテストで確かめる | テスト（CI） |
| S-08 | **IPC**: 契約（ipc-contract.md）にあるチャンネルだけを受ける。引数は zod（`.strict()`）で検査する。送り主が本アプリの画面であることを確かめる。`ipcRenderer` そのものを画面に出さない | 契約のテスト |
| S-09 | **ログ**: トークン・出来事の本文・PR や issue のタイトルを書かない。書くのは問い合わせ先の種類・状態コード・所要時間・利用制限の残り・エラーの分類・スレッドの id・デスクトップ通知を出した記録（出来事の id・種類・発生の時刻・出した時刻）。トークンの形（`gho_`・`ghp_`・`github_pat_` などで始まる文字列）は書く前に消す。手元にだけ置き、外に送らない。7日で消す（Q-15） | 単体 |
| S-10 | **テストの応答（fixtures）**: 実際の応答を記録したら、test-conventions.md 3. の表で置き換えてからコミットする。置き換えた後、禁止語リスト（下の S-14）で検索して0件であることを確かめる | S-14 の検査。⑬ から、置き換えの道具の検査（生の文字列が残っていたら書かない）と `test/fixtures/github/` の CI の検査（`test/contract/fixtures-anonymized.test.ts`）も |
| S-11 | **依存パッケージ**: `package-lock.json` をコミットする。CI で `npm audit --audit-level=high` を通す。Dependabot で npm と GitHub Actions を週1回見る。Electron は公式に支援される版（新しい3つのメジャー版）を使い続ける。部品を足すときは技術者に聞く（Q-12）。Electron のメジャー版を上げるときは、対応 OS（C-07）が変わらないかを確かめ、変わるなら技術者に聞く。依頼者の確認を経て C-07 と Releases の説明を直す（DR-12）。`@types/node`（Electron の中の Node.js の系統に合わせる）と `eslint`・`@eslint/js`（eslint-plugin-react が対応するまで）・`typescript`（typescript-eslint が対応するまで）のメジャー版は、Dependabot に提案させない（`.github/dependabot.yml`。⑬ で技術者が決めた） | CI、Dependabot |
| S-12 | **GitHub Actions**: ワークフローの `permissions` は最小にする（既定は `contents: read`、Releases に置くジョブだけ `contents: write`）。使う Action はコミットの SHA で固定する。秘密の値は `GITHUB_TOKEN` だけを使う。`pull_request_target` を使わない | コードレビュー |
| S-13 | **リポジトリ**: secret scanning と push protection を有効にする。`main` を保護し、PR と CI の成功を必須にする（DR-14）。コミットの作成者のメールアドレスを GitHub の noreply のものにする（公開リポジトリでは誰でも見えるため）。`.gitignore` に、ビルドの出力・`.env`・トークンを入れたファイル・禁止語リストを入れる | S-14 の検査 |
| S-14 | **公開前の見直し**（2.） | 2. のチェックリスト |
| S-15 | **保存したデータ**: 置き場所はユーザーフォルダ（`userData`）。暗号化しない（N-10、D-023）。30日を過ぎた出来事は消す。サインアウトで出来事も消す（auth-flow.md 6.） | 結合（AC-40） |
| S-16 | **OAuth App**: コードに入れるのは client ID だけ。client secret はどこにも置かない（ADR-004） | コードレビュー |
| S-17 | **更新**: 自動更新はしない（W-07）。新しい版の確認は版の番号を比べるだけで、ダウンロードは利用者がブラウザで行う | コードレビュー |
| S-18 | **Mac の配布物は Hardened Runtime を入れる**。外から本アプリに部品を差し込まれ、キーチェーンの鍵からトークンを読まれるのを防ぐ。許可（entitlements）は electron-builder の既定のものだけにし、`allow-dyld-environment-variables` は足さない（build-and-release.md 2.） | 設定のコードレビュー、⑭ の手動（配布物の起動） |

---

## 2. 公開前の見直し（S-14）

### 禁止語リスト

- 会社名・Organization 名・チーム名・同僚の名前・社内のリポジトリ名を1行1語で書いたファイルを、**リポジトリの外か `.gitignore` に入れた場所**に置く（`.forbidden-words`）。中身は技術者が決める。AI は中身を推測で書かない。⑬ では技術者の依頼で、AI が記録した応答の置き換えの対応表（実際の名前）とメールアドレスのドメインから案を作り、技術者が見て直す形にした。案の語は会話に出さない
- 下の検査は、このリストの語で、リポジトリの全ファイルと全コミットのメッセージを検索する。道具は `npm run check:publish`（`scripts/check-publish.ts`。#2〜#4 を行う。英数字の語は前後が英数字でないときだけ当てる。見つかった語そのものは出さず、リストの何行目か・ファイルの何行目かだけを出す）

### 最初の push の前

| # | 確かめること | 誰が |
| --- | --- | --- |
| 1 | `docs/` を読み、会社名・Organization 名・実在の人やリポジトリの名前・社内の事情が書かれていないか。チームの人数や Slack が使えない事情などは書いてあり、技術者は「一旦現状でOK」とした（container-overview.md 5.）。公開前にもう一度見て決める | 技術者 |
| 2 | 禁止語リストで、全ファイルと全コミットのメッセージを検索して0件 | AI が検索し、技術者が結果を見る |
| 3 | トークンの形（`gho_`・`ghp_`・`ghs_`・`ghu_`・`github_pat_`）で全ファイルと全履歴を検索して0件 | 同上 |
| 4 | 全コミットの作成者のメールアドレスが GitHub の noreply のもの | 同上 |
| 5 | GitHub のリポジトリで secret scanning と push protection を有効にした | 技術者 |

### リリース（タグを付ける）の前

- 上の 2・3 をもう一度行う
- Releases の説明に、F-30 の内容（初回の OS の警告の越え方と対応 OS）が入っている（build-and-release.md 5.）
