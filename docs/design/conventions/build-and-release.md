# ビルドと配布（build-and-release.md）

- 作成: 2026-11-26（⑪ 規約設計）
- 入力: ADR-005・008・014、[test-strategy.md](../quality/test-strategy.md) 3.、[security-rules.md](security-rules.md)、requirements.md F-29〜F-31・C-03・C-07、[試作の記録](../review/spike-unsigned-electron-mac.md)
- 状態: 技術者が確認済み（2026-11-26）。Mac は両対応の1つ（ADR-014）、Hardened Runtime は入れたまま（2.）を技術者が決めた。「AI案」と書いた項目も技術者がこの内容で確認した

---

## 1. 名前と識別子

| 項目 | 値 | メモ |
| --- | --- | --- |
| アプリの名前 | `github-inbox` | D-027 |
| 配布用のリポジトリ | `zonbitamago/github-inbox`（個人の public リポジトリ。ADR-005） | 技術者が ⑬ で決めた（github-prs と同じアカウント。build-plan.md 1.） |
| ライセンス | MIT（`LICENSE`。著作権者は `zonbitamago`。本名を出さないため） | 技術者が ⑬ で決めた（使う部品が MIT で揃い、決めることが一番少ない。2026-11-26） |
| アプリの識別子（appId） | `io.github.zonbitamago.github-inbox` | **最初に配った後は変えない**。変えると、キーチェーンの項目・Windows のデスクトップ通知の登録・自動起動の登録が引き継がれない |
| 版 | `package.json` の `version`（SemVer）。タグは `v1.2.3` | 新しい版の確認（F-31）はタグと比べる |

---

## 2. electron-builder の設定（素案）

```yaml
appId: io.github.zonbitamago.github-inbox
productName: github-inbox
directories:
  output: dist
files:
  - out/**            # electron-vite の出力
asar: true

mac:
  target:
    - target: dmg
      arch: [universal]   # Apple Silicon と Intel の両対応の1つ（ADR-014）
  identity: "-"           # ad-hoc 署名（C-03。Apple Silicon で動かすのに要る）
  hardenedRuntime: true   # 入れる（下の注）。許可（entitlements）は electron-builder の既定のもの
  category: public.app-category.developer-tools
dmg:
  # 本アプリとアプリケーションフォルダへのショートカットを並べる（F-29、AC-43）
  contents:
    - { x: 130, y: 200 }
    - { x: 410, y: 200, type: link, path: /Applications }

win:
  target:
    - target: nsis
      arch: [x64]
nsis:
  oneClick: true
  perMachine: false        # 利用者ごとに入れる（管理者の権限が要らない。ADR-008）
  allowElevation: false
  createStartMenuShortcut: true   # Windows のデスクトップ通知に要る（ADR-008）
  createDesktopShortcut: false

publish:
  provider: github
  releaseType: draft
```

- **Hardened Runtime は入れたままにする**（2026-11-26 技術者が決めた）
  - Hardened Runtime は、Mac が動いているアプリを外からいじられないようにする保護。外から部品を差し込む・別の開発元の部品を読み込む・デバッガでのぞくといったことを止める。本アプリでは、すでに PC に入り込んだプログラムが本アプリに部品を差し込み、キーチェーンの鍵を引き出してトークンを読む道を塞ぐ（security-rules.md S-18、Q-10）
  - 公証（notarization）はしないが、上の保護のために入れる。試作もこの状態で確かめた（デスクトップ通知・キーチェーン・自動起動が動いた）
  - ad-hoc 署名との組み合わせで「起動に失敗しうる」という警告がビルド時に出る（試作の記録 4. の7、ADR-003）。試作では起動できたが、確かめたのは Apple Silicon の macOS 26 だけ。⑭ で配布物と同じ設定のビルドの起動を確かめ、起動しない環境が見つかったら、切るか許可を足すかを技術者が改めて決める
  - 許可（entitlements）を足すときは、技術者に聞く。`allow-dyld-environment-variables`（外から部品を差し込める環境変数を許す）は足さない
- Windows は x64 だけ（Q-13）。arm64 の Windows の利用者が出たら足す
- 署名はしない（C-03、W-08）。初回の Gatekeeper と SmartScreen の警告は Releases の説明で案内する（5.）

---

## 3. GitHub Actions

| ワークフロー | いつ | ランナー | 中身 |
| --- | --- | --- | --- |
| `ci.yml` | push・PR | ubuntu | `npm ci` → lint → 型検査 → 単体・結合・契約のテスト（網羅の測定を含む）→ `npm audit --audit-level=high` |
| `ci.yml`（E2E） | `main` への push | macOS | 配布物と同じ設定でビルドし、Playwright で E2E（test-strategy.md 3.） |
| `release.yml` | `v*` のタグの push | macOS・Windows | 各 OS で `electron-builder --publish always` を動かし、下書きの Release に配布物を置く。`GITHUB_TOKEN` だけを使い、このジョブだけ `contents: write` |
| Dependabot | 週1回 | — | npm と GitHub Actions（S-11） |

- Action はコミットの SHA で固定する。既定の `permissions` は `contents: read`（S-12）
- Release は下書きで作られる。技術者が説明（5.）を入れて、公開前の見直し（security-rules.md 2.）をしてから公開する

---

## 4. リリースの手順

1. `main` の CI が通っている
2. `package.json` の版を上げ、`v1.2.3` のタグを付けて push する（技術者が行う）
3. `release.yml` が Mac 用（DMG）と Windows 用（インストーラー）を作り、下書きの Release に置く
4. 下書きに 5. の説明と変更点を書く。公開前の見直しをする
5. 公開する。立ち上がっているアプリは、24時間以内に新しい版を知らせる（F-31）
6. 初めての版、Mac の版を上げたときの確認（キーチェーンの案内。F-36 (5)）、Windows で初めて配るときは、手動のチェックリストを通す（test-strategy.md 2.）

---

## 5. Releases の説明の素案（F-30）

```markdown
## 対応する OS
- macOS 13（Ventura）以降（Apple Silicon・Intel）
- Windows 10・11（64bit）

## 入れ方
- Mac: `github-inbox-<版>-universal.dmg` を開き、github-inbox をアプリケーションフォルダにドラッグします
- Windows: `github-inbox-Setup-<版>.exe` を開きます（管理者の権限は要りません）

## 初めて開くとき（署名していないため、OS の警告が出ます）
- Mac: 「開けません」という警告で「完了」を押し、システム設定の「プライバシーとセキュリティ」で「このまま開く」を押します
- Windows: 「Windows によって PC が保護されました」で「詳細情報」→「実行」を押します

その後は、アプリの案内に沿って進めてください。

## 版を上げたとき（Mac）
- 開くとキーチェーンの確認が1回出ます。「常に許可」を押してください（アプリも事前に案内します）
```

- 「常に許可」か「許可」かは ⑭ で確かめて決める（DR-06）。依頼者が文言を確かめる（⑮ の前）。詳しい手順書（F-37、S）は、この説明とアプリの案内で足りない人のためのもので、作るなら `docs/` ではなく Release か README に置く（AI案）

---

## 6. 未定

| 項目 | 状態 |
| --- | --- |
| 配布用のリポジトリの持ち主のアカウント（appId に入る） | 決めた（⑬）: `zonbitamago`（1.） |
| アプリのアイコン | 未定（依頼者が ⑭ までに決める。決まるまでは Electron の既定のアイコン） |
| OAuth App の登録（auth-flow.md 1.） | 未定（依頼者が ⑬ で登録し、client ID を技術者に渡す。S2 認証の前。build-plan.md 5.） |
