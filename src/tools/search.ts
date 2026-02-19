/**
 * search ツール: ワークスペース検索 → MDリスト
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { search, type SearchResult } from "../notion/client.js";
import { formatError } from "../errors.js";

export function registerSearchTool(server: McpServer): void {
  server.tool(
    "search",
    `Search the Notion workspace by title keyword. Returns a Markdown list with page/database IDs, titles, and metadata.

Use the returned IDs with other tools: read (to get full content), write (to update), list (to query a database), delete, or move.

Example output:
# Search results: "MCP" (2 results)
1. **MCP Design Doc** (📝 page)
   - ID: \`abc123\`
   - Last edited: 2026-02-19
2. **Task Board** (database)
   - ID: \`def456\``,
    {
      query: z.string().describe("Search keyword (matched against page/database titles)"),
      filter: z
        .enum(["page", "database", "all"])
        .default("all")
        .describe('Filter by type: "page", "database", or "all" (default)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe("Max results (default: 10)"),
    },
    async ({ query, filter, limit }) => {
      try {
        const filterType = filter === "all" ? undefined : filter;
        const results = await search({ query, filter: filterType, limit });

        if (results.length === 0) {
          return {
            content: [
              { type: "text", text: `# Search results: "${query}" (0 results)\n\nNo results found.` },
            ],
          };
        }

        const lines: string[] = [`# Search results: "${query}" (${results.length} results)\n`];

        results.forEach((result, i) => {
          if (isPageResult(result)) {
            const title = getPageTitle(result);
            const icon = getPageIcon(result);
            lines.push(`${i + 1}. **${title}** (${icon} page)`);
            lines.push(`   - ID: \`${result.id}\``);
            lines.push(`   - Last edited: ${result.last_edited_time.slice(0, 10)}`);
            lines.push(`   - URL: ${result.url}`);
          } else {
            lines.push(`${i + 1}. **${result.title || "Untitled"}** (database)`);
            lines.push(`   - ID: \`${result.id}\``);
            if (result.url) {
              lines.push(`   - URL: ${result.url}`);
            }
          }
          lines.push("");
        });

        return {
          content: [{ type: "text", text: lines.join("\n") }],
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

function isPageResult(r: SearchResult): r is PageObjectResponse {
  return r.object === "page" && "properties" in r;
}

function getPageTitle(page: PageObjectResponse): string {
  const titleProp = Object.values(page.properties).find(
    (p) => p.type === "title"
  );
  if (titleProp && titleProp.type === "title") {
    return titleProp.title.map((t) => t.plain_text).join("") || "Untitled";
  }
  return "Untitled";
}

function getPageIcon(page: PageObjectResponse): string {
  if (page.icon?.type === "emoji") return page.icon.emoji;
  return "\u{1F4C4}"; // page emoji
}
