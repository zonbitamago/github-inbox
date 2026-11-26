# CLAUDE.md

この案件のルールの正は AGENTS.md（ADR-013）。ここには Claude Code だけに要る補足を書く。

@AGENTS.md

## Claude Code での補足

- 進め方は AI駆動開発フレームに沿う（AGENTS.md「プロジェクトの現在地」）。工程の番号（⑪・⑬ など）はフレームのもの
- 技術者・依頼者に判断を頼むときは、選択肢を並べて AskUserQuestion で聞く。推す案には理由を添える
- `src/main/core/` と `src/shared/` には、フォルダ別の CLAUDE.md がある。そのフォルダのファイルを触る前に読む
- 凍結した範囲（`src/shared/`・`src/main/core/`・`docs/design/api-contract/`・domain-model.md・`tokens.css`）を書き換えようとすると、`.claude/settings.json` の確認が出る。確認を求める前に、変更要求（`docs/build/change-requests/CR-NNN.md`）を起票し、技術者が決めたかを確かめる（AGENTS.md 行動ルール 8、build-plan.md 6.2）
- 手戻りタグの集計や振り返りの下書きは、作業したセッションではなく、作業の文脈を持たない新しいサブエージェントに任せる（自分の判断を正当化しやすいため）
- GitHub の実データを確かめる（gh CLI など）ときは読み取りだけにし、会話や文書に出すのは件数・形・時間だけにする。中身（タイトル・本文・リポジトリ名）は出さない。テストの材料を記録するために GitHub 上で出来事を起こさない（test-conventions.md 3.）
