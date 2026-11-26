# 設計レビュー（design-review.md）

- 作成: 2026-11-26（⑫ 設計検証）
- 状態: 作業に関わっていない AI が下書きし、作業した AI が根拠を照合した（20件とも根拠どおり）。2026-11-26 に技術者が対応を決め、**手戻りタグは下書きのとおり確定**した。対応は末尾の「対応の記録」。2026-11-26 に技術者が**実装フェーズに進めてよい**と判定した（末尾の「判定」）
- 進め方: 設計フレーム v0.4「3.6 ⑫ 設計検証」の4観点。手戻りタグは振り返り・計測フレーム v0.1 の 3.2・3.3 に沿う
- 入力にしたファイル
  - 要件定義: `docs/requirements/` の intent.md・business-flow.md・business-data.md・requirements.md・acceptance.md・decisions.md・summary.md・hearing-memo.md（mockup/ は見ていない）
  - 設計: `docs/design/` の architecture/（context-overview.md・context-diagram.mmd・container-overview.md・container-diagram.mmd）、adr/（README.md・ADR-001〜014）、quality/（non-functional.md・quality-coverage.md・test-strategy.md）、components/（domain-model.md・component-backend.md・component-frontend.md）、api-contract/（github-api.md・ipc-contract.md・auth-flow.md）、conventions/（coding-standards.md・test-conventions.md・security-rules.md・design-system.md・build-and-release.md）、review/spike-unsigned-electron-mac.md
  - AI への指示書: AGENTS.md、CLAUDE.md、src/main/core/CLAUDE.md、src/shared/CLAUDE.md
- 読んでいないもの: 同じ ⑫ で並行して作られている traceability-matrix.md・risk-register.md（判断が引きずられないように）

重さの意味: **要対応**＝実装（⑬）に入る前に直すべき／**確認**＝人の判断が要る／**軽微**＝表記や文書の書き足しで済む。

---

## 観点1 追跡性（要件 → 設計 → テスト）

### 確かめたこと

- **やること（F）**: M と S の項目は、すべて設計のどこかに受け皿がある。主な対応は component-backend.md 10.、component-frontend.md 2.、build-and-release.md（F-29・F-30）。C の F-04・F-10・F-22 は設計していない（requirements.md の「入れるときに追加」のとおり。F-04 は domain-model.md 4.1 に足し方の一言がある）
- **非機能（N）**: N-01〜N-10 は non-functional.md の Q-01〜Q-15 に数値か方針として落ちている。N-02（Windows）は Q-13 で「配る前に確かめる」とし、確かめていないことは D-021 で承知済み
- **制約（C）**: C-01（全リポジトリ）は GitHub の通知 API の `all=true` と検索 `involves:@me`、C-02 は ADR-001・ADR-004、C-03 は build-and-release.md 2.、C-04 は container-overview.md 2.、C-05 は ADR-001、C-06 は ADR-002、C-07 は Q-13・build-and-release.md 5. に反映されている。ただし C-02 には DR-08 の食い違いがある
- **やらないこと（W）**: 設計に W の機能が入り込んでいないことを確かめた（W-01 は既読を付けない GET だけ、W-07 は S-17、W-12 は手動のリロードだけ、W-13 はアイコンの数を出す部品が無い）
- **受け入れ条件（AC・NF）**: test-strategy.md 4. の対応表で、AC-01〜AC-42 は確かめ方が決まっている。AC-43 と NF-09 などに抜けがある（DR-01）。成功の合図 S1 の確かめ方に要る記録が設計に無い（DR-02）
- **過剰（要件に根拠が無い設計）**: ログ（Q-15。context-overview.md 5.「障害の調べ方は ⑨ で扱う」が根拠）、スリープからの復帰でのすぐの問い合わせ（N-01 を守るため）、サインアウトで出来事も消す（N-05 の補強。D-026 で技術者が確認）、二重の立ち上げを防ぐ（F-24 の窓1つの前提）は、根拠があると判断した。根拠が見当たらないものは DR-03 にまとめた

### 見つけたこと

#### DR-01 テスト戦略の受け入れ条件の対応が、後から足した AC に追いついていない

- 内容: test-strategy.md 4. の対応表に AC-43（DMG をドラッグ＆ドロップで入れる）が無い。2. の「受け入れ（UAT）」は「AC-01〜40 を依頼者が確かめる」のままで、AC-41〜43 が入っていない。4. は「NF-01〜09 は Q-01〜17 の測り方に従う」とするが、NF-09（10人前後がそれぞれのアカウントで使える）に当たる Q が無い。NF-02 のうち「出来事が30日で数百件でもスクロールで遅くならない」に当たる Q も無く、component-frontend.md 5.「⑭ で架空の2,000件で試す」にだけある
- 根拠: test-strategy.md 2.（受け入れの行）・4.、acceptance.md AC-41〜43（D-024・D-025 で追加）・NF-02・NF-09、non-functional.md 3.、component-frontend.md 5.「件数」
- 重さ: 軽微
- 対応案:
  1. test-strategy.md 2. を「AC-01〜43」にし、4. に「AC-43 → 手動（Mac。DMG を開いて確かめる）」を足す。NF-09 は「Q-14 と、2人目のアカウントでの手動の確認」、出来事の量は「⑭ の架空2,000件の確認」を対応先として書く
  2. ⑬ の構築計画（build-plan.md）を作る前に直す
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑨ / AI推測=なし / 検知=AI`（根拠: AC-41〜43 は ⑨ の D-024・D-025 で足したが、同じ ⑨ の test-strategy.md を直さなかった）

#### DR-02 成功の合図 S1 の確かめ方に要る「デスクトップ通知を出した時刻」の記録が、設計に無い

- 内容: acceptance.md 3. と Q-01 は「GitHub 上の発生時刻と、デスクトップ通知が出た時刻を比べる」としている。しかしログに書くもの（Q-15・security-rules.md S-09・component-backend.md 4.）は、問い合わせの結果・エラー・利用制限の残り・デスクトップ通知の**失敗**だけで、出した時刻は書かない。保存する出来事には `occurredAt`（発生）と `receivedAt`（受け取り）があるので近い値は取れるが、「実際にデスクトップ通知を出したか（設定でオフ・bot・10分を過ぎたものを除く）」は分からない。事後確認で依頼者が何を見ればよいかが決まっていない
- 根拠: acceptance.md 3.（S1）、non-functional.md Q-01（測り方）・Q-15、security-rules.md S-09、component-backend.md 4.（log）、domain-model.md 2.（`GitHubEvent.receivedAt`）
- 重さ: 確認
- 対応案:
  1. ログに「デスクトップ通知を出した（出来事の id・種類・発生時刻・出した時刻）」を足す。本文やタイトルは書かないので S-09 とも合う
  2. ログは足さず、「`events.json` の `receivedAt` を、デスクトップ通知を出した時刻とみなす（差は Q-01 の30秒以内）」と Q-01 の測り方に書く。この場合、出したかどうかは依頼者が画面で覚えておく
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑨ / AI推測=なし / 検知=AI`（根拠: 測り方を決める Q-01 と、ログの中身を決める Q-15 がどちらも ⑨ で、つなぎが書かれていない）

#### DR-03 要件に根拠が見当たらない追加と、設計していない C の項目の記載

- 内容: (1) キーボードの割り当て（Cmd+R で PR の一覧のリロード、Cmd+F で検索欄、Cmd+, で設定）は AI案で、要件・受け入れ条件に無い。技術者は確認しているが（component-frontend.md の状態欄）、利用者に見える振る舞いなのに依頼者の確認の記録が無い。(2) container-overview.md 2. の画面の「主な要件」に F-22（C。PR のリンクを1件ずつコピー）があるが、設計はしていない
- 根拠: component-frontend.md 5.「キーボード」、component-backend.md 8.「メニュー」、decisions.md D-026（技術者が確認した AI案の例に、キーボードの割り当ては無い）、container-overview.md 2.、requirements.md F-22
- 重さ: 軽微
- 対応案:
  1. キーボードの割り当ては残し、⑮ の受け入れで依頼者に見せて、要らなければ外す。残すなら decisions.md に一言残す
  2. container-overview.md 2. から F-22 を外すか「（C。入れるときに設計する）」と書く
- 手戻りタグ: タグなし（要件に無い追加を残すかどうかの判断と、表の書き直しだけで、前工程の成果物を直す手戻りには当たらない）

---

## 観点2 設計内部の整合性

### 確かめたこと

- **ADR 同士**: 出来事の取り込み（ADR-001 → 002 → 010）、作りと配布（ADR-003 → 005 → 008 → 014）、トークン（ADR-004 ↔ 007）、保存（ADR-006 → 009）、部品の分け方と AI への指示（ADR-011 ↔ 012 ↔ 013）に矛盾は見つからなかった。ADR-002 の「PR の一覧は検索 API で取る」と ADR-010 の「GraphQL の検索3本」は、どちらも検索なので食い違いではないと判断した
- **区分値と言葉**: domain-model.md 2. の型（`EventType`・`ReviewResult`・`PullRequestState`・`WaitingReason`）は business-data.md 2.1〜2.5 のコードと一致している。設計で足した区分値は domain-model.md 6. にまとまり、技術者の確認済み。「デスクトップ通知」と「GitHub の通知」は coding-standards.md 3. で名前まで分けている
- **数値目標が部品の設計で実現できそうか**
  - Q-01（5分以内）: 60秒ごとの問い合わせ（component-backend.md 6.1）＋変化から30秒以内で、余裕がある。ただし利用制限が少ないときの間隔に DR-10
  - Q-02（PR の一覧5秒・30日10秒）: 測った値（github-api.md 5.。3本それぞれ1〜2秒）から、同時に投げれば収まる見込み
  - Q-03（保存済みの出来事を3秒以内）: 立ち上げの順番と合わない（DR-05）
  - Q-04（利用制限）: github-api.md 7. の見積もり（REST 約75回／時、GraphQL 約200点／時）は目安の300以内
  - Q-06（受け取れないことを約2分で出す）: component-backend.md 6.3（続けて2回）と合う。ただしデスクトップ通知の扱いに DR-04
  - Q-08（取りこぼさない・重複させない）: id の決め方（domain-model.md 3.）と取り込みの記録（5.）で重複は防げる。取りこぼしの面で DR-09
  - Q-09〜Q-11（保存・トークン・画面の安全）: component-backend.md 7.・8.、auth-flow.md 4.、security-rules.md S-01〜S-06 に落ちている
- **Windows を確かめていないこと**は D-021 で承知済みで、⑫ のリスク登録簿に入る予定のため、ここでは新しい指摘にしていない

### 見つけたこと

#### DR-04 受け取れなかった間の出来事に、デスクトップ通知を出すかが Q-06 と domain-model.md 4.4 で食い違う

- 内容: Q-06 は「戻ったら…受け取れなかった間の出来事を一覧に載せる（デスクトップ通知は出さない）」とする。domain-model.md 4.4 の 2 は「発生から10分以内なら出す。1〜2回の失敗ですぐ戻った場合は、その間の出来事にも出せる」とし、根拠に Q-06 を挙げている。たとえば5分つながらず、画面に `offline` を出した後に戻った場合、Q-06 では出さず、4.4 では出す。4.4 は依頼者が D-026 で認めた決まりだが、Q-06 が直っていない。どちらに合わせてテストを書くかで、⑬ で最初に固める判定（barrier）のテストが割れる
- 根拠: non-functional.md Q-06（判断の列は AI案）、domain-model.md 4.4 の 2・9. の 3、decisions.md D-026 の 3、quality-coverage.md「障害許容性」の行
- 重さ: **要対応**
- 対応案:
  1. Q-06 を D-026 に合わせて「受け取れなかった間の出来事は一覧に載せる。デスクトップ通知は domain-model.md 4.4 の決まり（発生から10分以内）に従う」と直す（推し: 依頼者が確認した新しい決まりに寄せる）
  2. 「受け取れなかった間は一律に出さない」に戻すなら、依頼者に聞き直し、D-026 と domain-model.md 4.4 を直す
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑨ / AI推測=あり / 検知=AI`（根拠: ⑨ の Q-06 が、要件（N-07・AC-13）で決まっていない「デスクトップ通知を出すか」を AI案で「出さない」と埋め、⑩.1 で決まりを変えたときに直されなかった）

#### DR-05 立ち上げの順番が、Q-03（3秒以内）と「切れていても保存済みの出来事を出せる」（ADR-006）に合わない

- 内容: component-backend.md 5.1 では、保存済みの出来事を画面に出すのが、トークンの復号と `GET /user`（ネットワーク）の**後**になっている。立ち上げたときにネットワークが切れていると、`GET /user` の時間切れ（30秒）を待つことになり、Q-03 の3秒を守れない。さらに、`GET /user` が失敗したときに保存済みの出来事を出すのか、どの状態（`offline` など）にするのかが書かれていない。domain-model.md 1. は「利用者のユーザー名は立ち上げのたびに GitHub に聞く」とし、手元に残さないため、オフラインではユーザー名が分からない。AI が実装するときに推測で埋める所になる
- 根拠: component-backend.md 5.1（シーケンス図の順番）、non-functional.md Q-03、ADR-006「結果」（ネットワークが切れても保存済みの出来事は一覧に出せる）、domain-model.md 1.（認証の行）、component-backend.md 6.3
- 重さ: **要対応**
- 対応案:
  1. 5.1 の順番を「設定を読む → `events.json` を読んで保存済みの出来事を出す → トークンを読む → `GET /user`」に変え、`GET /user` がつながらないときは `ingest.state = 'offline'` にして、6.1 の間隔で再び試す、と書く
  2. 1 に加えて、ユーザー名を `settings.json` に残し、オフラインで立ち上げたときも使えるようにする（自分の操作を除く判定 M-0 に要る）。この場合は domain-model.md 1.・2. の `Settings` を直す
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑩.2 / AI推測=なし / 検知=AI`（根拠: 立ち上げの流れを決めた component-backend.md 5.1 で、Q-03 と ADR-006 の前提を突き合わせていない）

#### DR-06 キーチェーンの確認で押すボタンが、要件は「許可」、設計は「常に許可」

- 内容: requirements.md F-36 (5)、acceptance.md AC-42、decisions.md D-022、ADR-004 は「許可」を押すよう案内するとしている。一方、auth-flow.md 4.、component-frontend.md 2.1（`KeychainNoticePage`）、build-and-release.md 5.（Releases の説明の素案）は「常に許可」としている。試作で確かめたのは「許可すると読み出せた」ことだけで、「許可」だけだと次の立ち上げでまた確認が出るのか、「常に許可」が要るのかは確かめていない。画面とリリースの説明の文言は利用者がそのまま読むため、どちらかに揃える必要がある
- 根拠: spike-unsigned-electron-mac.md 3. の 6、requirements.md F-36 (5)、acceptance.md AC-42、decisions.md D-022 の 1・3、ADR-004「結果」、auth-flow.md 4. の 2、component-frontend.md 2.1、build-and-release.md 5.
- 重さ: 確認
- 対応案:
  1. ⑭ でキーチェーンの確認が出る時点を手で確かめるとき（auth-flow.md 7.、component-backend.md 11.）に、「許可」と「常に許可」で次の立ち上げの振る舞いがどう違うかも確かめ、結果に合わせて要件と設計の文言を揃える。要件の文言を変えるなら依頼者に知らせ、decisions.md に残す
  2. それまでは「（⑭ で確かめて決める）」と設計側に書き、AI が文言を推測で固めないようにする
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑧(副 ⑩.3) / AI推測=あり / 検知=AI`（根拠: ⑧ の試作でボタンの違いを確かめていれば防げた。⑩.3 の auth-flow.md で試作の記録に無い「常に許可」が出典なしに入っている。AI推測を「あり」としたのは出典が見当たらないためで、**要確認**）

#### DR-07 Mac で管理者の権限が無い利用者と、アプリケーションフォルダの判定

- 内容: ADR-008 は「会社の PC では管理者の権限が無い利用者もいる可能性がある」として、Windows は利用者ごとのインストーラーにしたが、Mac は考えていない。DMG のショートカットは `/Applications`（PC 全体のアプリケーションフォルダ）を指す。Mac では一般に、管理者でない利用者が `/Applications` に入れるときは管理者の名前とパスワードを求められる（**要確認**）。また、試作でデスクトップ通知が出たのは `~/Applications`（利用者ごとのアプリケーションフォルダ）に置いたときで、`/Applications` では確かめていない。初回の案内は `app.isInApplicationsFolder()` で「アプリケーションフォルダの外か」を判定するが、これが `~/Applications` を「中」と見なすかも確かめていない（**要確認**）。見なさない場合、`~/Applications` に入れた人には、デスクトップ通知が出るのに移動を勧め続け、失敗の理由も `outside_applications_folder` と取り違える
- 根拠: ADR-008「コンテキスト」・「決定」、build-and-release.md 2.（`dmg.contents` の `/Applications`）、spike-unsigned-electron-mac.md 3. の 1、component-frontend.md 3. の 1、component-backend.md 5.4・8.（「⑭ で手動で確かめる」は DMG の中から動かせるかだけ）
- 重さ: 確認
- 対応案:
  1. チームの Mac の利用者が管理者の権限を持っているかを依頼者に確かめる。持たない人がいるなら、`~/Applications` に入れる案内（Releases の説明と初回の案内）を足し、ADR-008 の「結果」に書く
  2. ⑭ の手動の確認に「`/Applications` と `~/Applications` のそれぞれで、デスクトップ通知が出るか・`isInApplicationsFolder()` が何を返すか」を足す。`~/Applications` を「外」と判定するなら、判定を自前で補う
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑨(副 ⑧) / AI推測=なし / 検知=AI`（根拠: ⑨ の ADR-008 が管理者の権限の論点を Windows だけで扱った。⑧ の試作は `~/Applications` だけで確かめた）

#### DR-08 Organization の承認が要らないことを、要件は「確認済み」、設計は「要確認」としている

- 内容: business-flow.md 1. と intent.md 8. は「外部のアプリやトークンから会社のリポジトリを読むのに、管理者の承認は要らない（確認済み）」とする。一方 auth-flow.md 7. は、Organization で OAuth App のアクセス制限が有効なら、管理者の承認なしでは会社のプライベートリポジトリを読めず、C-02 に反するとして「要確認」にしている。ADR-004 は既定の認証をデバイスフロー（OAuth App）にしたが、その「結果」にこの前提と、崩れたときの切り替え（PAT を既定にする）が書かれていない。確かめるのは ⑬ で OAuth App を登録したとき（依頼者）で、それまでの間に認証まわりを作り始めると、既定が変わったときに初回の案内（F-36 (2)）も作り直しになる
- 根拠: business-flow.md 1.、intent.md 8.、auth-flow.md 7.、ADR-004「決定」・「理由」（OAuth App の登録に管理者の操作は要らない）・「結果」、requirements.md C-02、build-and-release.md 6.（OAuth App の登録は依頼者が ⑬）
- 重さ: 確認
- 対応案:
  1. ⑬ の最初の作業（認証を作る前）に、依頼者が OAuth App を登録し、会社のリポジトリの PR を読めるかを確かめる。build-plan.md の最初の手順として置く
  2. ADR-004 の「結果」に「OAuth App のアクセス制限が有効なら、PAT を既定にする（auth-flow.md 7.）」を足し、②.5 で確かめた範囲（トークンでの読み取りか、新しい OAuth App での読み取りか）を business-flow.md 1. に書き足す
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑧(副 ②.5) / AI推測=なし / 検知=AI`（根拠: ⑧ の ADR-004 で OAuth App を既定にしたときに、この前提を確かめていれば防げた。②.5 の確認は「外部のアプリやトークン」とまとめて聞いており、OAuth App のアクセス制限を分けていない）

#### DR-09 CI の結果の取り方で、取りこぼしが起きうる

- 内容: github-api.md 4. は、ワークフローの実行を `created=>={since の日付}`（作られた日付で絞る）と `per_page=30`（次のページを取る決まりが無い）で取る。このため、(1) 前の日に始まって日付をまたいで終わった実行は、`since` の日付が次の日になると対象から外れる。日付は UTC で、日本の朝9時が境目になる。(2) 1つのリポジトリで1日に31件以上の実行があると、古い方を取らない。どちらも Q-08「取りこぼさない」に反する
- 根拠: github-api.md 4.、non-functional.md Q-08、domain-model.md 5.（`since` は「前回 − 5分」）、domain-model.md 10. の 2（`ci_activity` の形はまだ確かめていない）
- 重さ: 確認
- 対応案:
  1. `created` で絞らず `status=completed` と `updated_at`（取り込みの記録より新しいもの）で選び、`Link` ヘッダーで次のページもたどる。github-api.md 4. を直す
  2. `created` で絞るなら、`since` からワークフローの最長の実行時間（例: 1日）を引いた日付にする
  - どちらも、⑬ の最初に `ci_activity` の応答を記録するとき（domain-model.md 10. の 2）に合わせて決めればよい
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑩.3 / AI推測=なし / 検知=AI`（根拠: 問い合わせの形を決めた github-api.md 4.）

#### DR-10 利用制限が少ないときの間隔（5分）は、5分以内に「ぎりぎり収まる」わけではない

- 内容: component-backend.md 6.1 は、利用制限の残りが500を切ったら間隔を5分にし、理由を「5分以内という目標にぎりぎり収まる間隔」としている。しかし間隔が5分だと、問い合わせの直後に起きた出来事は、次の問い合わせまでに5分近く待ち、そこに処理の時間（Q-01 の30秒以内）と GitHub 側の遅れが足されるため、5分を超えうる
- 根拠: component-backend.md 6.1、non-functional.md Q-01・Q-04
- 重さ: 軽微
- 対応案:
  1. 間隔を4分などにして、理由の書き方を直す
  2. 5分のままにし、「この間は S1（5分以内）を守れないことがある」と書く
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑩.2 / AI推測=あり / 検知=AI`（根拠: 6.1 の5分は AI案で、決まっていなかった値を AI が埋めたときの理由づけが誤っている）

#### DR-11 前の工程の「未定」欄と状態の書き方が、後で決めた内容に追いついていない

- 内容: 後の工程で決めたのに、前の文書が「未定」「⑧ で決める」などのままの所がある。AI は「未定を推測で埋めない」（AGENTS.md 行動ルール 1）ので、決まっていることを技術者に聞き直したり、古い候補を正と読んだりするおそれがある
  - requirements.md 7.、business-flow.md 6. と F4 の図（配布物を置く場所が「未定」。ADR-005 で GitHub Releases に決まった）
  - acceptance.md 5. と NF-03・NF-08（30日のときの速さと、受け取れていない表示までの時間を「⑨ で決める」。Q-02・Q-06 で決まった）
  - business-data.md 1.（出来事の識別子が「未定」。同じ文書の 6. と domain-model.md 3. では決定）
  - context-overview.md 3.・8. と図（認証の方式・配布場所・作り方を「⑧ で決める」、PR の一覧を REST の検索 API としている。ADR-003〜005・ADR-010 で決まった）、container-overview.md 3.（Releases への問い合わせの「確定する工程」が ⑩.3 のまま。github-api.md 6. で決まった）
  - non-functional.md の冒頭の凡例（「AI案＝技術者の確認待ち」。D-024 で Q-14 以外は確認済み）
- 根拠: 上に挙げた各文書の節、ADR-003〜005・010、non-functional.md Q-02・Q-06、decisions.md D-024
- 重さ: 軽微
- 対応案:
  1. 各「未定」欄を「決定（ADR-005）」のように直し、決めた所へのリンクを書く。要件定義の文書は状態欄だけを直し、中身は変えない
  2. 今後のために、⑨〜⑪ で未定を埋めたときは、その未定を書いた前の文書も直すことを AGENTS.md 行動ルール 12（文書の追従）に一言足す
- 手戻りタグ: タグなし（決定そのものは予定どおりの工程で行われ、前の文書の状態欄の書き換えが漏れただけのため。手戻りに数えるかは技術者が判断）

#### DR-12 Electron の版を追い続ける決まりと、対応 OS（macOS 13 以降）の関係が決まっていない

- 内容: Q-12・S-11 は「Electron は公式に支援される版（新しい3つのメジャー版）を使い続ける」とし、Dependabot が版の更新を出す。一方 C-07・Q-13 は「macOS 13 以降・Windows 10／11。Electron 44 以降の動作環境に合わせる」としている。今は食い違っていないが、将来の Electron の版で対応 OS の下限が上がると、版を上げることが対応 OS（要件）を変えることになる。そのときにどちらを優先し、誰が決めるかが無い。AI が Dependabot の更新をそのまま通すと、知らないうちに対応 OS が変わる
- 根拠: non-functional.md Q-12・Q-13、security-rules.md S-11、requirements.md C-07、decisions.md D-023 の 2
- 重さ: 確認
- 対応案:
  1. coding-standards.md か security-rules.md S-11 に「Electron のメジャー版を上げるときは、対応 OS が変わらないかを確かめる。変わるなら技術者に聞き、依頼者の確認を経て C-07 と Releases の説明を直す」と足す
- 手戻りタグ: タグなし（今は食い違っておらず、前工程の成果物を直す必要はまだ無い。将来の備え）

---

## 観点3 三層ガードレール

### 確かめたこと

- **入力制約**: AGENTS.md（言葉・行動ルール・特に守る範囲・セキュリティの要点）、ルートと2つのフォルダ別の CLAUDE.md、conventions/ の5つの規約がそろっている。見た目は design-system.md v0 に、方向（「OS になじむ・落ち着き・読みやすい」。D-027 で依頼者が選んだ）、色のトークン（ライトとダーク）、書体のロール、余白・角丸・影のスケール、名前の決まり、状態の見せ方、「ここには書かないこと」が入っている。値が決まっていない所（ラベルの色・影）は「AI が ⑬ で作り、依頼者が ⑭ で見る」と誰がいつかが書いてある
- **機械的検証**: TypeScript の strict、ESLint の import の制限（core・renderer・Feature どうし）、`react/no-danger`・`no-console`・`shell.openExternal` の場所の制限（coding-standards.md 9.）、`src/main/core/` の分岐の網羅100%、MSW の「登録していない問い合わせはエラー」、契約のテスト、書き込みが無いことのテスト（S-07）、`npm audit` と Dependabot、E2E での CSP の確認がある。CI の流れは build-and-release.md 3. にある
- **人間判断**: 依頼者の受け入れ（⑮）、手動のチェックリスト（⑬ で `docs/build/manual-checklist.md` を作る）、実機の見え（⑭・⑮ で依頼者）、Release の下書きの見直し、公開前の見直し（security-rules.md 2.）がある
- **見た目の線引き**: 「方向＋トークン」は design-system.md に落ちていて、人間判断に残るのは 7.「実際の見え」が中心になっている。ただし帯の色の割り当てなど、まだ AI が推測で埋めそうな所が残る（DR-18）
- 機械で拾える決まりの一部が機械に載っていないこと（DR-13）と、人のコードレビューの進め方（DR-14）に抜けがある

### 見つけたこと

#### DR-13 規約にあって、機械で拾っていない決まりがある

- 内容: 設計フレーム ⑪ は「機械で拾えるものは CI に強制し、規約には書かない」としている。しかし次の決まりは規約に書いてあるだけで、coding-standards.md 9.（機械で強制するもの）に入っていない
  - (a) design-system.md のトークン以外の色・大きさを直接書かない（coding-standards.md 7.、design-system.md 5.）。quality-coverage.md の UI 快美性の行は「静的解析で…（可能なら）」のまま、やるかどうかを誰がいつ決めるかが無い
  - (b) GitHub につなぐのは `src/main/github/` だけ（AGENTS.md「特に守る範囲」、coding-standards.md 2.）。`fetch` を他のフォルダで使うことを止める決まりが無い
  - (c) 部品に日本語・英語の文言を直接書かない（coding-standards.md 4.）
  - (d) `notification` を単独で名前に使わない（coding-standards.md 3.、AGENTS.md「言葉」）
- 根拠: 設計フレーム v0.4 3.5「規約を『機械で拾えない部分』に絞る方針」、coding-standards.md 2.・3.・4.・7.・9.、quality-coverage.md「UI 快美性」の行、design-system.md 5.
- 重さ: 確認
- 対応案:
  1. (a) は stylelint などで「トークンの定義ファイル以外に色の値・px を書かない」を止める。(b) は ESLint の `no-restricted-globals` などで `src/main/github/` 以外の `fetch` を止める。(d) は ESLint の `id-match` などで止める。どれも部品（npm）を足すなら技術者が決める
  2. 機械に載せないものは、quality-coverage.md の「人間判断」の列に「コードレビューで見る」と書き、DR-14 の見る観点に入れる
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑪(副 ⑨) / AI推測=なし / 検知=AI`（根拠: ⑪ の coding-standards.md 9. で、⑨ の quality-coverage.md が「可能なら」と残した項目を決めなかった）

#### DR-14 「コードレビュー」で確かめる決まりが多いが、誰がいつどう見るかが決まっていない

- 内容: quality-coverage.md（機密性・画面の安全・保守性の行）と security-rules.md（S-02・S-05・S-12・S-16・S-17・S-18）は、確かめ方を「コードレビュー」にしている。開発は技術者1人＋AI 1体（D-002）で、AI が書いたコードを、いつ（コミットの前か、PR を作るか）、誰が、どの観点で見るかが、AGENTS.md・規約のどこにも無い。AGENTS.md は「コミット・push は頼まれたときだけ」とするだけである
- 根拠: quality-coverage.md、security-rules.md 1.、AGENTS.md 行動ルール 11、decisions.md D-002、実装フレーム v0.2 4.3（レビューの回し方）
- 重さ: 確認
- 対応案:
  1. ⑬ の build-plan.md か AGENTS.md に「AI の変更は、技術者が差分を見てからコミットする。見る観点は security-rules.md の『コードレビュー』の項目と DR-13 で機械に載せなかった決まり」と書く
  2. main に直接入れず PR を作る形にし、PR の説明に見る観点のチェックリストを置く
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑪ / AI推測=なし / 検知=AI`（根拠: 人間判断の層の具体物を決める ⑪ の規約で、レビューの進め方を書いていない）

---

## 観点4 AI への備え

### 確かめたこと

- **設計の意図の翻訳**: AGENTS.md に文書の地図があり、作業の前に decisions.md を読むこと、言葉と区分値の正、推測しないこと、設計・契約・部品を勝手に変えないこと、判定は `src/main/core/` にテストを先に書くことが書かれている。フォルダ別の CLAUDE.md は ADR-011（core は I/O を持たない）と ipc-contract.md（shared が唯一の正）を翻訳している。ルールの正が AGENTS.md であること（ADR-013）も CLAUDE.md の先頭にある
- **⑬ への引き渡し**: barrier（`src/shared/`・`src/main/core/`・記録した応答）は domain-model.md 8. にまとまっている
- **「未定」「要確認」の扱い**: build-and-release.md 6.、design-system.md（ラベルの色・影）、domain-model.md 10.、auth-flow.md 7.、component-backend.md 11. の項目には、誰がいつ決めるか・確かめるかが書いてある。設計書に「AI案」と書いた項目は、各文書の状態欄で技術者の確認済みになっている
- 次の所で、AI が推測で埋めそう、または指示どうしがぶつかりそう（DR-15〜DR-20）。DR-05（オフラインでの立ち上げ）と DR-06（押すボタンの文言）もこの観点に当たる

### 見つけたこと

#### DR-15 不変条件のうち、core の外で守るものが AI に届かない

- 内容: AGENTS.md「特に守る範囲」と src/main/core/CLAUDE.md は、`src/main/core/` を「核の不変条件（domain-model.md 7.）を守る場所」としている。しかし domain-model.md 7. では、I-1 の一部（id で重ねる）・I-4（30日で消す）・I-5（出来事と取り込みの記録を同じ書き込みで）は `main/store`、I-4 の一部は `main/ingest`、I-7（トークンを外に出さない）は `main/auth`・`main/log` で守る。`main/store` を触るときに AI が読む決まり（フォルダ別の CLAUDE.md や AGENTS.md の行）が無く、特に I-5 は壊しても単体テストでは気づきにくい
- 根拠: AGENTS.md「特に守る範囲」、src/main/core/CLAUDE.md 冒頭、domain-model.md 7.（保証する場所の列）、ADR-013「決定」（守る範囲が特にあるフォルダにフォルダ別の CLAUDE.md を置く）
- 重さ: 確認
- 対応案:
  1. AGENTS.md「特に守る範囲」に `src/main/store/`（I-1・I-4・I-5。書き方は ADR-009・component-backend.md 7.）の行を足し、core の行の「核の不変条件」を「核の不変条件のうち判定に関わるもの（I-2・I-3・I-6・I-8）」に直す
  2. `src/main/store/CLAUDE.md` を足す（ADR-013 の考え方に沿う）
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑪ / AI推測=なし / 検知=AI`（根拠: ⑪ で AGENTS.md・フォルダ別 CLAUDE.md に翻訳するとき、domain-model.md 7. の「保証する場所」と突き合わせていない）

#### DR-16 記録した応答を作るのに GitHub への書き込みが要る場面があり、担当が AI になっている

- 内容: domain-model.md 10. の 2 は「`ci_activity` の応答を、個人のリポジトリでワークフローを動かして記録する」の担当を「AI・⑬ の最初」にしている。ワークフローを動かすには push などの書き込みが要り、CLAUDE.md の「GitHub の実データを確かめるときは読み取りだけ」と AGENTS.md 行動ルール 11（push は頼まれたときだけ）にぶつかる。github-api.md 8. の「⑬ の最初に記録するもの」（チーム宛てのレビュー依頼・bot・返信だけのレビュー）も、依頼者の最近のデータに無ければ、誰かが GitHub 上で起こす必要がある。一方で応答を手で作るのは禁止されている（test-conventions.md 3.、src/main/core/CLAUDE.md）。このままだと、⑬ で最初に固める barrier のテストの材料をそろえる所で、AI がどちらかの決まりを破るか、手が止まる
- 根拠: domain-model.md 8.・10. の 2、github-api.md 8.、CLAUDE.md「Claude Code での補足」の最後の項目、AGENTS.md 行動ルール 11、test-conventions.md 3.、src/main/core/CLAUDE.md「テスト」
- 重さ: **要対応**
- 対応案:
  1. 担当を「技術者が、自分の試し用リポジトリで出来事を起こし（ワークフローを動かす・レビュー依頼を出すなど）、AI が読み取りだけで記録して置き換える」に直す。domain-model.md 10. と github-api.md 8. に、起こす出来事の一覧と担当を書く
  2. AI に書き込みを任せるなら、試し用リポジトリと、許す操作の範囲を技術者が決めて CLAUDE.md に書く
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑩.1(副 ⑩.3) / AI推測=なし / 検知=AI`（根拠: ⑩.1 の domain-model.md 10. で担当を決めたときに、CLAUDE.md の読み取りだけの決まりと突き合わせていない。⑩.3 の github-api.md 8. も同じ）

#### DR-17 期間の「初日」の数え方が決まっていない

- 内容: PR の一覧の期間を、business-data.md 1. は「今日から数えてこの日数以内」、github-api.md 5. は「`updated:>=YYYY-MM-DD`（期間の初日）」としている。初日が「今日 − 7日」か「今日 − 6日」か、日付をどの時間帯（UTC か利用者の地域か）で数えるかが書かれていない。test-conventions.md 4.1 は「期間の初日」の境目のテストを求めているが、期待値の根拠が無いため、AI が推測で決めることになる。出来事の一覧の日数は「今 − 日数」（時刻で数える。domain-model.md 5.）で、数え方が2つあることも書かれていない。acceptance.md AC-17 の「最後の更新が8日前なら出ない」とも突き合わせが要る
- 根拠: business-data.md 1.（期間）・3.、github-api.md 5.、domain-model.md 5.、test-conventions.md 4.1、acceptance.md AC-17・AC-19
- 重さ: 確認
- 対応案:
  1. 技術者が「初日＝利用者の地域の日付で、今日 − (日数 − 1)」のように決め、domain-model.md に書く。業務上の意味（「7日」に今日を含むか）が変わるなら依頼者に確かめる
  2. ⑬ で barrier のテストを書く前に決める
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=②.6(副 ⑩.3) / AI推測=なし / 検知=AI`（根拠: ②.6 の business-data.md 1. で「今日から数えて」の数え方を固定していれば防げた。⑩.3 の github-api.md 5. も初日を定義していない）

#### DR-18 画面の細部で、AI が推測で埋めそうな所がある

- 内容:
  - (a) 帯の色: design-system.md 6. は受け取れていない帯を「認証切れは `color-danger`、ネットワーク・利用制限・GitHub の障害・取り込み中は `color-warning` か neutral」としており、`github_error`・`syncing` がどちらかを決めていない。デスクトップ通知の失敗の帯（`DesktopNotificationBanner`）と新しい版の帯（`UpdateBanner`）の色は書かれていない
  - (b) アイコン: `IconButton` があるが、アイコンをどこから持ってくるか（部品を足すか、自前の SVG か）と、見た目の方向が無い。部品を足すなら技術者に聞く決まりはある（coding-standards.md 1.）が、アイコンが要ることが前もって分かっているので、先に決められる
  - (c) 認証切れからの戻り方: component-frontend.md 1. の画面の切り替えに `auth.status = 'auth_failed'` が無く、メインの画面のままになる。帯の「サインインし直す」を押したときに、どの画面でデバイスフローか PAT を選ぶのかが書かれていない
- 根拠: design-system.md 2.1（`color-warning` の役割）・6.、component-frontend.md 1.・2.1・2.2（`status`・`auth`）・2.3・5.「知らせの優先順」、auth-flow.md 5.
- 重さ: 確認
- 対応案:
  1. design-system.md 6. に、`IngestState` とデスクトップ通知の失敗・新しい版の帯ごとの色を1つずつ書く。アイコンは「使う／使わない」と出どころを決めて design-system.md に書く
  2. component-frontend.md 1. に「`auth_failed` で利用者が『サインインし直す』を押したら、使い始めの案内の手順2（サインイン）だけを出す」のように書く
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑩.4(副 ⑪) / AI推測=なし / 検知=AI`（根拠: ⑩.4 の画面の切り替えと部品の分け方、⑪ の design-system.md の状態の見せ方で、ここまで決めていれば防げた）

#### DR-19 デバイスフローの通信をどのフォルダで行うかがはっきりしない

- 内容: AGENTS.md と github-api.md は「GitHub につなぐのは `src/main/github/` だけ」とし、つなぎ先にデバイスフローの `https://github.com/login/…` を含めている。一方 component-backend.md 3. は、デバイスフローを `auth/device-flow.ts` に置き、`github/` にはデバイスフロー用の部品が無い（2. の図は `auth → github` の矢印がある）。AI は `auth/` から直接 `fetch` するか、`github/` に部品を足すかを推測で選ぶことになる
- 根拠: AGENTS.md「特に守る範囲」、github-api.md 冒頭・1.「つなぎ先」、component-backend.md 2.・3.、auth-flow.md 2.
- 重さ: 軽微
- 対応案:
  1. component-backend.md 3. の `github/` に `device-flow-client.ts`（トークンを使わない問い合わせ）を足し、`auth/device-flow.ts` はそれを呼ぶ、と書く
  2. 例外として「デバイスフローだけは `auth/` から直接つなぐ」と AGENTS.md・github-api.md に書く
- 手戻りタグ: `手戻り: 発見=⑫ / 起因=⑩.2 / AI推測=なし / 検知=AI`（根拠: フォルダ構成を決めた component-backend.md 3. で、「github/ だけがつなぐ」決まりとの関係を書いていない）

#### DR-20 「規則は domain-model.md 4. の番号と1対1」としているが、4.2〜4.4 には番号が無い

- 内容: src/main/core/CLAUDE.md は「規則は domain-model.md 4. の番号（M-0〜M-9 など）と1対1にし、コメントに番号を書く」とし、test-conventions.md 2. はテストの名前に番号を入れるとしている。しかし番号があるのは 4.1 の M-0〜M-9 だけで、4.2（参加中）・4.3（自分待ちの理由）・4.4（デスクトップ通知を出すか）には番号が無い
- 根拠: src/main/core/CLAUDE.md「守ること」、test-conventions.md 2.・4.1、domain-model.md 4.2〜4.4
- 重さ: 軽微
- 対応案:
  1. domain-model.md 4.2〜4.4 に P-1〜、W-1〜、N-1〜 のような番号を振る
- 手戻りタグ: タグなし（番号を足すだけで済む表記の問題）

---

## 観点5・観点6

- **観点5（移行・回帰）**: 対象外。新規開発（greenfield）で、既存の機能やデータが無い（decisions.md D-001）
- **観点6（分割可能性）**: 対象外。開発は1人＋AI 1体の直列で、並列実装をしない（decisions.md D-002）。なお barrier（先に直列で固める範囲）は domain-model.md 8. にあり、「AI が実装中に勝手に変えない範囲」として使われている

---

## 見つけたことの一覧

| 番号 | 観点 | 重さ | 一言 |
| --- | --- | --- | --- |
| DR-01 | 1 | 軽微 | テスト戦略の受け入れ条件の対応に AC-41〜43・NF-09 などが抜けている |
| DR-02 | 1 | 確認 | S1 の確かめ方に要る「デスクトップ通知を出した時刻」の記録が無い |
| DR-03 | 1 | 軽微 | キーボードの割り当ては要件に根拠が無い。設計していない F-22 を要件として挙げている |
| DR-04 | 2 | **要対応** | 受け取れなかった間のデスクトップ通知が Q-06 と domain-model.md 4.4 で食い違う |
| DR-05 | 2 | **要対応** | 立ち上げの順番が Q-03・ADR-006 と合わず、オフラインでの立ち上げが決まっていない |
| DR-06 | 2 | 確認 | キーチェーンの確認で押すボタンが、要件は「許可」、設計は「常に許可」 |
| DR-07 | 2 | 確認 | Mac で管理者の権限が無い利用者と、`~/Applications` の扱いを確かめていない |
| DR-08 | 2 | 確認 | Organization の承認が要らないことを、要件は確認済み、設計は要確認としている |
| DR-09 | 2 | 確認 | CI の結果の取り方（日付で絞る・次のページを取らない）で取りこぼしうる |
| DR-10 | 2 | 軽微 | 利用制限が少ないときの5分間隔は、5分以内に収まらない |
| DR-11 | 2 | 軽微 | 前の工程の「未定」欄・状態が、後で決めた内容に追いついていない |
| DR-12 | 2 | 確認 | Electron の版を追うことと、対応 OS を守ることのどちらを優先するかが無い |
| DR-13 | 3 | 確認 | トークン以外の値・`github/` 以外の `fetch`・文言の直書き・名前を機械で止めていない |
| DR-14 | 3 | 確認 | コードレビューを、誰がいつどう行うかが決まっていない |
| DR-15 | 4 | 確認 | core の外で守る不変条件（特に store の I-5）が AI に届かない |
| DR-16 | 4 | **要対応** | 記録した応答を作るのに書き込みが要るのに、担当が「読み取りだけ」の AI になっている |
| DR-17 | 4 | 確認 | 期間の初日の数え方（今日を含むか・時間帯）が決まっていない |
| DR-18 | 4 | 確認 | 帯の色・アイコン・認証切れからの戻り方を AI が推測で埋めそう |
| DR-19 | 4 | 軽微 | デバイスフローの通信を `auth/` と `github/` のどちらで行うかがはっきりしない |
| DR-20 | 4 | 軽微 | 「規則の番号と1対1」なのに、domain-model.md 4.2〜4.4 に番号が無い |

件数: 要対応 3件、確認 11件、軽微 6件（計20件）

手戻りタグを付けたもの（16件）の起因（主）の内訳: ②.6 が1件、⑧ が2件、⑨ が4件、⑩.1 が1件、⑩.2 が3件、⑩.3 が1件、⑩.4 が1件、⑪ が3件。AI推測ありは3件（DR-04・DR-06・DR-10。DR-06 は要確認）。タグなしは4件（DR-03・DR-11・DR-12・DR-20）。

---

## 実装フェーズに進めるかの判定（案）

**案: 条件付きで進めてよい**（決めるのは技術者）

理由:

- 要件の M・S の項目は、すべて設計に受け皿があり、受け入れ条件もほぼすべてに確かめ方がある。ADR 同士の矛盾は見つからず、数値目標も Q-03 を除いて部品の設計で届く見込みがある。設計をやり直す（⑦〜⑩ に戻す）ほどの問題は無い
- 要件定義に戻す（⑥）必要があるものも無い。依頼者に確かめるのは、DR-06（押すボタンの文言）・DR-07（Mac の管理者の権限）・DR-17（期間に今日を含むか）の一部で、どれも要件の中身を大きく変えない
- 一方、要対応の3件は、⑬ で最初に固める範囲（判定のテスト・立ち上げの流れ・テストの材料）に直接かかる。直さずに始めると、AI がどちらかの文書を推測で選ぶか、決まりを破ることになる

進める条件（⑬ に入る前）:

1. 要対応の DR-04・DR-05・DR-16 を文書で直す（どれも数行の書き換えで済む見込み）
2. 確認のうち、⑬ の最初の作業にかかる DR-08（OAuth App で会社のリポジトリを読めるか）・DR-09（CI の結果の取り方）・DR-17（期間の初日）は、build-plan.md の最初の手順に「誰がいつ決めるか」を入れる
3. 残りの確認と軽微は、⑬〜⑭ の中で直してよい。Windows を確かめていないこと（D-021）は、リスク登録簿の扱いに従う

---

## 対応の記録（2026-11-26）

技術者が「推す対応で一括して直す」とし、DR-07・DR-14・DR-16 は個別に決めた。

| 番号 | 対応 | 直した文書 |
| --- | --- | --- |
| DR-01 | UAT を AC-01〜43 にし、AC-43 の確かめ方と NF-02・NF-09 の確かめ方を足した | test-strategy.md |
| DR-02 | ログに「デスクトップ通知を出した記録」（出来事の id・種類・発生の時刻・出した時刻）を足し、S1 の測り方をそれと結んだ | non-functional.md Q-01・Q-15、component-backend.md 4.、security-rules.md S-09 |
| DR-03 | キーボードの割り当ては残し、⑮ で依頼者に見せて要らなければ外す。F-22 は「C。入れるときに設計する」と書いた | component-frontend.md 5.、container-overview.md 2.、decisions.md D-028 |
| DR-04 | Q-06 を D-026（発生から10分以内なら出す）に合わせた | non-functional.md Q-06 |
| DR-05 | 立ち上げの順番を「保存済みの出来事を先に出す → トークン → GET /user」にし、つながらない・401 のときの扱いを書いた | component-backend.md 5.1、domain-model.md 1. |
| DR-06 | 案内するボタン（「許可」か「常に許可」か）は ⑭ で確かめて決める、と設計側に書いた | auth-flow.md 4.・7.、component-frontend.md 2.1、component-backend.md 11.、risk-register.md R-06 |
| DR-07 | 依頼者に確かめ、Mac の利用者は全員が管理者の権限を持つ。`/Applications` に置いたときのデスクトップ通知を ⑭ で確かめる | ADR-008、component-backend.md 11.、decisions.md D-028、risk-register.md R-07 |
| DR-08 | ⑬ の最初の作業（認証を作る前）に確かめることにし、だめなら PAT を既定にすることを ADR-004 に書いた | ADR-004、auth-flow.md 7.、business-flow.md 1. |
| DR-09 | 作られた日付で絞るのを `since` の前の日からにし、次のページもたどる。出来事にするかは `updated_at` で決める | github-api.md 4. |
| DR-10 | 利用制限が少ないときの間隔を4分にし、理由を直した | component-backend.md 6.1 |
| DR-11 | 前の工程の「未定」を直し、AGENTS.md の文書の追従に「前の文書の未定も直す」を足した | requirements.md 7.、business-flow.md、business-data.md 1.、acceptance.md、context-overview.md・context-diagram.mmd、container-overview.md 3.、non-functional.md の凡例、AGENTS.md |
| DR-12 | Electron のメジャー版を上げるときは対応 OS を確かめ、変わるなら技術者・依頼者に諮る | security-rules.md S-11、risk-register.md R-17 |
| DR-13 | `fetch` の場所だけ ESLint で止め、残り（トークン以外の値・文言の直書き・名前）は PR のコードレビューで見る | coding-standards.md 9.・10.、quality-coverage.md |
| DR-14 | 技術者が **PR を作って見る**形にした。`main` を保護し、PR と CI を必須にする。見る観点を coding-standards.md 10. に置いた | coding-standards.md 5.・10.、security-rules.md S-13、AGENTS.md 行動ルール 11 |
| DR-15 | AGENTS.md の「特に守る範囲」に `src/main/store/`（I-1・I-4・I-5）を足し、core の行を判定に関わる不変条件に絞った | AGENTS.md、src/main/core/CLAUDE.md |
| DR-16 | 技術者の提案で、CI の結果は**本リポジトリの CI の実行**で届くものを読み取りだけで記録する。AI は記録のために GitHub 上で出来事を起こさない。依頼者のデータに無い場面は、起きたときに記録し、それまでは記録した応答を書き換えて使う | domain-model.md 10.、github-api.md 4.・8.、test-conventions.md 3.、CLAUDE.md |
| DR-17 | 期間は github-prs と同じ「今の時刻 − 日数」の時刻で数える（github-prs の公開されているソースで確かめた） | business-data.md 1.、github-api.md 5.、domain-model.md 5.、test-conventions.md 4.1、decisions.md D-028 |
| DR-18 | 帯の色を状態ごとに1つに決め、アイコンは v0 では使わない。認証切れから「サインインし直す」で使い始めの案内の手順2だけを出す | design-system.md 6.・8.、component-frontend.md 1.・2.3 |
| DR-19 | デバイスフローの問い合わせは `github/device-flow-client.ts` に置き、`auth/device-flow.ts` から呼ぶ | component-backend.md 3. |
| DR-20 | domain-model.md 4.2〜4.4 に番号（PT・WR・DN）を振った | domain-model.md 4.、src/main/core/CLAUDE.md |

---

## 判定（2026-11-26）

- 技術者の判定: **実装フェーズに進めてよい**
- 理由: 案の「進める条件」1. の要対応（DR-04・DR-05・DR-16）は文書で直した。2. のうち DR-09・DR-17 は対応で決着し、DR-08（OAuth App で会社のリポジトリを読めるか）は ⑬ の最初の作業として build-plan.md に入れる。3. の残りは risk-register.md の申し送りに従って ⑬〜⑮ で扱う
- 同時に、traceability-matrix.md と risk-register.md を技術者が確認した
- 振り返りは簡略版（decisions.md D-003）のため、設計の工程振り返り（retro-設計.md）は作らず、⑮ の後の通しの振り返りにまとめる
