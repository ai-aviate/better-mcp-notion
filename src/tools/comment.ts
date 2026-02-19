/**
 * comment ツール: コメント追加・取得
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractId, isNotionId } from "../notion/helpers.js";
import { getClient, resolveByName } from "../notion/client.js";
import { formatError } from "../errors.js";

const DESCRIPTION = `Add or read comments on a Notion page.

## Read comments
  comment({ page: "abc123" })
  Returns all comments on the page as a Markdown list.

## Add a comment
  comment({ page: "abc123", body: "Looks good! Ready to ship." })
  Adds a comment to the page.

You can use the page name, ID, or URL.`;

export function registerCommentTool(server: McpServer): void {
  server.tool(
    "comment",
    DESCRIPTION,
    {
      page: z.string().describe("Page ID, URL, or name"),
      body: z
        .string()
        .optional()
        .describe("Comment text to add. If omitted, existing comments are returned instead."),
    },
    async ({ page, body }) => {
      try {
        // ページIDの解決
        let pageId: string;
        if (isNotionId(page) || page.includes("notion.so") || page.includes("notion.site")) {
          pageId = extractId(page);
        } else {
          const resolved = await resolveByName(page, "page");
          pageId = resolved.id;
        }

        if (body) {
          return await addComment(pageId, body);
        } else {
          return await listComments(pageId);
        }
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
          isError: true,
        };
      }
    }
  );
}

async function addComment(pageId: string, body: string) {
  const notion = getClient();
  await notion.comments.create({
    parent: { page_id: pageId },
    rich_text: [
      {
        type: "text",
        text: { content: body },
      },
    ],
  });

  return {
    content: [{ type: "text" as const, text: `Comment added to ${pageId}` }],
  };
}

async function listComments(pageId: string) {
  const notion = getClient();
  const allComments: Array<{
    id: string;
    created_time: string;
    rich_text: Array<{ plain_text: string }>;
    created_by: { id: string };
  }> = [];

  let cursor: string | undefined;
  while (true) {
    const response = await notion.comments.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const comment of response.results) {
      if ("rich_text" in comment) {
        allComments.push(comment as typeof allComments[number]);
      }
    }

    if (!response.has_more || !response.next_cursor) break;
    cursor = response.next_cursor;
  }

  if (allComments.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No comments on this page." }],
    };
  }

  const lines: string[] = [`# Comments (${allComments.length})\n`];
  for (const comment of allComments) {
    const date = comment.created_time.slice(0, 10);
    const text = comment.rich_text.map((t) => t.plain_text).join("");
    lines.push(`- **${date}**: ${text}`);
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
