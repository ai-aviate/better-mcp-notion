# better-mcp-notion

**1つの Markdown で Notion を操作する MCP サーバー**

従来の Notion MCP は API のラッパーに過ぎず、1つの操作に複数回の通信が必要だった。
better-mcp-notion は **Markdown（frontmatter + 本文）1つ** で読み書きが完結する。

## 特徴

- **6ツールだけ** - 競合の 16〜22 ツールに対して、コンテキストウィンドウを節約
- **MD in, MD out** - 入出力が全て Markdown。AI にとって最も自然なフォーマット
- **1回で完結** - ページ作成、プロパティ設定、本文記述を 1 回の呼び出しで
- **read → edit → write** - 読んだ出力をそのまま編集して書き戻せる

## ツール一覧

| ツール | 概要 |
|--------|------|
| `read` | ページ → Markdown（depth 指定で子ページ再帰取得） |
| `write` | Markdown → ページ作成/更新（バッチ対応） |
| `search` | キーワード検索 → 結果リスト |
| `list` | DB 一覧/子ページ一覧（自然言語フィルタ・ソート） |
| `delete` | ページのアーカイブ |
| `move` | ページを別の親に移動 |

## セットアップ

### 1. Notion Integration を作成

1. https://www.notion.so/profile/integrations で新しい Integration を作成
2. API キー（`ntn_...`）をコピー
3. 操作したいページ/DB で「Connect to」から Integration を追加

### 2. インストール & ビルド

```bash
npm install
npm run build
```

### 3. MCP クライアントに接続

`.mcp.json`（プロジェクト単位）または MCP クライアントの設定に追加:

```json
{
  "mcpServers": {
    "better-notion": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/better-mcp-notion/build/index.js"],
      "env": {
        "NOTION_API_KEY": "ntn_your_api_key_here"
      }
    }
  }
}
```

## 使い方

### ページを読む

```
read("https://notion.so/My-Page-abc123def456")
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
write(`
---
title: Meeting Notes
parent: "Project Alpha"
icon: "📝"
---
## Agenda
- Review progress
- Discuss next steps
`)
```

### DB エントリを作成する

```
write(`
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
`)
```

### 複数ページを一括作成する

`===` で区切って複数ページを 1 回で作成:

```
write(`
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
`)
```

### DB を検索・フィルタする

```
list("Task Board", filter: "Status is Done AND Priority is High", sort: "Due Date ascending")
```

### ページを更新する（read の出力を編集して write に渡す）

```
write(`
---
id: abc123-def456
title: Updated Title
properties:
  Status: Done
---
## New content
Body replaces all existing blocks.
`)
```

## 開発

```bash
npm run dev       # TypeScript ウォッチモード
npm test          # テスト実行
npm run test:watch # テスト ウォッチモード
```

## 技術スタック

- **MCP**: @modelcontextprotocol/sdk
- **Notion API**: @notionhq/client v5
- **MD → Notion**: @tryfabric/martian
- **Notion → MD**: notion-to-md
- **Frontmatter**: gray-matter
- **バリデーション**: zod

## ライセンス

MIT
