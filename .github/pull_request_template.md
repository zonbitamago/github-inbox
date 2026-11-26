## 何を変えたか

<!-- build-plan.md のどの barrier・スライスか（例: S1 骨格） -->

## 設計に無くて決めたこと

<!-- 設計書に無く、実装の中で決めたこと。⑮ の統合レビューの材料になる（実装フレーム 3.2）。無ければ「なし」 -->

## 直した文書

<!-- 直した設計書・AGENTS.md・CLAUDE.md。直さなかったなら、その理由を1行で（coding-standards.md 6.） -->

## 契約・判定

- [ ] `src/shared/`・`src/main/core/` の変更は、契約・判定の変更ではない（整理だけ）
  <!-- 契約・判定を変えるときは、文書（domain-model.md・api-contract）か変更要求（docs/build/change-requests/）を同じ PR で直す（build-plan.md 6.） -->

## 決まり（検査）

- [ ] 決まり（検査）を変えた。理由と、緩めたか強めたかを上に書いた
  <!-- eslint.config.mjs・test/config/・test/contract/・scripts/check-*.ts・.github/・.claude/settings.json・tsconfig・vitest・Prettier の設定・package.json の scripts を変えたら印を付ける。印が無いと CI が落ちる（build-plan.md 6.3） -->
  <!-- 例外（eslint-disable）は、決まりの名前と -- の後の理由を書く。理由は技術者が見る（coding-standards.md 4.） -->

## 技術者が見ること（coding-standards.md 10.。機械で確かめられないものだけ）

- [ ] 決まり（検査）の変更と、例外（`eslint-disable`）の理由が妥当
- [ ] GitHub に書き込む呼び出し・トークンの露出が無い（S2 からはテストでも確かめる）
- [ ] `src/main/store/` の変更で、出来事と取り込みの記録を同じ書き込みで保存している
- [ ] Hardened Runtime・許可（entitlements）を緩めていない（配布の設定ができる S7 から、テストに移す）
- [ ] 文書の追従ができている（直した文書が上にあり、中身が合っている）

## 画面の写し

<!-- 画面を変えたときだけ。依頼者が実機で見る（design-system.md 7.） -->
