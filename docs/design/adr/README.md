# ADR 一覧

技術判断を1判断1ファイルで残す（設計フレーム 5.3節）。業務判断は [decisions.md](../../requirements/decisions.md) に残す。AI がドラフトを作り、技術者がレビューしてステータスを確定する。

| ADR | タイトル | ステータス | 工程 |
| --- | --- | --- | --- |
| [ADR-001](ADR-001.md) | 自前のサーバーを置かず、各自の PC のアプリが直接 GitHub に問い合わせる | 採用 | ⑦ |
| [ADR-002](ADR-002.md) | 出来事の起点を GitHub の通知 API にし、classic のトークン（notifications・repo スコープ）で読み取る | 採用 | ⑦ |
| [ADR-003](ADR-003.md) | Electron + React + TypeScript でデスクトップアプリを作る | 採用 | ⑧ |
| [ADR-004](ADR-004.md) | 認証は OAuth App のデバイスフローを既定にし、classic PAT の貼り付けも選べる。トークンは safeStorage で暗号化して保存する | 採用 | ⑧ |
| [ADR-005](ADR-005.md) | 個人の public リポジトリで開発し、GitHub Actions でビルドして GitHub Releases で配る | 採用 | ⑧ |
| [ADR-006](ADR-006.md) | 受け取った出来事と設定を手元に保存し、GitHub からは差分だけ取る | 採用 | ⑧ |
| [ADR-007](ADR-007.md) | GitHub とトークンはメインプロセスだけが扱い、画面には preload で公開した関数だけを渡す | 採用（AI案） | ⑧ |
| [ADR-008](ADR-008.md) | Mac は DMG（ドラッグ＆ドロップでアプリケーションフォルダへ入れる形）、Windows は利用者ごとに入れるインストーラーで配る | 採用 | ⑨ |
| [ADR-009](ADR-009.md) | 手元の保存は JSON ファイルにし、一時ファイルに書いてから置き換える | 採用 | ⑩ |
| [ADR-010](ADR-010.md) | GitHub の通知は REST で、出来事への分解と PR の一覧は GraphQL で取る | 採用 | ⑩ |
| [ADR-011](ADR-011.md) | メインプロセスは機能ごとのフォルダに分け、判定は I/O を持たない純粋な関数として core に集める | 採用 | ⑩ |
| [ADR-012](ADR-012.md) | 画面の状態は React 標準の仕組み（useSyncExternalStore）で持ち、状態管理の部品を入れない | 採用 | ⑩ |
| [ADR-013](ADR-013.md) | AI エージェントは Claude Code を主に使い、ルールの正は AGENTS.md に置く | 採用 | ⑪ |
| [ADR-014](ADR-014.md) | 開発とビルドは electron-vite、配布物は electron-builder で作り、Mac 用は両対応の1つにする | 採用 | ⑪ |
