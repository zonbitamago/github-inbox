# デザインシステム（design-system.md）

## ステータス

v0（仮）
最終更新: 2026-11-26　合意者: 依頼者（方向のみ。値は AI案で、⑭ で実機を見て決める）

- 入力: [non-functional.md](../quality/non-functional.md) 4.・Q-17、[component-frontend.md](../components/component-frontend.md)、decisions.md D-023・D-027
- 設計フレーム 付録3 の形に沿う。`docs/requirements/mockup/` の見た目は使わない（AGENTS.md）
- **値（色・大きさ）はすべて仮**。名前（トークン名）を先に決め、値は実装中に実機の画面で依頼者が見て直し、ここに書き戻す（8.）

---

## 1. 方向

- キーワード: **OS になじむ・落ち着き・読みやすい**（依頼者が選んだ。D-027）
- 求める第一印象: Mac・Windows の標準のアプリと並べても浮かない。切り替えて開いたとき、まず「自分待ち」と「受け取れていない」が目に入る
- 参照したいもの: OS の標準の書体と控えめな配色
- 避けたい印象: 色が多くてどこを見ればよいか分からない。装飾が多い
- 色の使い方: **意味のある所だけに色を使う**（自分待ちの理由、レビューの結果、CI の結果、受け取れていない表示、主な操作）。出来事の種類のラベルは色を付けない

---

## 2. カラートークン

CSS の変数として `src/renderer/styles/tokens.css` に置く。ライトとダークは `prefers-color-scheme` で切り替える（F-35）。

### 2.1 基本

| トークン名 | ライト（仮） | ダーク（仮） | 役割 | 使う場所 |
| --- | --- | --- | --- | --- |
| `color-bg` | `#FFFFFF` | `#1E1E1E` | 地色 | 画面の背景 |
| `color-surface` | `#F5F5F7` | `#262628` | 面 | 上部の帯、絞り込みの帯、設定の区切り |
| `color-surface-hover` | `#EDEDF0` | `#323236` | 面（指したとき） | 一覧の行を指したとき |
| `color-surface-selected` | `#E3ECFA` | `#1F3352` | 面（選んだとき） | デスクトップ通知から開いた出来事の強調、今のタブ |
| `color-border` | `#E0E0E3` | `#3A3A3D` | 罫線 | 区切り線・枠 |
| `color-text` | `#1D1D1F` | `#F2F2F4` | 本文 | 通常の文字 |
| `color-text-mute` | `#6E6E73` | `#A1A1A6` | 補助 | 時刻・リポジトリ名・抜粋・注釈 |
| `color-primary` | `#0A64D6` | `#4C9AFF` | 主色 | 主なボタン・リンク・フォーカス |
| `color-on-primary` | `#FFFFFF` | `#0B1A2E` | 主色の上の文字 | 主なボタンの文字 |
| `color-danger` | `#C9302C` | `#FF6B61` | 失敗・警告 | 失敗、受け取れていない（認証切れなど） |
| `color-warning` | `#A36100` | `#E8A13A` | 注意 | 受け取れていない（ネットワーク・利用制限） |
| `color-success` | `#1F7A3A` | `#4CC46A` | 完了 | 承認、CI の成功 |
| `color-focus` | `#0A64D6` | `#4C9AFF` | フォーカスの輪 | キーボードで選んでいる所 |

### 2.2 ラベル（Badge）

ラベルは「地の色（薄い）＋文字の色（濃い）」の組で使う。地と文字の組を崩さない。

| トークン名 | 使う場所 |
| --- | --- |
| `color-badge-neutral-bg`・`color-badge-neutral-fg` | 出来事の種類、PR の状態、CI の結果（成功・失敗以外の値）、自分待ちの理由「アサイン」 |
| `color-badge-primary-bg`・`color-badge-primary-fg` | 自分待ちの理由「レビュー依頼に未対応」 |
| `color-badge-danger-bg`・`color-badge-danger-fg` | 自分待ちの理由「修正依頼あり」「CI 失敗」、レビューの結果「修正依頼」、CI の結果 `failure`・`timed_out`・`startup_failure` |
| `color-badge-success-bg`・`color-badge-success-fg` | 自分待ちの理由「承認済み」、レビューの結果「承認」、CI の結果 `success` |

- 値（仮）は ⑬ B4 で AI が 2.1 の色から作った。⑭ で依頼者が実機で見て決める。地と文字のコントラスト比は、ライト・ダークとも 6 以上

| 組 | ライト（地・文字） | ダーク（地・文字） |
| --- | --- | --- |
| neutral | `#EEEEF0`・`#48484D` | `#3A3A3D`・`#D8D8DC` |
| primary | `#E3ECFA`・`#0A4FA8` | `#1F3352`・`#9CC3FF` |
| danger | `#FBE9E8`・`#A42622` | `#4A2222`・`#FF9A92` |
| success | `#E6F4EA`・`#1A6631` | `#1E3A26`・`#7FDB95` |
- CI の結果の値と色の対応は上の表だけ。ほかの値（`cancelled`・`skipped` など）は neutral（business-data.md 2.3。値はそのまま出す）

---

## 3. タイポグラフィ（書体のロール）

書体は OS の標準を使う（読み込まない。S-04）。

- 本文の書体: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif`
- 数値・コードの書体: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`

| ロール | トークン名 | 大きさ（仮） | 太さ | 行間 |
| --- | --- | --- | --- | --- |
| 見出し（大） | `font-title` | 16px | 600 | 1.4 |
| 見出し（小） | `font-heading` | 14px | 600 | 1.4 |
| 本文 | `font-body` | 13px | 400 | 1.5 |
| 補助・注釈 | `font-caption` | 12px | 400 | 1.4 |
| ラベル | `font-badge` | 11px | 600 | 1 |
| 数値・コード | `font-mono` | 12px | 400 | 1.4 |

---

## 4. スケール（余白・角丸・影）

- 余白: `space-1`=4px／`space-2`=8px／`space-3`=12px／`space-4`=16px／`space-5`=24px
- 角丸: `radius-sm`=4px（ラベル・入力欄）／`radius-md`=6px（ボタン・帯）／`radius-lg`=10px（ダイアログ）
- 影: `shadow-1`（浮いた帯・トースト）／`shadow-2`（ダイアログ）。値（仮）は ⑬ B4 で AI が置いた（ライト: `0 1px 3px` 黒 12%／`0 8px 24px` 黒 18%。ダーク: 同じ形で 50%／60%）。⑭ で依頼者が見る
- 一覧の1行の高さは決めない（文字の量で変わる）。行の上下の余白は `space-2`
- **中間の値を勝手に作らない**。足りなければトークンを足し、ここを直してから使う

---

## 5. 名前の決まり

- 形: `{種別}-{意味}`（例: `color-border`、`space-3`、`font-body`）。CSS の変数では `--color-border` のように書く
- 部品に値（`#FFFFFF`・`13px` など）を直接書かない。必ずトークンを使う（coding-standards.md 7.）
- 部品だけで使う色・余白を、部品の中で作らない。要るならここに足すことを技術者に提案する

---

## 6. 状態の見せ方

| 状態 | 見せ方 |
| --- | --- |
| 指したとき（hover） | 地の色を `color-surface-hover` にする |
| フォーカス | `color-focus` の2px の輪を、2px 離して出す。**必ず見えるようにする**（消さない） |
| 使えない（disabled） | 不透明度 0.5。指しても変わらない |
| 読み込み中 | ボタンの中か一覧の上に小さな回る印（`Spinner`）。一覧は前の内容を残したまま重ねる |
| 失敗 | `color-danger` の文字と、何をすればよいかの一言（例: 「サインインし直す」） |
| 受け取れていない（N-08） | 画面の上部に帯（`Banner`）。`auth_failed` は `color-danger`、`offline`・`rate_limited`・`github_error` は `color-warning`、`syncing`（取り込み中）は neutral |
| デスクトップ通知の失敗（N-09） | 帯。`color-warning` |
| 新しい版（F-31） | 帯。地は `color-badge-primary-bg`、文字は `color-badge-primary-fg` |
| アイコン | v0 では使わない。ボタンは文字だけ（部品を足さない） |

---

## 7. ここには書かないこと（人間判断に残す）

- 実際の見え（色の強さ、コントラスト、余白の詰まり具合、ダークモードでの見え）
- ラベルが意図どおりに読めるか、目が向くべき所に向くか
- → 実装中に実機の画面を依頼者が見て判断し、決まった値をここに書き戻す（⑭・⑮）

---

## 8. 変更履歴

| 日付 | 変更した内容 | 理由 | 影響範囲 |
| --- | --- | --- | --- |
| 2026-11-26 | v0（仮）を起票 | ⑪ 規約設計 | 全画面 |
| 2026-11-26 | 帯の色を状態ごとに1つに決め、アイコンを使わないことにした | ⑫ 設計レビュー DR-18 | 帯・ボタン |
| 2026-11-26 | ラベル（2.2）と影（4.）の値（仮）を置き、`src/renderer/styles/tokens.css` を作った。書体のトークンは `font` の一括指定（太さ 大きさ/行間 書体）の形にした | ⑬ B4 | 全画面 |
