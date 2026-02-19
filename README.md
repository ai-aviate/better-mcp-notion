# better-mcp-notion

[Japanese / 日本語](./README_ja.md)

**An MCP server that lets you operate Notion with a single Markdown document.**

Existing Notion MCP servers are thin API wrappers that require multiple round-trips for a single operation. better-mcp-notion uses **one Markdown document (YAML frontmatter + body)** to read, create, and update pages in a single call.

## Why better-mcp-notion?

| | Traditional Notion MCP | better-mcp-notion |
|---|---|---|
| Tools | 16-22 tools | **6 tools** |
| Create a DB entry | 3+ calls (search DB, get schema, create page, append blocks) | **1 call** |
| Edit a page | 4+ calls (get page, get blocks, delete blocks, append blocks) | **1 call** (read, edit, write) |
| Format | Raw JSON blocks | **Markdown** |
| Context window | Heavy (tool definitions + JSON) | **Light** |

## Tools

| Tool | Description |
|------|-------------|
| `read` | Read a Notion page as Markdown with frontmatter. Supports recursive child page reading with `depth`. |
| `write` | Create or update pages from Markdown. Supports batch operations and append/prepend. |
| `search` | Search the workspace by keyword. Returns a Markdown-formatted list. |
| `list` | List database records as a table or child pages as a list. Supports natural language filter & sort. |
| `update` | Quick property update without rewriting content. Just pass page + key-value pairs. |
| `schema` | View or modify database schema — add, remove, or rename columns. |
| `comment` | Add or read comments on a page. |
| `delete` | Archive (soft-delete) a page. |
| `move` | Move a page to a different parent page or database. |

## Quick Start

### 1. Create a Notion Integration

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) and create a new integration
2. Copy the API key (`ntn_...`)
3. Share the pages/databases you want to access with the integration ("Connect to" in the page menu)

### 2. Add to your MCP client

#### Claude Code

```bash
claude mcp add better-notion -- npx better-mcp-notion
```

Then set the environment variable:
```bash
export NOTION_API_KEY=ntn_your_api_key_here
```

#### Claude Desktop / Cursor / Windsurf

Add to your MCP config file (e.g. `claude_desktop_config.json`, `.cursor/mcp.json`):

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

#### From source

```bash
git clone https://github.com/ai-aviate/better-mcp-notion.git
cd better-mcp-notion
npm install && npm run build
```

Then point your MCP config to `node /path/to/better-mcp-notion/build/index.js`.

## Usage

### Read a page

```
read({ page: "https://notion.so/My-Page-abc123def456" })
```

Returns:

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

### Create a page

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

### Create a database entry

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

### Update a page (edit the output from read)

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

### Append content to an existing page

Use `position: "append"` to add content to the end without rewriting the entire page.
Only the new content needs to be provided — existing content is preserved.

```
write({ markdown: `
---
id: abc123-def456
---
## New section
This is added to the end of the page.
`, position: "append" })
```

`position: "prepend"` adds content to the beginning instead.

### Batch create (multiple pages in one call)

Separate pages with `===`:

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

### Query a database with filters

```
list({
  target: "Task Board",
  filter: "Status is Done AND Priority is High",
  sort: "Due Date ascending"
})
```

#### Filter syntax

- `Status is Done` / `Status = Done` - equals
- `Priority != Low` - not equals
- `Tags contains backend` - multi-select contains
- `Done is true` - checkbox
- `Score > 80` - number comparison (`>`, `<`, `>=`, `<=`)
- `Due Date after 2026-03-01` - date after/before
- Combine with `AND`: `Status is Done AND Priority is High`

#### Sort syntax

- `Due Date ascending` or `Due Date asc`
- `Created descending` or `Created desc`

### Read with child pages

```
read({ page: "parent-page-id", depth: 2 })
```

`depth: 1` = current page only (default), `2` = include children, `3` = include grandchildren.

### Quick property update

Update properties without rewriting content:

```
update({ page: "My Task", properties: { "Status": "Done", "Priority": "High" } })
```

### Manage database schema

```
// View schema
schema({ database: "Task Board" })

// Add a column
schema({ database: "Task Board", action: "add", property: "Priority", type: "select", options: ["Low", "Medium", "High"] })

// Rename a column
schema({ database: "Task Board", action: "rename", property: "Due", name: "Due Date" })

// Remove a column
schema({ database: "Task Board", action: "remove", property: "Old Column" })
```

### Comments

```
// Read comments
comment({ page: "abc123" })

// Add a comment
comment({ page: "abc123", body: "Looks good! Ready to ship." })
```

## Frontmatter Reference

### Write (create/update)

| Field | Create | Update | Description |
|-------|--------|--------|-------------|
| `id` | - | **required** | Page ID to update |
| `title` | recommended | optional | Page title |
| `parent` | required* | ignored | Parent page name or ID |
| `database` | required* | ignored | Database name or ID (*either `parent` or `database`) |
| `icon` | optional | optional | Emoji or image URL |
| `cover` | optional | optional | Cover image URL |
| `properties` | optional | optional | Database properties (matched against schema) |

### Read (output only)

| Field | Description |
|-------|-------------|
| `id` | Page UUID |
| `url` | Notion page URL |
| `title` | Page title |
| `parent` / `database` | Parent page or database ID |
| `icon`, `cover` | Emoji or image URL |
| `properties` | All database properties |
| `created`, `last_edited` | Timestamps (read-only) |

Read-only fields (`url`, `created`, `last_edited`, formulas, etc.) are safely ignored when passed to `write`.

## Development

```bash
npm run dev          # TypeScript watch mode
npm test             # Run tests
npm run test:watch   # Test watch mode
```

## License

[Elastic License 2.0 (ELv2)](./LICENSE) — Free to use, modify, and distribute. Cannot be offered as a managed/hosted service.
