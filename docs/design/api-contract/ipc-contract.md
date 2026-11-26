# 画面とメインプロセスの間の契約（ipc-contract.md）

- 作成: 2026-11-26（⑩.3 インターフェース設計）
- 入力: [container-overview.md](../architecture/container-overview.md) 3.、[domain-model.md](../components/domain-model.md)、[component-backend.md](../components/component-backend.md)、ADR-007
- 状態: 技術者が確認済み（2026-11-26）。⑬ B1 で、`invoke` の形と `SettingsPatch` の送り方を明確にした（技術者の確認待ち）

本アプリには自前のサーバーが無いため、OpenAPI の仕様は作らない（ADR-001）。画面とメインプロセスの間の IPC が、この案件の「API の契約」に当たる。実装では `src/shared/ipc-contract.ts` に zod のスキーマとして置き、**これを唯一の正**とする（型はスキーマから作る）。

---

## 1. 決まり

- 画面からは、preload が公開した `window.githubInbox` の関数だけを使う。`ipcRenderer` そのものは公開しない（ADR-007）。依頼は `window.githubInbox.invoke(チャンネル, 引数)`、知らせは `window.githubInbox.on(チャンネル, 受け手)`（⑬ B1 で形を決めた。型は `src/shared/ipc-contract.ts` の `GithubInboxApi`）
- チャンネルの名前は `領域:動作`。2. と 3. に無いチャンネルは作らない。足すときはこの文書を先に直す
- メインプロセスは、**受け取った引数をすべて zod で検査**してから処理する（`.strict()` で余分な項目も断る）。送り主の画面が本アプリのもの（読み込んだ自分のページ）であることも確かめる
- 画面から頼む処理は、失敗も例外ではなく値で返す（4.）。画面は `error.code` から表示の文言を選ぶ（文言はメインから送らない）
- **トークンはメインから画面に一度も送らない**。PAT の貼り付け（`auth:submitPat`）だけは、画面からメインへ一度だけ送る（I-7）
- 画面とメインプロセスは同じ配布物に入るため、契約の版は分けない。食い違いは契約のテスト（test-strategy.md の「契約」）で拾う

---

## 2. 画面からメインへの依頼（invoke）

| チャンネル | 引数 | 戻り値 | 要件 |
| --- | --- | --- | --- |
| `app:getState` | なし | `AppState`（3.） | 立ち上げ時 |
| `events:list` | なし | `GitHubEvent[]`。出来事の一覧の日数以内、発生の新しい順 | F-11・F-32 |
| `prs:get` | なし | `PrListSnapshot \| null`（最後に取った一覧） | F-15 |
| `prs:reload` | なし | `Result<PrListSnapshot>`。取得中なら、その取得の結果を返す | F-20 |
| `settings:update` | `SettingsPatch`（設定の一部） | `Result<Settings>` | F-09・F-16・F-26・F-32・F-33 |
| `loginItem:set` | `{ enabled: boolean }` | `Result<{ enabled: boolean }>` | F-25 |
| `auth:startDeviceFlow` | なし | `Result<{ userCode: string; verificationUri: string; expiresAt: string }>` | F-27・F-36 (2) |
| `auth:cancelDeviceFlow` | なし | `Result<void>` | F-27 |
| `auth:submitPat` | `{ token: string }`（1〜255文字） | `Result<{ login: string }>` | F-27 |
| `auth:continueAfterKeychainNotice` | なし | `Result<void>` | F-36 (5) |
| `auth:signOut` | なし | `Result<void>` | F-28 |
| `shell:openGitHub` | `{ url: string }` | `Result<void>`。`https://github.com/` で始まらなければ `url_not_allowed` | F-12・F-17・F-36 (3)・F-31 |
| `clipboard:copyLinks` | `{ urls: string[] }`（最大1,000件） | `Result<{ count: number }>`。1件でも検査に通らなければ全体を断る | F-34 |
| `os:openNotificationSettings` | なし | `Result<void>`。OS のデスクトップ通知の設定画面を開く（開く先はメインが OS ごとに決める。画面から URL は渡さない） | N-09・F-36 (4) |
| `onboarding:moveToApplicationsFolder` | なし | `Result<void>`。成功するとアプリは移った先で開き直す | F-36 (1) |
| `onboarding:sendTestNotification` | なし | `Result<{ outcome: 'shown' \| 'failed' \| 'unknown' }>`。5秒待って、出た・失敗した・分からない | F-36 (4) |
| `onboarding:complete` | なし | `Result<void>` | F-36 |

- `SettingsPatch` で変えられるのは `desktopNotification`・`prPeriodDays`・`eventDays`・`layout`・`language` だけ。`onboarding`・`lastLaunchedVersion` は画面からは変えられない。送るのは最上位の項目の一部で、`desktopNotification` は丸ごと送る（種類ごとの一部だけは送らない。⑬ B1 で明確にした）
- 日数は1〜30の整数。範囲外は `invalid_argument`

---

## 3. メインから画面への知らせ（push）

画面は `window.githubInbox.on(チャンネル, 受け手)` で受け取る。戻り値の関数を呼ぶと受け取りをやめる。

| チャンネル | 中身 | いつ |
| --- | --- | --- |
| `state:changed` | `AppState` 全体 | 認証・受け取りの状態・デスクトップ通知の失敗・設定・新しい版・PR の一覧の取得状況が変わったとき |
| `events:added` | `GitHubEvent[]`（新しく増えた分） | 取り込みで出来事が増えたとき |
| `events:reset` | `GitHubEvent[]`（一覧の全体） | 取り戻しの終わり、出来事の一覧の日数の変更、30日を過ぎた出来事の削除、サインアウト |
| `prs:updated` | `PrListSnapshot` | PR の一覧を取り終えたとき |
| `ui:focusEvent` | `{ eventId: string }` | デスクトップ通知がクリックされたとき（F-08） |

```ts
interface AppState {
  appInfo: {
    version: string;
    platform: 'darwin' | 'win32';
    inApplicationsFolder: boolean | null; // Mac 以外は null
  };
  auth: {
    status: AuthStatus;                    // domain-model.md 6.
    login?: string;                        // GitHub のユーザー名（トークンではない）
    method?: AuthMethod;
    deviceFlow?: { userCode: string; verificationUri: string; expiresAt: string;
                   status: 'waiting' | 'expired' | 'denied' };
  };
  ingest: { state: IngestState; lastSuccessAt?: string; retryAt?: string };
  desktopNotification: { failure?: DesktopNotificationFailure; failedAt?: string };
  settings: Settings;
  loginItem: { enabled: boolean };
  onboardingRequired: boolean;
  update?: { version: string; url: string };   // F-31。url は Releases のページ
  prList: { loading: boolean; error?: IpcErrorCode };
}

interface PrListSnapshot {
  items: PullRequestItem[];   // 更新の新しい順
  periodDays: number;
  fetchedAt: string;
}
```

`GitHubEvent`・`PullRequestItem`・`Settings` と各区分値は domain-model.md 2.・6.。

---

## 4. 失敗の返し方

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: { code: IpcErrorCode } };
```

| `IpcErrorCode` | 意味 |
| --- | --- |
| `invalid_argument` | 引数が契約に合わない |
| `not_signed_in` | 認証していない |
| `offline` | つながらない |
| `auth_failed` | 認証が切れた（401） |
| `rate_limited` | 利用制限にかかった |
| `github_error` | GitHub の障害・想定外の応答 |
| `url_not_allowed` | 開く・コピーする URL が `https://github.com/` で始まらない |
| `pat_invalid` | 貼られた PAT で GitHub に入れない |
| `pat_missing_scope` | 貼られたトークンに `repo` スコープが無い（fine-grained PAT もここ） |
| `device_flow_expired` | デバイスフローのコードの期限が切れた |
| `device_flow_denied` | 利用者が GitHub の画面で断った |
| `encryption_unavailable` | OS の安全な保管場所が使えず、トークンを保存できない（平文では置かない。N-05） |
| `not_supported` | その OS ではできない（Windows でのアプリケーションフォルダへの移動など） |
| `internal` | 上のどれでもない。ログを見る |

---

## 5. 契約の確かめ方（test-strategy.md）

- 型: 画面・preload・メインが同じ `src/shared/ipc-contract.ts` から型を取る（TypeScript の strict）
- 実行時: メインの受け口は引数を zod で検査する。契約のテストで、2. のすべてのチャンネルに受け口があること、不正な引数を断ること、戻り値と 3. の中身がスキーマに合うことを確かめる
