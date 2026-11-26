# 画面の部品（component-frontend.md）

- 作成: 2026-11-26（⑩.4 フロントエンドコンポーネント設計）
- 入力: [requirements.md](../../requirements/requirements.md)、[acceptance.md](../../requirements/acceptance.md)、[ipc-contract.md](../api-contract/ipc-contract.md)、[domain-model.md](domain-model.md)、[non-functional.md](../quality/non-functional.md) Q-11・Q-17、ADR-007・012
- 状態: 技術者が確認済み（2026-11-26）。状態の持ち方（React 標準の仕組みだけ）は技術者が決めた（ADR-012）。「AI案」と書いた項目も技術者がこの内容で確認した
- 更新: 2026-11-26 ⑫ の設計レビューを反映（DR-03・06・18）

見た目（色・書体・余白・角丸、ライトとダーク）は ⑪ の design-system.md に従う。ここでは部品の分け方と、状態の持ち主だけを決める。`docs/requirements/mockup/` は見た目の土台にしない（AGENTS.md）。

---

## 1. 画面の切り替え

ページの移動（ルーター）は使わない。メインから届く `AppState` で、出す画面を1つに決める（AI案）。

| 条件（上から順に） | 画面 |
| --- | --- |
| `auth.status = 'keychain_notice'` | キーチェーンの案内（F-36 (5)） |
| `auth.status = 'signing_in'`（知らせの帯の「サインインし直す」を押した） | 使い始めの案内の手順2（サインイン）だけ（DR-18） |
| `onboardingRequired` または `auth.status = 'signed_out'` | 使い始めの案内（F-36） |
| 設定を開いている | 設定 |
| それ以外 | メイン（出来事の一覧と PR の一覧） |

---

## 2. 3つの階層

### 2.1 Page（画面）

| Page | 中身 | 要件 |
| --- | --- | --- |
| `KeychainNoticePage` | 「この後キーチェーンの確認が出ます。『常に許可』を押してください」と「続ける」（案内するボタンは ⑭ で確かめて決める。DR-06） | F-36 (5)、AC-42 |
| `OnboardingPage` | 使い始めの案内の手順（3.） | F-36、AC-29・41 |
| `MainPage` | 上部の知らせ（受け取れていない・デスクトップ通知の失敗・新しい版）、出来事の一覧、PR の一覧。並べ方はタブか左右（F-33） | F-11〜F-18・F-20・F-33・F-34・N-08・N-09 |
| `SettingsPage` | デスクトップ通知（種類ごと・bot）、出来事の一覧の日数、PR の一覧の期間、並べ方、言語、自動起動、アカウント（ユーザー名・サインアウト・GitHub 側での取り消しの案内）、使い始めの案内をもう一度 | F-09・F-16・F-25・F-26・F-28・F-32・F-33 |

### 2.2 Feature（機能のまとまり）

| Feature | 部品 | 要件 |
| --- | --- | --- |
| `event-list` | `EventListPanel`、`EventFilterBar`（文字・種類・リポジトリ）、`EventRow`（種類・レビューの結果か CI の結果・対象・リポジトリ・誰が（bot の印）・いつ・抜粋）、絞り込みの関数 `filterEvents` | F-11・F-12・F-13・F-32、AC-15・16・34 |
| `pr-list` | `PrListPanel`、`PrFilterBar`（文字・状態・リポジトリ・自分待ちの理由。理由には「自分待ちの理由あり（どれか1つ）」も入れる）、`PrRow`（タイトル・リポジトリと番号・状態・作成者・更新・理由のラベル）、`ReloadButton`、`CopyAllLinksButton`、絞り込みの関数 `filterPrs` | F-14〜F-18・F-20・F-34、AC-17〜22・36 |
| `status` | `IngestStatusBanner`（受け取れていない理由と、できること: サインインし直す・待つ）、`DesktopNotificationBanner`（失敗の理由と直し方: OS の設定を開く・アプリケーションフォルダへ移す）、`UpdateBanner`（新しい版と Releases を開く） | N-08・N-09・F-31、AC-14・31・38 |
| `auth` | `DeviceFlowPanel`（コード・コピー・GitHub を開く・`repo` スコープの説明・待っている表示）、`PatPanel`（作成ページへのリンク・貼り付け欄） | F-27・F-36 (2) |
| `onboarding` | 3. の各手順の部品 | F-36 |
| `settings` | `SettingsForm` | 2.1 の `SettingsPage` |

### 2.3 UI（使い回す小さな部品）

`Button`、`Badge`（種類・理由のラベル）、`TextInput`、`Select`、`Toggle`、`Tabs`、`SplitView`（左右に並べる）、`Banner`、`Toast`、`ListRow`、`EmptyState`、`Spinner`、`Dialog`。色や余白は design-system.md の値（CSS の変数）だけを使う。アイコンは v0 では使わず、文字のボタンにする（部品を足さない。DR-18）。

---

## 3. 使い始めの案内（F-36）の手順

| # | 手順 | 出す条件 | 中身 |
| --- | --- | --- | --- |
| 1 | アプリケーションフォルダへ移す | Mac で `inApplicationsFolder = false` | 移さないとデスクトップ通知が出ないことを説明し、「移して開き直す」。「あとで」も選べるが、選んだら N-09 の知らせが残る（AC-41） |
| 2 | GitHub でサインイン | 常に | デバイスフロー（既定）と PAT を切り替えられる。`repo` スコープが「プライベートリポジトリの完全な制御」と出るが、アプリは読み取りだけを行うことを説明する |
| 3 | GitHub の通知設定を確かめる | 常に | 確かめる項目（参加・メンションと Actions を「on GitHub」に、Actions の「失敗したものだけ」をオフに）と、設定ページ（`https://github.com/settings/notifications`）を開くボタン |
| 4 | 試しのデスクトップ通知 | 常に | 1件出し、結果が `failed` なら直し方と OS の設定を開くボタン。`unknown` なら「表示された／表示されなかった」を利用者に聞く |
| 5 | 終わり | 常に | 自動起動のオン／オフ（F-25）を選べる。「使い始める」で `onboarding:complete` |

- 手順2〜4は戻れる。手順3・4は飛ばせる（飛ばしたら設定から「使い始めの案内をもう一度」で戻れる）（AI案）

---

## 4. 状態の持ち主

| 状態 | 持ち主 | 持ち方 |
| --- | --- | --- |
| メインから届くもの（`AppState`・出来事・PR の一覧） | メインプロセス | 画面側に小さな store（`main-store`）を1つ作り、`window.githubInbox.on` で知らせを受けて持つ。部品は `useSyncExternalStore` で読む（ADR-012）。**画面からは書き換えない**。変えるときは invoke で頼み、push で戻ってきた値を出す |
| 入力中のもの（PAT、検索語） | 各 Feature | `useState` |
| 設定の変更 | メインプロセス | トグルなどは変えたらすぐ `settings:update` で頼む。保存ボタンは置かない（AI案） |
| 画面の中だけのもの（今のタブ、絞り込み、強調する出来事、設定を開いているか） | 各 Page・Feature | `useState`・`useReducer`。保存しない（立ち上げ直すと絞り込みは解ける。AI案）。並べ方（タブか左右）は設定として保存する |

- `main-store` は、知らせの受け取りを始めてから最初の値を取りに行く（取りに行く間に届いた知らせを落とさないため）
- 出来事は `events:added` で足し、`events:reset` で入れ替える（ipc-contract.md 3.）

---

## 5. 決まりごと

| 項目 | 内容 |
| --- | --- |
| 並べる順 | 出来事は発生の新しい順。PR は更新の新しい順（F-15） |
| 件数 | ページ送りはせず、スクロールで全件（D-016）。出来事は30日で2,000件程度までありうる。まず全件をそのまま並べ、⑭ で架空の2,000件で試して、スクロールや絞り込みが重ければ、見えている行だけを描く仕組みを入れる（AI案） |
| デスクトップ通知のクリック（F-08） | `ui:focusEvent` を受けたら、出来事の一覧を出し（タブのときは切り替える）、その行までスクロールして強調する。絞り込みで隠れていたら絞り込みを解く（AI案） |
| すべてのリンクをコピー（F-34） | 今の絞り込みの結果を、表示の順に `clipboard:copyLinks` に渡す。終わったら「N 件コピーしました」を出す（AC-36） |
| 時刻 | 「5分前」のような表し方と、指したときに日時を出す。言語に合わせる |
| 言語（F-26） | `i18n/ja.ts`・`i18n/en.ts` に文言を置き、キーを型で縛る（部品は入れない。AI案）。区分値の表示名（business-data.md の業務語）もここに置く。**CI の結果は訳さず GitHub の値のまま**（business-data 2.3）。GitHub から取った文字（タイトル・本文）も訳さない |
| ダークモード（F-35） | CSS の `prefers-color-scheme` で、design-system.md のライト・ダークの値を切り替える。メインは OS に従う設定のまま |
| キーボード | Cmd+R（Windows は Ctrl+R）で PR の一覧をリロード、Cmd+F で今の一覧の検索欄へ、Cmd+, で設定（AI案。要件に無い追加のため、⑮ で依頼者に見せ、要らなければ外す。DR-03）。Electron の既定のメニューの「再読み込み」（画面ごと読み直す）は配布物では外す |
| 知らせの優先順 | 受け取りの状態は `auth_failed` → `rate_limited` → `offline` → `github_error` → `syncing` の順に1つだけ出す。デスクトップ通知の失敗と新しい版は別に出す |

---

## 6. 画面の安全（Q-11、ADR-007）

- GitHub から取った文字（タイトル・抜粋・ユーザー名）は、**文字としてだけ**出す。`dangerouslySetInnerHTML` を使わない。Markdown を HTML にしない
- リンクは `<a href>` で開かず、`shell:openGitHub` で頼む（メインが URL を確かめる）
- 外のものを読み込まない（GitHub のアバター画像も出さない。AI案）。Content-Security-Policy は `default-src 'self'` を基本に、画像は `'self' data:` だけ、接続先は無し。開発中のサーバーに要る緩め方は security-rules.md S-04
- 画面から Node.js の機能・`ipcRenderer` は使えない（preload の `window.githubInbox` だけ）

---

## 7. フォルダ構成

```text
src/renderer/
  main.tsx              入口
  App.tsx               1. の画面の切り替え
  main-store/           メインから届く状態（useSyncExternalStore）
  pages/                keychain-notice/ onboarding/ main/ settings/
  features/             event-list/ pr-list/ status/ auth/ onboarding/ settings/
  ui/                   2.3 の部品
  i18n/                 ja.ts en.ts
  styles/               design-system.md の値（CSS の変数）
```

- 絞り込みの関数（`filterEvents`・`filterPrs`）と表示の整形は、部品から切り離した関数にして単体テストを書く（test-strategy.md 2.）
- Feature どうしは直接読み合わない。共有するものは `main-store` か `ui/` に置く

---

## 8. 未定

| 項目 | 状態 |
| --- | --- |
| CSS の書き方 | 決めた（⑪）: CSS Modules ＋ design-system.md の CSS の変数（coding-standards.md 1.） |
| 画面を作る道具 | 決めた（⑪）: electron-vite（ADR-014） |
| 見た目 | design-system.md v0（仮）を ⑪ で起票した。値は実機で依頼者が見て直す（Q-17） |
