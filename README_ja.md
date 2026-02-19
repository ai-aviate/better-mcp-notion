# better-mcp-notion

[English](./README.md)

**1つの Markdown で Notion を操作する MCP サーバー**

従来の Notion MCP は API のラッパーに過ぎず、1つの操作に複数回の通信が必要だった。
better-mcp-notion は **Markdown（YAML frontmatter + 本文）1つ** で、ページの読み書きを 1 回の呼び出しで完結させる。

## なぜ better-mcp-notion？

| | 従来の Notion MCP | better-mcp-notion |
|---|---|---|
| ツール数 | 16〜22 ツール | **6 ツール** |
| DB エントリ作成 | 3回以上（DB検索、スキーマ取得、ページ作成、ブロック追加） | **1回** |
| ページ編集 | 4回以上（ページ取得、ブロック取得、削除、追加） | **1回**（read → 編集 → write） |
| フォーマット | JSON ブロック | **Markdown** |
| コンテキスト | 重い（ツール定義 + JSON の往復） | **軽い** |

## ツール一覧

| ツール | 概要 |
|--------|------|
| `read` | Notion ページを Markdown + frontmatter として読む。`depth` で子ページの再帰取得も可能。 |
| `write` | Markdown からページを作成/更新。`===` 区切りでバッチ処理にも対応。 |
| `search` | ワークスペースをキーワード検索。Markdown フォーマットで結果を返す。 |
| `list` | DB レコードをテーブル、子ページをリストで表示。自然言語フィルタ・ソート対応。 |
| `delete` | ページをアーカイブ（ソフトデリート）。 |
| `move` | ページを別の親ページまたは DB に移動。 |

## クイックスタート

### 1. Notion Integration を作成

1. [notion.so/profile/integrations](https://www.notion.so/profile/integrations) で新しい Integration を作成
2. API キー（`ntn_...`）をコピー
3. 操作したいページ/DB で「Connect to」から Integration を追加

### 2. MCP クライアントに追加

#### Claude Code

```bash
claude mcp add better-notion -- npx better-mcp-notion
```

環境変数を設定:
```bash
export NOTION_API_KEY=ntn_your_api_key_here
```

#### Claude Desktop / Cursor / Windsurf

MCP 設定ファイル（`claude_desktop_config.json`、`.cursor/mcp.json` 等）に追加:

```json
{
  "mcpServers": {
    "better-notion": {
      "command": "npx",
      "args": ["-y", "better-mcp-notion"],
      "env": {
        "NOTION_API_KEY": "ntn_your_api_key_here"
      }
    }
  }
}
```

#### ソースから

```bash
git clone https://github.com/ai-aviate/better-mcp-notion.git
cd better-mcp-notion
npm install && npm run build
```

MCP 設定で `node /path/to/better-mcp-notion/build/index.js` を指定。

## 使い方

### ページを読む

```
read({ page: "https://notion.so/My-Page-abc123def456" })
```

出力:

```markdown
---
id: abc123-def456
title: My Page
database: task-db-id
properties:
  Status: In Progress
  Tags:
    - backend
---
## Notes
- Completed API design
```

### ページを作成する

```
write({ markdown: `
---
title: Meeting Notes
parent: "Project Alpha"
icon: "📝"
---
## Agenda
- Review progress
- Discuss next steps
` })
```

### DB エントリを作成する

```
write({ markdown: `
---
title: Fix login bug
database: "Task Board"
properties:
  Status: In Progress
  Tags:
    - backend
    - urgent
  Due Date: "2026-03-01"
---
## Description
Login fails when password contains special chars.
` })
```

### ページを更新する（read の出力を編集して write に渡す）

```
write({ markdown: `
---
id: abc123-def456
title: Updated Title
properties:
  Status: Done
---
## New content
Body replaces all existing blocks.
` })
```

### 複数ページを一括作成する

`===` で区切って 1 回で複数ページを作成:

```
write({ markdown: `
---
title: Task 1
database: "Task Board"
properties:
  Status: Todo
---
Task 1 details
===
---
title: Task 2
database: "Task Board"
properties:
  Status: Todo
---
Task 2 details
` })
```

### DB をフィルタ・ソートする

```
list({
  target: "Task Board",
  filter: "Status is Done AND Priority is High",
  sort: "Due Date ascending"
})
```

#### フィルタ構文

- `Status is Done` / `Status = Done` - 一致
- `Priority != Low` - 不一致
- `Tags contains backend` - マルチセレクトに含む
- `Done is true` - チェックボックス
- `Score > 80` - 数値比較（`>`, `<`, `>=`, `<=`）
- `Due Date after 2026-03-01` - 日付の前後
- `AND` で結合: `Status is Done AND Priority is High`

#### ソート構文

- `Due Date ascending` または `Due Date asc`
- `Created descending` または `Created desc`

### 子ページごと読む

```
read({ page: "parent-page-id", depth: 2 })
```

`depth: 1` = 現在のページのみ（デフォルト）、`2` = 子ページ含む、`3` = 孫ページ含む。

## Frontmatter リファレンス

### Write（作成/更新）

| フィールド | 作成 | 更新 | 説明 |
|-----------|------|------|------|
| `id` | - | **必須** | 更新対象のページ ID |
| `title` | 推奨 | 任意 | ページタイトル |
| `parent` | 必須* | 無視 | 親ページの名前または ID |
| `database` | 必須* | 無視 | DB の名前または ID（*`parent` か `database` のどちらか） |
| `icon` | 任意 | 任意 | 絵文字または画像 URL |
| `cover` | 任意 | 任意 | カバー画像 URL |
| `properties` | 任意 | 任意 | DB プロパティ（スキーマに自動マッチ） |

### Read（出力のみ）

| フィールド | 説明 |
|-----------|------|
| `id` | ページ UUID |
| `url` | Notion ページ URL |
| `title` | ページタイトル |
| `parent` / `database` | 親ページまたは DB の ID |
| `icon`, `cover` | 絵文字または画像 URL |
| `properties` | 全ての DB プロパティ |
| `created`, `last_edited` | タイムスタンプ（読み取り専用） |

読み取り専用フィールド（`url`, `created`, `last_edited`, formula 等）は `write` に渡しても安全に無視される。

## 開発

```bash
npm run dev          # TypeScript ウォッチモード
npm test             # テスト実行
npm run test:watch   # テスト ウォッチモード
```

## ライセンス

[Elastic License 2.0 (ELv2)](./LICENSE) — 自由に使用・改変・配布可能。マネージドサービスとしての提供は禁止。
