/**
 * read ツール: ページ → MD
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { extractId } from "../notion/helpers.js";
import { getPage, listChildren } from "../notion/client.js";
import { pageToMarkdown } from "../converter/to-markdown.js";
import { getClient } from "../notion/client.js";
import { formatError } from "../errors.js";

const DESCRIPTION = `Read a Notion page and return it as Markdown with YAML frontmatter.

Returns frontmatter fields:
- id, url: page identifiers
- title: page title
- parent / database: parent page ID or database ID
- icon, cover: emoji or image URL
- properties: database properties (if the page belongs to a database)
- created, last_edited: timestamps (read-only)

The body contains the page content as standard Markdown.

The output can be edited and passed directly to the "write" tool to update the page.

Use "depth" to include child pages in a single call (default: 1 = current page only, 2 = include children, 3 = include grandchildren).

Example output:
---
id: abc123-def456
title: Weekly Review
database: task-db-id
properties:
  Status: In Progress
  Tags:
    - backend
---
## Notes
- Completed API design
`;

export function registerReadTool(server: McpServer): void {
  server.tool(
    "read",
    DESCRIPTION,
    {
      page: z.string().describe("Notion page URL (https://notion.so/...) or page ID (UUID or 32-char hex)"),
      depth: z
        .number()
        .int()
        .min(1)
        .max(3)
        .default(1)
        .describe("How deep to read child pages: 1 = this page only (default), 2 = include children, 3 = include grandchildren"),
    },
    async ({ page, depth }) => {
      try {
        const pageId = extractId(page);
        const client = getClient();
        const parts: string[] = [];

        await readRecursive(client, pageId, depth, 0, parts);

        return {
          content: [{ type: "text", text: parts.join("\n---\n\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatError(error) }],
          isError: true,
        };
      }
    }
  );
}

async function readRecursive(
  client: InstanceType<typeof import("@notionhq/client").Client>,
  pageId: string,
  maxDepth: number,
  currentDepth: number,
  parts: string[]
): Promise<void> {
  const pageObj = await getPage(pageId);
  const markdown = await pageToMarkdown(client, pageObj);
  parts.push(markdown);

  if (currentDepth + 1 >= maxDepth) return;

  // 子ページを取得して再帰
  const children = await listChildren(pageId);
  for (const child of children) {
    await readRecursive(client, child.id, maxDepth, currentDepth + 1, parts);
  }
}
