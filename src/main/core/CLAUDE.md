# src/main/core/ の決まり

出来事の分解・種類の判定・参加中の判定・自分待ちの理由・デスクトップ通知を出すか・URL の検査を置く場所（ADR-011）。全機能が頼る判定と、核の不変条件のうち判定に関わるもの（domain-model.md 7. の I-2・I-3・I-6・I-8 と I-1 の分解の側）を守る場所で、⑬ で最初に固める範囲（barrier）。

**2026-11-26 に凍結した**（build-plan.md 6.4）。変えたくなったら実装を止め、変更要求（`docs/build/change-requests/CR-NNN.md`）を起票する（build-plan.md 6.2）。

## 守ること

- **I/O を持たない**。ネットワーク・ファイル・時計（`Date.now()`・`new Date()` の引数なし）・Electron・`process` に触れない。今の時刻は引数 `now` で受け取る
- import してよいのは `src/shared/` と、このフォルダの中だけ（ESLint でも止める）
- 例外を投げない。想定内のことは値で返す
- 規則は `docs/design/components/domain-model.md` 4. の番号（4.1 の M-0〜M-9、4.2 の PT-1〜3、4.3 の WR-0〜5、4.4 の DN-1〜4）と1対1にし、コメントに番号を書く

## 変えるとき

- **先に domain-model.md を直し、技術者の確認を得てから**コードを直す
- 利用者に見える振る舞い（どの種類で出すか、デスクトップ通知を出すか）が変わるときは、依頼者の確認も要る。決めたことは `docs/requirements/decisions.md` に残す（D-026 の例）
- business-data.md・domain-model.md 6. に無い区分値を作らない

## テスト

- **先にテストを書く**。規則ごとに表の形（`it.each`）で、境目を入れる（test-conventions.md 4.1）
- 分岐の網羅は 100%
- テストのデータは `test/fixtures/github/` の記録した応答（架空のデータに置き換えたもの）。推測で応答を作らない
- 記録した応答は `test/support/github-fixtures.ts` から取り出す（テストからは `test/fixtures`・`test/support` を import してよい。ESLint もそう設定してある）。記録に無い場面は、記録した応答をその場で書き換え、テストの名前に「書き換えた応答」と書く（test-conventions.md 3.）

## 置いてあるもの（⑬ B3）

- `github-shapes.ts`: 判定の材料の形。`src/main/github/` が zod で検査し、ページをたどった分を `nodes` につなげてから渡す
- `constants.ts`: メインプロセスの数値の決まり（重なり5分・デスクトップ通知の10分・抜粋の長さなど）。数を足すときもここに置く
- `expand-thread.ts`: M-0〜M-9。M-9 は2段で、`expandThread` が `needsMentionFallback` を返し、取り込みの側が最新のコメントを読んで `mentionFallbackEvent` に渡す（CR-004）
- CI の結果の分解（`ci_activity`）はまだ無い。本リポジトリの CI の実行を記録してから、テストを先に書いて足す（build-plan.md 5. の 0-7）
