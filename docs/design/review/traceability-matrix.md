# 要件・設計・テストの対応表（traceability-matrix.md）

- 作成: 2026-11-26（⑫ 設計検証）
- 入力: [requirements.md](../../requirements/requirements.md)、[acceptance.md](../../requirements/acceptance.md)、`docs/design/` の全成果物
- 状態: AI が下書きし、技術者が確認済み（2026-11-26）。設計レビューの対応（DR-01）を反映した

要件（F・N・C）ごとに、設計のどこに反映したか、どの受け入れ条件（AC・NF）とテストの層で確かめるかを並べる。漏れ（設計やテストが無い）と過剰（要件に根拠が無い設計）を見つけるための表。

テストの層の略: **単体**（`src/main/core` など）／**結合M**（メインの結合。模擬の GitHub）／**結合R**（画面の結合）／**契約**（IPC）／**E2E**／**手動**（OS との結合のチェックリスト）／**実データ**（依頼者のアカウント）／**UAT**（受け入れ判定）

状態: **○** 設計とテストがある／**△** あるが要確認が残る（リスク登録簿へ）／**×** 漏れ／**—** C（あれば）で今回は設計しない

---

## 1. 機能（F）

| ID | 優先 | 設計 | 受け入れ条件 | テストの層 | 状態 |
| --- | --- | --- | --- | --- | --- |
| F-01 | M | ADR-002・010、domain-model 4.1（M-0〜M-9）、component-backend 5.2、github-api 2.〜4. | AC-01〜06・08・37、NF-02 | 単体・結合M・実データ | △ チームへのメンション（AC-37）は `/user/teams` が `repo` スコープで読めるか未確認（R-03） |
| F-02 | M | domain-model 4.1 M-8・4.2 | AC-07 | 単体・結合M・実データ | △ 参加中の判定の材料が代わりのもの（R-04） |
| F-03 | S | domain-model 4.1 M-2、4.3（検索 B） | AC-17 | 単体・結合M | △ チームの名前を読まずにスレッドの理由で代える（R-03） |
| F-04 | C | — | — | — | — |
| F-05 | M | domain-model 4.1、github-api 4. | AC-04 | 単体・結合M・実データ | △ `ci_activity` の形を未確認（R-05） |
| F-06 | M | ADR-006、domain-model 5.、component-backend 5.1 | AC-12 | 結合M・E2E | ○ |
| F-07 | M | component-backend 5.4（notify）、domain-model 4.4 | AC-01・02・05・06 | 単体（デスクトップ通知の要否）・手動 | ○ |
| F-08 | M | component-backend 5.4、ipc-contract 3.（`ui:focusEvent`）、component-frontend 5. | AC-11 | 手動 | ○ |
| F-09 | M | domain-model 2.（Settings）・4.4、component-frontend 2.1（SettingsPage） | AC-09・10 | 単体・結合R | ○ |
| F-10 | C | — | — | — | — |
| F-11 | M | component-frontend 2.2（event-list） | AC-01 | 結合R・E2E | ○ |
| F-12 | M | ipc-contract 2.（`shell:openGitHub`）、security-rules S-06 | AC-15 | 単体（URL の検査）・結合R | ○ |
| F-13 | M | component-frontend 2.2（`filterEvents`） | AC-16 | 単体・結合R | ○ |
| F-14 | M | domain-model 4.3、github-api 5. | AC-17・18、NF-02 | 単体・結合M・結合R・実データ | ○ |
| F-15 | M | ADR-010、github-api 5.、component-backend 5.3 | AC-18、NF-02 | 結合M・結合R・E2E | ○ |
| F-16 | S | domain-model 2.（`prPeriodDays`） | AC-19 | 結合R | ○ |
| F-17 | M | ipc-contract 2.（`shell:openGitHub`） | AC-21 | 結合R | ○ |
| F-18 | M | component-frontend 2.2（`filterPrs`。「自分待ちの理由あり」を含む） | AC-22 | 単体・結合R | ○ |
| F-20 | M | ipc-contract 2.（`prs:reload`）、component-backend 5.3 | AC-20、NF-03 | 結合R・E2E・実データ（Q-02） | ○ |
| F-22 | C | — | — | — | — |
| F-23 | M | ADR-003、component-backend 8. | AC-23・24 | 手動 | △ Windows は未確認（R-01） |
| F-24 | M | component-backend 8.（`window-all-closed` で終了） | AC-26 | 手動 | ○ |
| F-25 | S | component-backend 8.（login-item）、domain-model 2. の注 | AC-27 | 手動 | △ Windows は未確認（R-01） |
| F-26 | S | component-frontend 5.（i18n） | AC-28 | 結合R | ○ |
| F-27 | M | ADR-004、auth-flow 1.〜4. | AC-29、NF-09 | 結合R・E2E・手動 | △ Organization の OAuth App のアクセス制限（R-02） |
| F-28 | S | auth-flow 6. | AC-30 | 結合M・結合R | ○ |
| F-29 | M | ADR-008・014、build-and-release 2. | AC-29・43 | 手動 | ○（AC-43 の確かめ方を DR-01 で足した） |
| F-30 | M | build-and-release 5. | AC-29 | 手動（依頼者が文言を確かめる） | ○ |
| F-31 | S | component-backend（update-check）、github-api 6. | AC-31 | 結合M・結合R | ○ |
| F-32 | S | domain-model 2.（`eventDays`）・5.、ipc-contract 3.（`events:reset`） | AC-34 | 結合M・結合R | ○ |
| F-33 | S | component-frontend 2.1・5.（`layout`） | AC-35 | 結合R | ○ |
| F-34 | M | ipc-contract 2.（`clipboard:copyLinks`）、component-frontend 5. | AC-36 | 結合R・E2E | ○ |
| F-35 | S | design-system 2.（ライト・ダーク） | AC-39 | 手動 | ○ |
| F-36 | M | component-frontend 3.、auth-flow 4.、component-backend 8. | AC-29・41・42 | 結合R・E2E・手動 | △ アプリケーションフォルダへの移動（R-07）、キーチェーンの確認が出る時点（R-06） |
| F-37 | S | build-and-release 5.（作るなら Release か README） | — | — | ○（受け入れ条件は無い。S） |

---

## 2. 非機能（N）

| ID | 優先 | 設計 | 受け入れ条件・目標 | テストの層 | 状態 |
| --- | --- | --- | --- | --- | --- |
| N-01 | M | component-backend 6.1、domain-model 4.4、Q-01 | AC-01、NF-01 | 単体（偽の時計）・実データ | ○ |
| N-02 | M | ADR-003・014、build-and-release 2. | NF-06、Q-13 | 手動 | △ Windows は未確認（R-01） |
| N-03 | M | component-backend 6.1（問い合わせのときだけ動く） | NF-04、Q-05 | 手動（8時間） | ○ |
| N-04 | M | ADR-010、component-backend 6.、github-api 7. | NF-05、Q-04 | 結合M（回数を数える）・実データ | ○ |
| N-05 | M | ADR-004・007、auth-flow 4.、security-rules S-01・S-18 | AC-32、NF-07、Q-10 | 単体・手動 | ○ |
| N-06 | M | ADR-002、github-api 1.、security-rules S-02・S-07 | AC-33、NF-07 | テスト（書き込みの検査）・コードレビュー | ○ |
| N-07 | S | component-backend 6.1（スリープからの復帰）・6.3 | AC-13 | 結合M | ○ |
| N-08 | M | domain-model 6.（`IngestState`）、component-backend 6.3、component-frontend 2.2（status） | AC-14、NF-08、Q-06 | 結合M・E2E | ○ |
| N-09 | M | component-backend 5.4、domain-model 6.（`DesktopNotificationFailure`） | AC-38、Q-07 | 手動 | ○ |
| N-10 | M | ADR-009、component-backend 7.、security-rules S-15 | AC-40、Q-09 | 結合M | ○ |

---

## 3. 制約（C）

| ID | 設計 | 確かめ方 | 状態 |
| --- | --- | --- | --- |
| C-01 | github-api 1.（つなぎ先を `api.github.com` と `github.com` に固定） | コードレビュー | ○ |
| C-02 | ADR-004、auth-flow 7. | ⑬ で OAuth App を登録したときに確かめる | △ R-02 |
| C-03 | build-and-release 2.（ad-hoc 署名）・5.（初回の警告の案内） | 手動 | ○ |
| C-04 | component-backend 8.（窓1つ。トレイ・メニューバーのアイコンを作らない） | AC-25・手動 | ○ |
| C-05 | ADR-001 | — | ○ |
| C-06 | ADR-002、component-frontend 3.（GitHub の通知設定の案内） | AC-29 | ○ |
| C-07 | ADR-014、build-and-release 2.・5. | NF-06・手動 | △ Windows は未確認（R-01） |

---

## 4. 受け入れ条件から見た確かめ方

test-strategy.md 4. の表と突き合わせた結果。

| 受け入れ条件 | test-strategy.md 4. にあるか |
| --- | --- |
| AC-01〜42 | ある |
| AC-43（DMG のドラッグ＆ドロップ。D-025 で追加） | ⑫ の時点では無かった。DR-01 で足した |
| NF-01〜09 | ある（non-functional.md の Q-01〜17 の測り方に従う） |

また、test-strategy.md 2. の「受け入れ（UAT）」の行が「AC-01〜40」のままだった。DR-01 で「AC-01〜43」にした。

---

## 5. 過剰（要件に直接の根拠が無い設計）

いずれも要件を支えるための AI案で、⑩・⑪ で技術者が確認した。要件を広げるものではないため、過剰として外すものは無い。

| 設計 | 支える要件 | 場所 |
| --- | --- | --- |
| サインアウトで出来事も消す | F-28、W-10 | auth-flow 6. |
| サインアウトの画面から GitHub 側の取り消しのページを開ける | F-28、N-05 | auth-flow 6. |
| 設定から「使い始めの案内をもう一度」 | F-36 | component-frontend 2.1・3. |
| キーボードの割り当て（Cmd+R など） | F-20・F-13 | component-frontend 5. |
| スリープから戻ったらすぐ問い合わせる | N-01・N-07 | component-backend 6.1 |
| 二重に立ち上げない | F-23・F-25 | component-backend 8. |
| デスクトップ通知を出すのは発生から10分以内 | F-06・N-07（依頼者が確認。D-026） | domain-model 4.4 |

---

## 6. 要件から設計への写しで値が変わったもの

| 要件 | 設計 | 扱い |
| --- | --- | --- |
| N-04（利用制限） | Q-04 の目安を REST と GraphQL の両方に当てはめた（ADR-010） | 技術者が確認済み |
| F-29（Mac の DMG） | 両対応の1つ（universal）に決めた（ADR-014） | 技術者が確認済み |

---

## 7. 見つけた漏れ（design-review.md で扱う）

| # | 内容 |
| --- | --- |
| T-1 | test-strategy.md 4. に AC-43 が無い。2. の UAT の行が「AC-01〜40」のまま（AC-41〜43 は ⑨ の D-024・D-025 で追加）→ 設計レビューの DR-01 と同じ。DR-01 で直した |
