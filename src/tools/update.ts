/**
 * update ツール: 簡易プロパティ更新
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractId, isNotionId } from "../notion/helpers.js";
import {
  getPage,
  updatePage,
  getDatabaseDataSourceId,
  getDataSource,
  resolveByName,
} from "../notion/client.js";
import {
  frontmatterToProperties,
  buildPageProperties,
  extractDatabaseSchema,
} from "../converter/frontmatter.js";
import type { DocumentFrontmatter } from "../converter/types.js";
import { formatError } from "../errors.js";

const DESCRIPTION = `Quickly update page properties without rewriting content. Much simpler than the write tool for property-only changes.

The page content (blocks) is never touched — only properties are updated.

## Parameters
- page: Page ID, URL, or name
- properties: Key-value object of properties to set

## Examples

Update a single property:
  update({ page: "abc123", properties: { "Status": "Done" } })

Update multiple properties:
  update({ page: "My Task", properties: { "Status": "Done", "Priority": "High", "Due Date": "2026-03-01" } })

Supported value types:
- Text: "value"
- Number: 42
- Checkbox: true / false
- Date: "2026-03-01"
- Date range: "2026-03-01 to 2026-03-15"
- Select/Status: "Option Name"
- Multi-select: ["tag1", "tag2"]
- URL: "https://..."`;

export function registerUpdateTool(server: McpServer): void {
  server.tool(
    "update",
    DESCRIPTION,
    {
      page: z.string().describe("Page ID, URL, or name"),
      properties: z
        .record(z.unknown())
        .describe('Properties to update as key-value pairs (e.g. { "Status": "Done", "Priority": "High" })'),
    },
    async ({ page, properties }) => {
      try {
        // ページIDの解決
        let pageId: string;
        if (isNotionId(page) || page.includes("notion.so") || page.includes("notion.site")) {
          pageId = extractId(page);
        } else {
          const resolved = await resolveByName(page, "page");
          pageId = resolved.id;
        }

        // ページ取得してスキーマ解決
        const existingPage = await getPage(pageId);
        const resolvedProperties = await resolveUpdateProperties(
          properties,
          existingPage.parent
        );

        await updatePage(pageId, { properties: resolvedProperties });

        // タイトル取得
        const titleProp = Object.values(existingPage.properties).find(
          (p) => p.type === "title"
        );
        const title =
          titleProp?.type === "title"
            ? titleProp.title.map((t) => t.plain_text).join("")
            : "Untitled";

        const keys = Object.keys(properties).join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Updated "${title}" (${pageId}): ${keys}`,
            },
          ],
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

async function resolveUpdateProperties(
  properties: Record<string, unknown>,
  parent: { type: string; [key: string]: unknown }
): Promise<Record<string, unknown>> {
  // FM形式に変換して既存の変換ロジックを使う
  const fm: DocumentFrontmatter = { properties: properties as Record<string, unknown> };

  if (parent.type === "database_id" && typeof parent.database_id === "string") {
    const dsId = await getDatabaseDataSourceId(parent.database_id);
    const ds = await getDataSource(dsId);
    return frontmatterToProperties(fm, extractDatabaseSchema(ds));
  } else if (parent.type === "data_source_id" && typeof parent.data_source_id === "string") {
    const ds = await getDataSource(parent.data_source_id);
    return frontmatterToProperties(fm, extractDatabaseSchema(ds));
  }
  return buildPageProperties(fm);
}
