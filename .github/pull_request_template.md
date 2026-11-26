## 何を変えたか

<!-- build-plan.md のどの barrier・スライスか（例: S1 骨格） -->

## 設計に無くて決めたこと

<!-- 設計書に無く、実装の中で決めたこと。⑮ の統合レビューの材料になる（実装フレーム 3.2）。無ければ「なし」 -->

## 直した文書

<!-- 直した設計書・AGENTS.md・CLAUDE.md。直さなかったなら、その理由を1行で（coding-standards.md 6.） -->

## 契約・判定

- [ ] `src/shared/`・`src/main/core/` の変更は、契約・判定の変更ではない（整理だけ）
  <!-- 契約・判定を変えるときは、文書（domain-model.md・api-contract）か変更要求（docs/build/change-requests/）を同じ PR で直す（build-plan.md 6.） -->

## 技術者が見ること（coding-standards.md 10.）

- [ ] 色・大きさの値を直接書いていない（design-system.md のトークンだけ）
- [ ] 画面の文言を部品に直接書いていない（`i18n/` を使う）
- [ ] `notification` を単独で名前に使っていない
- [ ] GitHub に書き込む呼び出し・client secret・トークンの露出が無い
- [ ] GitHub から取った文字を HTML として扱っていない
- [ ] Hardened Runtime・許可（entitlements）・GitHub Actions の権限を緩めていない
- [ ] `src/main/store/` の変更で、出来事と取り込みの記録を同じ書き込みで保存している
- [ ] 文書の追従ができている（直した文書が上にある）

## 画面の写し

<!-- 画面を変えたときだけ。依頼者が実機で見る（design-system.md 7.） -->
