# コーディング規約（coding-standards.md）

- 作成: 2026-11-26（⑪ 規約設計）
- 入力: ADR-003・007・009〜014、[component-backend.md](../components/component-backend.md)、[component-frontend.md](../components/component-frontend.md)、[domain-model.md](../components/domain-model.md)
- 状態: 技術者が確認済み（2026-11-26）。「AI案」と書いた項目も技術者がこの内容で確認した（道具は ADR-014 で技術者が決めた）
- 更新: 2026-11-26 ⑫ の設計レビューを反映（DR-13・14）

**機械で拾えるもの（書式・型・import の向き・危ない書き方）は ESLint・Prettier・TypeScript で CI に強制し、ここには書かない**（設計フレーム ⑪）。ここに書くのは、機械では拾えない判断だけ。機械で強制する項目の一覧は 9.。

---

## 1. 道具と版

| 項目 | 決まり | 判断 |
| --- | --- | --- |
| 言語 | TypeScript（strict）。JavaScript のファイルは設定ファイルだけ | Q-16 |
| 開発とビルド | electron-vite（メイン・preload・画面）＋ electron-builder（配布物） | ADR-014 |
| Node.js | 24 系（Electron 45 に入っている Node.js と同じ系統）。版を書いたファイルを ⑬ でリポジトリに置く | AI案 |
| パッケージ管理 | npm（`package-lock.json` をコミットする） | AI案 |
| 画面 | React（関数の部品だけ） | ADR-003 |
| 入力の検査 | zod | ipc-contract.md |
| HTTP | Node.js の `fetch`（Octokit などは使わない。使う API が少なく、利用制限の管理を自分で持つため） | AI案 |
| ログ | 自前の小さな仕組み（1行1件の JSON、1日1ファイル、7日で消す、トークンの形を消す）。部品を入れない | AI案 |
| CSS | CSS Modules ＋ design-system.md の CSS の変数 | AI案 |
| 状態 | React 標準（`useSyncExternalStore`） | ADR-012 |

**ここに無い部品（npm のパッケージ）を足すときは、先に技術者に聞く**。開発だけで使う道具（テスト・lint の補助）も同じ。⑬ で入れた部品の一覧は build-plan.md 10.。

開発の始め方: `npm ci` → `npm run dev`。Electron 45 は、入れたときではなく初めて使うときに本体を取りに行くため、`dev`・`preview` の前に `install-electron` を動かす（`package.json` の `predev`・`prepreview`。取得済みなら何もしない）。

---

## 2. 置き場所と境界

- フォルダの構成は component-backend.md 3. と component-frontend.md 7. に従う。**新しいフォルダを作るときは、先にその文書を直す**
- `src/main/core/` は I/O を持たない（ネットワーク・ファイル・時計・Electron・`process` に触れない）。今の時刻が要る関数は、引数で `now` を受け取る（ADR-011）。詳しくは `src/main/core/CLAUDE.md`
- `src/shared/` は画面とメインの契約。**文書（domain-model.md・ipc-contract.md）を先に直してから**コードを直す。詳しくは `src/shared/CLAUDE.md`
- GitHub に問い合わせるのは `src/main/github/` だけ。使う API は github-api.md にあるものだけ。足すときは文書を先に直す
- 画面の Feature どうしは直接 import しない。共有するものは `main-store/` か `ui/` に置く（component-frontend.md 7.）
- `ui/` の部品は業務の言葉（出来事・自分待ちなど）を知らない

---

## 3. 名前

- 識別子（変数・関数・型・ファイル名）は英語。ファイル名は `kebab-case.ts`、React の部品は `PascalCase.tsx`
- 業務の言葉と名前の対応はこの表に合わせる。区分値の値は business-data.md・domain-model.md 6. のコードをそのまま使う

| 業務の言葉 | コードでの名前 |
| --- | --- |
| 出来事 | `GitHubEvent`（変数は `event`。DOM の `Event` と紛れるときは `githubEvent`） |
| 出来事の種類 | `EventType` |
| 自分待ちの理由 | `WaitingReason` |
| PR の一覧（の行） | `PullRequestItem`、一覧は `prList` |
| 取り込み | `ingest` |
| **デスクトップ通知**（本アプリが OS に出すもの） | `desktopNotification` |
| **GitHub の通知**（通知 API のスレッド） | `githubNotification`・`thread` |
| 期間 | `prPeriodDays` |
| 出来事の一覧の日数 | `eventDays` |
| 利用者 | `viewer` |

- **`notification` を単独で名前に使わない**。どちらの通知か分からなくなるため（AGENTS.md の「通知と単独で書かない」と同じ）

---

## 4. 書き方

- **失敗の扱い**: 想定内の失敗（GitHub の 401・利用制限・つながらないなど）は例外にせず、分類した値で返す（component-backend.md 6.3、ipc-contract.md 4.）。想定外の例外は、受け口（IPC の受け口・取り込みの1回分）で受けてログに書き、`internal`・`github_error` にする。**`catch` して何もしない書き方をしない**
- **時刻**: 保存と受け渡しは UTC の ISO 8601 の文字列。表示するときだけ利用者の地域の時刻にする
- **画面の文言**: 部品に日本語・英語を直接書かない。`i18n/` のキーを使う（F-26）。区分値の表示名も `i18n/` に置く。CI の結果と GitHub から取った文字は訳さない
- **GitHub から取った文字**: 文字としてだけ扱う（security-rules.md S-05）
- **値の検査**: 外から来る値（GitHub の応答・保存したファイル・IPC の引数）は、使う前に zod で検査する。型の主張（`as`）でごまかさない
- **設定の既定値**: `src/shared/` の1か所に置く（期間 7日、出来事の一覧の日数 7日など）。あちこちに数字を書かない
- **数値の決まり**: 間隔（60秒）・しきい値（残り500）・同時の本数（4本）・重なり（5分）・デスクトップ通知の10分などは、`src/main/core/constants.ts` の1か所にまとめ、根拠（Q-01 など）をコメントに書く（⑬ B3。core はどの部品からも import できるため）

---

## 5. コメント・コミット

- コメントは日本語で、**なぜそうするか**を書く（何をしているかはコードで分かるようにする）。根拠のある決まりには、文書の番号（`domain-model.md 4.1 M-4` など）を添える
- コミットのメッセージは日本語。1つのコミットに1つの目的
- 作業はブランチで行う。**コミット・push・PR の作成は、技術者に頼まれたときだけ**行う。`main` には、CI が通り、技術者が 10. の観点で見た PR だけを入れる（DR-14）

---

## 6. 文書の追従

- コードや設定を変えたら、関係する設計書・README・AGENTS.md・CLAUDE.md を直す必要があるかを確かめ、要るなら同じ作業の中で直す
- 作業を終えたと報告するときは、直した文書を挙げるか、直す必要が無い理由を1行で書く

---

## 7. React

- 部品は1ファイルに1つ。Feature の部品は、表示と、絞り込みなどの処理（純粋な関数）を分ける（test-conventions.md）
- 状態はメインから届くものを書き換えない（component-frontend.md 4.）
- 色・余白・書体の値を直接書かない。design-system.md の CSS の変数だけを使う
- `useEffect` で IPC の知らせを受けるときは、必ず受け取りをやめる関数を返す

---

## 8. やらないこと

- 書き込みをする GitHub の API を呼ばない（N-06）
- 画面から Node.js の機能・`ipcRenderer` を使わない（ADR-007）
- 設計書に無い IPC のチャンネル・GitHub の API・区分値を作らない
- 設計書の「未定」を推測で埋めない。技術者に聞く

---

## 9. 機械で強制するもの（⑬ で設定する）

| 項目 | 道具 |
| --- | --- |
| 書式 | Prettier（セミコロンなし・一重引用符・1行100文字。`.prettierrc.json`。⑬ B0 で AI が決めた）。文書（`docs/`・`*.md`）は整えない |
| 型 | TypeScript（`strict`、`noUncheckedIndexedAccess`） |
| 推奨の書き方 | ESLint（typescript-eslint の型を使う推奨設定、react-hooks） |
| `src/main/core/` から `electron`・`node:*`・他の `src/main/` のフォルダを import しない | ESLint `no-restricted-imports` |
| `src/renderer/` から `electron`・`node:*` を import しない | ESLint `no-restricted-imports` |
| 画面の Feature どうしの import をしない | ESLint `no-restricted-imports` |
| `dangerouslySetInnerHTML` を使わない | ESLint `react/no-danger` |
| `console` を使わない（ログの仕組みを使う） | ESLint `no-console` |
| `shell.openExternal` を `src/main/app/external.ts` 以外で呼ばない | ESLint `no-restricted-syntax` |
| `fetch` を `src/main/github/` 以外で使わない | ESLint `no-restricted-globals`（DR-13） |
| GitHub に書き込む呼び出しが無い（REST は GET だけ、GraphQL に `mutation` が無い） | テスト（security-rules.md S-07） |

---

## 10. PR のコードレビューで見るもの（機械に載せないもの）

AI が作った変更は PR にし、技術者が次の観点で見てから `main` に入れる（DR-14）。PR の説明の雛形（`.github/pull_request_template.md`）に、この表をチェックリストとして置く（⑬ で作る）。

| 観点 | 根拠 |
| --- | --- |
| 色・大きさの値を直接書いていない（design-system.md のトークンだけ） | 7.、design-system.md 5. |
| 画面の文言を部品に直接書いていない（`i18n/` を使う） | 4. |
| `notification` を単独で名前に使っていない | 3. |
| GitHub に書き込む呼び出し・client secret・トークンの露出が無い | security-rules.md S-01・S-02・S-16 |
| GitHub から取った文字を HTML として扱っていない | security-rules.md S-05 |
| Hardened Runtime・許可（entitlements）・GitHub Actions の権限を緩めていない | security-rules.md S-12・S-18 |
| `src/main/store/` の変更で、出来事と取り込みの記録を同じ書き込みで保存している | domain-model.md 7. I-5 |
| 文書の追従ができている（直した文書が PR の説明にある） | 6. |
