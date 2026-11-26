# src/shared/ の決まり

画面（`src/renderer`）・preload・メインプロセス（`src/main`）が共有する型・区分値・IPC の契約を置く場所。**この3つの間の取り決めの唯一の正**（ipc-contract.md 1.）。

**2026-11-26 に凍結した**（build-plan.md 6.4）。変えたくなったら実装を止め、変更要求（`docs/build/change-requests/CR-NNN.md`）を起票する（build-plan.md 6.2）。

## 置くもの

- `domain.ts`: domain-model.md 2. の型と、6. の区分値、設定の既定値
- `ipc-contract.ts`: ipc-contract.md 2.・3.・4. のチャンネル・引数・戻り値・知らせ・失敗の形を zod のスキーマで。型はスキーマから作る

## 守ること

- **文書を先に直す**。domain-model.md・ipc-contract.md を直し、技術者の確認を得てからコードを直す
- 文書に無いチャンネル・項目・区分値を足さない。区分値の値は business-data.md・domain-model.md 6. のコードをそのまま使う
- ここを変えると、画面とメインの両方に響く。変えたら、契約のテスト（`test/contract/`）と両方の型検査を通す
- Electron・Node.js・React に頼るコードを置かない（画面とメインの両方から読まれるため）
- トークンを運ぶ項目を作らない（`auth:submitPat` の引数を除く。ipc-contract.md 1.）
