# AGENTS.md

この案件で AI エージェントに守らせるルール。エージェントを問わないルールの正はこのファイル（ADR-013）。要件定義フェーズで骨子を作り、設計フェーズの ⑪ 規約設計で実装向けに広げた。

## プロジェクトの現在地

- 「自分に関わる GitHub の通知」と「自分に関連する PR の一覧」を見るためのデスクトップアプリ **github-inbox**（D-027）
- 作り: Electron + React + TypeScript（ADR-003）。開発とビルドは electron-vite、配布物は electron-builder（ADR-014）。サーバーは無く、各自の PC から GitHub に直接問い合わせる（ADR-001）
- AI駆動開発フレーム（要件定義 v0.5 / 設計 v0.4 / 実装 v0.2）に沿って進めている。現在は **実装フェーズの ⑬ 構築計画**（要件定義は 2026-11-26 に ⑤ で合意済み。設計は 2026-11-26 に ⑫ で「実装フェーズに進めてよい」と判定した）。作る順番と先に固める範囲（barrier）は `docs/build/build-plan.md`。barrier（B0〜B4）は 2026-11-26 に `main` に入れ、**契約を凍結した**（`dd8bbb2`。build-plan.md 6.4。CI の結果の分解は残り）。次は ⑭ のスライス S1（骨格）
- 開発は1人（技術者）＋ AI 1体の直列（D-002）

## 文書の地図

| 知りたいこと | 文書 |
| --- | --- |
| 何のために作るか・やらないこと | `docs/requirements/intent.md`、`docs/requirements/summary.md` |
| 決めたことと理由（業務） | `docs/requirements/decisions.md`。**作業の前に読む** |
| やること・受け入れ条件 | `docs/requirements/requirements.md`、`docs/requirements/acceptance.md` |
| 言葉と区分値 | `docs/requirements/business-data.md`、`docs/design/components/domain-model.md` 6. |
| 技術の判断と理由 | `docs/design/adr/`（一覧は `README.md`） |
| 全体の構成 | `docs/design/architecture/` |
| 非機能の目標・テストの方針 | `docs/design/quality/` |
| 型・判定の決まり・不変条件 | `docs/design/components/domain-model.md` |
| メインプロセス・画面の部品 | `docs/design/components/component-backend.md`、`component-frontend.md` |
| IPC・GitHub API・認証の契約 | `docs/design/api-contract/` |
| 書き方の規約 | `docs/design/conventions/`（coding-standards・test-conventions・security-rules・design-system・build-and-release） |
| 作る順番・barrier・契約の凍結・変更要求 | `docs/build/build-plan.md`、`docs/build/change-requests/` |

- `docs/requirements/mockup/` は要件確認用の使い捨て。実装の土台にせず、見た目もそこから決めない（見た目は `docs/design/conventions/design-system.md` に従う）

## 言葉

- 言葉の定義と区分値は `docs/requirements/business-data.md` に従う。実装の都合で設計に加えた区分値（受け取りの状態など）は `docs/design/components/domain-model.md` 6. にある。この2つに無い区分値やコードを新しく作らない
- 「通知」と単独では書かず、「デスクトップ通知」（本アプリが OS に出すもの）か「GitHub の通知」かを明記する。コードでも `notification` を単独で名前に使わない（coding-standards.md 3.）

## 行動ルール

1. **過信防止**: 不明な点は推測せず、質問として返す（業務のことは依頼者、技術のことは技術者）。空欄・「未定」の項目を推測で埋めない
2. **網羅性優先**: 1つの正解を出すより、複数の選択肢を提示する
3. **構造化出力**: 回答は対応する成果物ファイルの形式に沿う。確定事項はファイルに、検討中の事項は対話に置く
4. **理由の明示**: 提案には根拠と代替案を必ず添える
5. **「やらない」も提案**: 全てを実装する案だけでなく、Won't とする案も出す
6. **業務と技術の翻訳**: 技術用語には平易な言い換えを添え、業務上の言葉には技術的な含意を明示する
7. **設計を勝手に変えない**: ADR・設計書と違うことをしたくなったら、実装する前に技術者に聞く。設計書が間違っていそうなときも、黙って直さずに聞く
8. **契約を勝手に変えない**: `src/shared/`（共有の型・区分値・IPC の契約）、`docs/design/api-contract/` にある GitHub API と IPC のチャンネルは、文書を先に直し、技術者の確認を得てからコードを直す。凍結した後（build-plan.md 6.）は、実装を止めて `docs/build/change-requests/CR-NNN.md` を起票し（手戻りタグを付ける）、技術者が決めてから直す
9. **部品を勝手に足さない**: npm のパッケージを足すときは、先に技術者に聞く（coding-standards.md 1.）
10. **判定は `src/main/core/` に、テストを先に**: 出来事の分解・種類・自分待ちの理由・デスクトップ通知を出すか・URL の検査は、I/O を持たない関数として `src/main/core/` に書き、先にテストを書く（ADR-011、test-conventions.md 4.1）
11. **コミット・push・PR は頼まれたときだけ**行う。作業はブランチで行い、`main` には CI が通り技術者が見た PR だけを入れる（coding-standards.md 5.・10.）
12. **文書の追従**: コードや設定を変えたら、関係する設計書・README・AGENTS.md・CLAUDE.md を直す必要があるかを確かめ、要るなら同じ作業で直す。後の工程で前の文書の「未定」を決めたら、その「未定」の欄も直す。完了を報告するときは、直した文書を挙げるか、直す必要が無い理由を1行で書く

## 特に守る範囲

| フォルダ | 決まり |
| --- | --- |
| `src/main/core/` | I/O を持たない。核の不変条件のうち判定に関わるもの（domain-model.md 7. の I-2・I-3・I-6・I-8 と I-1 の分解の側）を守る場所。規則を変えるときは domain-model.md を先に直す。詳しくは `src/main/core/CLAUDE.md` |
| `src/main/store/` | 出来事と取り込みの記録を同じ書き込みで保存する（I-5）。同じ出典は1件に重ねる（I-1）。30日を過ぎたものを消す（I-4）。書き方は ADR-009・component-backend.md 7. |
| `src/shared/` | 画面とメインの契約の唯一の正。詳しくは `src/shared/CLAUDE.md` |
| `src/main/github/` | GitHub につなぐ唯一の場所。github-api.md に無い API を使わない。書き込みをしない |
| `src/main/auth/` | トークンを扱う唯一の場所。トークンを外に出さない |

## セキュリティの要点（全体は security-rules.md）

- **リポジトリは公開する**（ADR-005）。コード・文書・テストのデータ・コミットのメッセージに、会社名・Organization 名・実在の人やリポジトリの名前・社内の事情・実データを書かない
- テストの GitHub の応答は、実際の応答を記録して架空のデータに置き換えたものだけを使う（test-conventions.md 3.）
- 本物のトークンをテスト・設定・ログに入れない
- GitHub に書き込む API を呼ばない（N-06）
- GitHub から取った文字は文字としてだけ出す。外で開く URL は `https://github.com/` のものだけ
