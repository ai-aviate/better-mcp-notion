# better-mcp-notion 要件定義書

## コンセプト

**「MDファイル1つでNotionを操作する」MCP サーバー**

既存のNotion MCPサーバーはAPIのラッパーに過ぎず、1つの操作に複数回のMCP通信が必要。
このプロジェクトでは、**ドキュメント単位（Markdownファイル）でNotionとやり取り**することで、
AIが人間と同じ柔軟性でNotionを操作できるようにする。

### 設計思想

- **ドキュメント中心**: ブロックやプロパティではなく、MD文書単位で操作する
- **1回で完結**: 1回のMCP呼び出しで意味のある操作が完了する
- **MD in, MD out**: 入力も出力もMarkdown（frontmatter + 本文）
- **人間と同じ柔軟性**: 人間がNotionでやれることをAIも1回でできる

### 既存MCPの課題（解決したいこと）

- ページ編集に複数回のMCP通信が必要（検索→取得→ブロック取得→更新）
- ツール数が多すぎてコンテキストウィンドウを圧迫（16〜22ツール）
- トークン効率が悪い（API JSONの往復）
- 低レベルなAPI操作を意識する必要がある

---

## 技術スタック

- **言語**: TypeScript
- **MCPフレームワーク**: @modelcontextprotocol/sdk
- **Notion API**: @notionhq/client（公式SDK）
- **認証**: Internal Integration Token（環境変数で設定）
- **トランスポート**: STDIO（CLIツール連携用）

---

## ツール設計

### 全6ツール

| # | ツール | 概要 | 入力 | 出力 |
|---|---|---|---|---|
| 1 | `read` | ページを読む | ページID or URL | MD（frontmatter + 本文） |
| 2 | `write` | ページを作成/更新 | MD（frontmatter + 本文） | 作成/更新されたページ情報 |
| 3 | `search` | ワークスペースを検索 | キーワード + オプション | マッチしたページのMDリスト |
| 4 | `list` | DB/ページの子要素一覧 | DB ID or ページID + フィルタ | MDテーブル or リスト |
| 5 | `delete` | ページをアーカイブ/削除 | ページID or URL | 結果メッセージ |
| 6 | `move` | ページを移動 | ページID + 移動先 | 結果メッセージ |

### 各ツール詳細

#### 1. `read`
ページの内容をMarkdownとして返す。

**パラメータ:**
- `page` (string, required): ページID or Notion URL

**レスポンス例:**
```markdown
---
id: abc123-def456
title: 週次レビュー 2026-02-19
parent: ワークスペース
icon: 📋
last_edited: 2026-02-19T10:00:00Z
url: https://notion.so/abc123
---

## 今週やったこと
- MCPサーバーの設計
- Notion APIの調査

## 来週やること
- プロトタイプ実装
```

#### 2. `write`
Markdownを渡してページを作成 or 更新する。

**パラメータ:**
- `markdown` (string, required): frontmatter + 本文のMarkdown
- `mode` (string, optional): `"create"` | `"update"` | `"auto"`（デフォルト: `"auto"`）
  - `auto`: frontmatterにidがあれば更新、なければ作成

**新規作成の例:**
```markdown
---
title: 新しいメモ
parent: プロジェクトノート  # ページ名 or ID
icon: 📝
---

# メモの内容
ここに本文を書く
```

**DB エントリ作成の例:**
```markdown
---
database: タスク管理DB  # DB名 or ID
properties:
  Title: APIリファクタリング
  Status: In Progress
  Tags:
    - backend
    - refactor
  Due Date: 2026-03-01
  Assignee: zer0
---

## タスク詳細
Notion APIのラッパーレイヤーをリファクタリングする。
```

**既存ページ更新の例:**
```markdown
---
id: abc123-def456
title: 週次レビュー 2026-02-19（更新）
---

## 今週やったこと
- MCPサーバーの設計
- Notion APIの調査
- **プロトタイプ作成**（追加）

## 来週やること
- テスト実装
```

#### 3. `search`
ワークスペース内を検索する。

**パラメータ:**
- `query` (string, required): 検索キーワード
- `filter` (string, optional): `"page"` | `"database"` | `"all"`（デフォルト: `"all"`）
- `limit` (number, optional): 最大件数（デフォルト: 10）

**レスポンス例:**
```markdown
# 検索結果: "MCP"（3件）

1. **週次レビュー 2026-02-19** (📋 ページ)
   - ID: `abc123`
   - 最終更新: 2026-02-19
   - > ...MCPサーバーの設計を開始した...

2. **タスク管理DB** (🗄️ データベース)
   - ID: `def456`
   - レコード数: 24

3. **MCP調査メモ** (📝 ページ)
   - ID: `ghi789`
   - 最終更新: 2026-02-15
   - > ...既存のMCP実装を比較した結果...
```

#### 4. `list`
データベースのレコード一覧やページの子要素を取得する。

**パラメータ:**
- `target` (string, required): DB ID/名前 or ページID
- `filter` (object, optional): フィルタ条件
- `sort` (string, optional): ソート条件
- `limit` (number, optional): 最大件数（デフォルト: 50）

**DBレコード一覧のレスポンス例:**
```markdown
# タスク管理DB（24件中10件表示）

| Title | Status | Tags | Due Date | Assignee |
|---|---|---|---|---|
| [APIリファクタ](notion://abc123) | In Progress | backend, refactor | 2026-03-01 | zer0 |
| [MCP設計](notion://def456) | Done | backend | 2026-02-19 | zer0 |
| [テスト追加](notion://ghi789) | Todo | testing | 2026-03-05 | - |
```

**ページの子要素一覧のレスポンス例:**
```markdown
# プロジェクトノート の子ページ（5件）

1. 📋 [週次レビュー 2026-02-19](notion://abc123) - 2026-02-19更新
2. 📝 [MCP調査メモ](notion://def456) - 2026-02-15更新
3. 🗄️ [タスク管理DB](notion://ghi789) - データベース（24件）
4. 📝 [設計メモ](notion://jkl012) - 2026-02-10更新
5. 📝 [議事録テンプレ](notion://mno345) - 2026-02-01更新
```

#### 5. `delete`
ページをアーカイブする。

**パラメータ:**
- `page` (string, required): ページID or URL

**レスポンス:**
```
アーカイブしました: "週次レビュー 2026-02-19" (abc123)
```

#### 6. `move`
ページを別の場所に移動する。

**パラメータ:**
- `page` (string, required): 移動するページのID or URL
- `to` (string, required): 移動先のページID or DB ID

**レスポンス:**
```
移動しました: "MCP調査メモ" → "アーカイブ" 配下
```

---

## MDフォーマット仕様

### frontmatter（YAML）

```yaml
---
# 識別情報（readで返却 / updateで指定）
id: <notion-page-id>
url: <notion-url>

# メタ情報
title: ページタイトル
icon: 📋           # emoji or URL
cover: <URL>       # カバー画像

# 階層情報
parent: <ページ名 or ID>     # 通常ページの場合
database: <DB名 or ID>       # DBエントリの場合

# DBプロパティ（DBエントリの場合）
properties:
  Status: In Progress
  Tags:
    - backend
    - urgent
  Due Date: 2026-03-01

# 読み取り専用（readで返却されるが、writeでは無視）
last_edited: 2026-02-19T10:00:00Z
created: 2026-02-01T09:00:00Z
---
```

### 本文（Markdown）

標準的なMarkdownを使用。Notion固有の拡張:

- 見出し: `#`, `##`, `###`（Notionのh1/h2/h3に対応）
- リスト: `-`, `1.`（箇条書き・番号付きリスト）
- チェックボックス: `- [ ]`, `- [x]`（To-doブロックに対応）
- コードブロック: `` ``` ``（コードブロックに対応）
- 引用: `>`（引用ブロックに対応）
- テーブル: MDテーブル記法
- 区切り線: `---`（Dividerブロック）
- コールアウト: `> 💡 テキスト`（アイコン付き引用 → Calloutブロック）
- トグル: 検討中

---

## 未解決の問い

- [ ] 画像やファイル添付はスコープに入れる？（v1ではスキップ？）
- [ ] 既存ページの部分更新 vs 全置換（v1は全置換でシンプルに？）
- [ ] ページネーション戦略（大量レコードのDB）
- [ ] parent/database を名前で指定するときの曖昧さ解消
- [ ] Notionのブロック型でMDに変換できないものの扱い（embed, bookmark等）
- [ ] コールアウトやトグルのMD表現
- [ ] バッチ操作（複数ページの一括作成）は必要？

---

## 参考: 既存実装との比較

| | better-mcp-notion | 公式MCP | suekou/mcp-notion |
|---|---|---|---|
| ツール数 | 6 | 16〜22 | 17 |
| インターフェース | MD (frontmatter + 本文) | JSON (API直結) | JSON + MD変換オプション |
| 1操作あたりの通信 | 1回 | 複数回必要な場合あり | 複数回必要な場合あり |
| トークン効率 | 高（MD最適化） | 低（JSONそのまま） | 中（MD変換あり） |
| 設計思想 | ドキュメント中心 | API中心 | API中心 + MD変換 |

---

## ステータス

- [x] アイデアブレスト
- [x] コアツール設計
- [x] MDフォーマット仕様（ドラフト）
- [x] 技術スタック決定（TypeScript）
- [ ] 未解決の問いを詰める
- [ ] プロジェクトセットアップ
- [ ] コア実装
- [ ] テスト・動作確認
