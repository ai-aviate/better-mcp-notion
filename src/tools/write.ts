/**
 * write ツール: MD → ページ作成/更新
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractId, isNotionId } from "../notion/helpers.js";
import {
  getPage,
  createPage,
  updatePage,
  deleteAllBlocks,
  appendBlocks,
  getDatabaseDataSourceId,
  getDataSource,
  resolveByName,
} from "../notion/client.js";
import { parseMarkdown, markdownToNotionBlocks } from "../converter/to-notion.js";
import {
  frontmatterToProperties,
  buildPageProperties,
  extractDatabaseSchema,
} from "../converter/frontmatter.js";
import type { DocumentFrontmatter } from "../converter/types.js";
import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints.js";
import { formatError, NotionMcpError } from "../errors.js";

const URL_PATTERN = /^https?:\/\//;

function buildIcon(icon: string) {
  return URL_PATTERN.test(icon)
    ? { external: { url: icon } }
    : { emoji: icon };
}

const BATCH_SEPARATOR = "\n===\n";

const DESCRIPTION = `Create or update Notion pages from Markdown with YAML frontmatter.

Mode (default "auto"): if frontmatter has "id" → update, otherwise → create.

## Batch mode
Separate multiple pages with a line containing only "===" to create/update them in one call.

## Frontmatter fields

| Field | Create | Update | Description |
|-------|--------|--------|-------------|
| id | - | required | Page ID to update |
| title | recommended | optional | Page title |
| parent | required* | ignored | Parent page name or ID |
| database | required* | ignored | Database name or ID (*either parent or database) |
| icon | optional | optional | Emoji (e.g. 📋) or image URL |
| cover | optional | optional | Cover image URL |
| properties | optional | optional | DB properties (see below) |

Properties are auto-matched to the database schema. Use the exact property name as key.
Read-only fields from read output (url, created, last_edited, formula, etc.) are safely ignored.

## Examples

### Create a page under a parent page:
\`\`\`
---
title: Meeting Notes
parent: "Project Alpha"
icon: "📝"
---
## Agenda
- Review progress
\`\`\`

### Create a database entry:
\`\`\`
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
\`\`\`

### Update an existing page (edit output from read):
\`\`\`
---
id: abc123-def456
title: Updated Title
properties:
  Status: Done
---
## New content
Body replaces all existing blocks.
\`\`\`

### Batch create (multiple pages in one call):
\`\`\`
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
\`\`\`
`;

export function registerWriteTool(server: McpServer): void {
  server.tool(
    "write",
    DESCRIPTION,
    {
      markdown: z.string().describe("Markdown with YAML frontmatter. Separate multiple pages with '===' on its own line. See tool description for format."),
      mode: z
        .enum(["create", "update", "auto"])
        .default("auto")
        .describe('"auto" (default): create if no id, update if id present. "create": force create. "update": force update (requires id).'),
    },
    async ({ markdown, mode }) => {
      // バッチ分割
      const documents = markdown.split(BATCH_SEPARATOR).map((s) => s.trim()).filter(Boolean);

      if (documents.length === 1) {
        // 単一ページ
        try {
          const result = await processSingleWrite(documents[0], mode);
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return {
            content: [{ type: "text", text: formatError(error) }],
            isError: true,
          };
        }
      }

      // バッチ処理
      const results: string[] = [];
      let errors = 0;
      for (let i = 0; i < documents.length; i++) {
        try {
          const result = await processSingleWrite(documents[i], mode);
          results.push(`${i + 1}. ${result}`);
        } catch (error) {
          errors++;
          results.push(`${i + 1}. ERROR: ${formatError(error)}`);
        }
      }

      const summary = `Batch complete: ${documents.length - errors}/${documents.length} succeeded.\n\n${results.join("\n")}`;
      return {
        content: [{ type: "text", text: summary }],
        ...(errors > 0 ? { isError: true } : {}),
      };
    }
  );
}

// ─── Single page write ───

async function processSingleWrite(markdown: string, mode: string): Promise<string> {
  const { frontmatter: fm, content } = parseMarkdown(markdown);
  const blocks = markdownToNotionBlocks(content);

  const isUpdate = mode === "update" || (mode === "auto" && !!fm.id);
  const isCreate = mode === "create" || (mode === "auto" && !fm.id);

  if (isUpdate) return await doUpdate(fm, content, blocks);
  if (isCreate) return await doCreate(fm, blocks);
  throw new NotionMcpError("Invalid mode.", "INVALID_MODE");
}

async function doUpdate(
  fm: DocumentFrontmatter,
  content: string,
  blocks: BlockObjectRequest[]
): Promise<string> {
  if (!fm.id) {
    throw new NotionMcpError(
      'Update requires "id" in frontmatter.',
      "MISSING_ID"
    );
  }
  const pageId = extractId(fm.id);

  const existingPage = await getPage(pageId);
  const properties = await resolveProperties(fm, existingPage.parent);

  const updateParams: Parameters<typeof updatePage>[1] = {};
  if (Object.keys(properties).length > 0) {
    updateParams.properties = properties;
  }
  if (fm.icon) {
    updateParams.icon = buildIcon(fm.icon) as typeof updateParams.icon;
  }
  if (fm.cover) {
    updateParams.cover = { external: { url: fm.cover } };
  }

  await updatePage(pageId, updateParams as Parameters<typeof updatePage>[1]);

  if (content.trim()) {
    await deleteAllBlocks(pageId);
    await appendBlocks(pageId, blocks);
  }

  return `Updated: "${fm.title ?? pageId}" (${pageId})`;
}

async function doCreate(
  fm: DocumentFrontmatter,
  blocks: BlockObjectRequest[]
): Promise<string> {
  let parent: { page_id: string } | { database_id: string };
  let properties: Record<string, unknown>;

  if (fm.database) {
    const dbId = isNotionId(fm.database)
      ? extractId(fm.database)
      : (await resolveByName(fm.database, "database")).id;

    const dsId = await getDatabaseDataSourceId(dbId);
    const ds = await getDataSource(dsId);
    const schema = extractDatabaseSchema(ds);

    parent = { database_id: dbId };
    properties = frontmatterToProperties(fm, schema);
  } else if (fm.parent) {
    const parentId =
      fm.parent === "workspace"
        ? undefined
        : isNotionId(fm.parent)
          ? extractId(fm.parent)
          : (await resolveByName(fm.parent, "page")).id;

    if (!parentId) {
      throw new NotionMcpError(
        'Cannot create page at workspace root. Specify a parent page or database.',
        "INVALID_PARENT"
      );
    }
    parent = { page_id: parentId };
    properties = buildPageProperties(fm);
  } else {
    throw new NotionMcpError(
      'Either "parent" or "database" is required in frontmatter for creation.',
      "MISSING_PARENT"
    );
  }

  const createParams: Parameters<typeof createPage>[0] = {
    parent,
    properties,
    children: blocks.length > 0 ? blocks : undefined,
  };

  if (fm.icon) {
    createParams.icon = buildIcon(fm.icon) as typeof createParams.icon;
  }
  if (fm.cover) {
    createParams.cover = { external: { url: fm.cover } };
  }

  const newPage = await createPage(createParams);
  return `Created: "${fm.title ?? "Untitled"}" (${newPage.id})\nURL: ${newPage.url}`;
}

// ─── Property resolution ───

async function resolveProperties(
  fm: DocumentFrontmatter,
  parent: { type: string; [key: string]: unknown }
): Promise<Record<string, unknown>> {
  if (parent.type === "database_id" && typeof parent.database_id === "string") {
    const dsId = await getDatabaseDataSourceId(parent.database_id);
    const ds = await getDataSource(dsId);
    return frontmatterToProperties(fm, extractDatabaseSchema(ds));
  } else if (parent.type === "data_source_id" && typeof parent.data_source_id === "string") {
    const ds = await getDataSource(parent.data_source_id);
    return frontmatterToProperties(fm, extractDatabaseSchema(ds));
  } else if (parent.type === "page_id" || parent.type === "workspace") {
    return buildPageProperties(fm);
  }
  return buildPageProperties(fm);
}
