/**
 * delete ツール: ページをアーカイブ
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractId } from "../notion/helpers.js";
import { archivePage, getPage } from "../notion/client.js";
import { formatError } from "../errors.js";

export function registerDeleteTool(server: McpServer): void {
  server.tool(
    "delete",
    `Archive (soft-delete) a Notion page. The page is moved to Trash and can be restored from Notion's UI. This does NOT permanently delete the page.`,
    {
      page: z.string().describe("Page ID or Notion URL to archive"),
    },
    async ({ page }) => {
      try {
        const pageId = extractId(page);

        // タイトル取得用に先にページ情報を取る
        const pageObj = await getPage(pageId);
        const titleProp = Object.values(pageObj.properties).find(
          (p) => p.type === "title"
        );
        const title =
          titleProp?.type === "title"
            ? titleProp.title.map((t) => t.plain_text).join("")
            : "Untitled";

        await archivePage(pageId);

        return {
          content: [
            {
              type: "text",
              text: `Archived: "${title}" (${pageId})`,
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
