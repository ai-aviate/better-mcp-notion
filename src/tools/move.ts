/**
 * move ツール: ページ移動
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractId, isNotionId } from "../notion/helpers.js";
import { getPage, movePage, resolveByName, detectObjectType } from "../notion/client.js";
import { formatError } from "../errors.js";

export function registerMoveTool(server: McpServer): void {
  server.tool(
    "move",
    `Move a Notion page to a different parent page or database. The page keeps its content and properties; only the location changes.

Example: move a page into an "Archive" page, or move a task into a different database.`,
    {
      page: z.string().describe("Page ID or URL of the page to move"),
      to: z.string().describe("Destination: page name, database name, ID, or URL"),
    },
    async ({ page, to }) => {
      try {
        const pageId = extractId(page);

        // 移動元のタイトル取得
        const pageObj = await getPage(pageId);
        const titleProp = Object.values(pageObj.properties).find(
          (p) => p.type === "title"
        );
        const title =
          titleProp?.type === "title"
            ? titleProp.title.map((t) => t.plain_text).join("")
            : "Untitled";

        // 移動先の解決
        let destId: string;
        let destType: "page_id" | "data_source_id";

        if (isNotionId(to) || to.includes("notion.so") || to.includes("notion.site")) {
          destId = extractId(to);
          const detected = await detectObjectType(destId);
          destType = detected.type === "page" ? "page_id" : "data_source_id";
        } else {
          const resolved = await resolveByName(to);
          destId = resolved.id;
          destType = resolved.object === "page" ? "page_id" : "data_source_id";
        }

        await movePage(pageId, destId, destType);

        return {
          content: [
            {
              type: "text",
              text: `Moved: "${title}" → ${to} (${destId})`,
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
