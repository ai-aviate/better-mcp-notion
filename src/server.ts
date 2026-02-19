import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTool } from "./tools/read.js";
import { registerWriteTool } from "./tools/write.js";
import { registerSearchTool } from "./tools/search.js";
import { registerListTool } from "./tools/list.js";
import { registerDeleteTool } from "./tools/delete.js";
import { registerMoveTool } from "./tools/move.js";
import { registerUpdateTool } from "./tools/update.js";
import { registerSchemaTool } from "./tools/schema.js";
import { registerCommentTool } from "./tools/comment.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "better-mcp-notion",
    version: "0.3.2",
  });

  registerReadTool(server);
  registerWriteTool(server);
  registerSearchTool(server);
  registerListTool(server);
  registerDeleteTool(server);
  registerMoveTool(server);
  registerUpdateTool(server);
  registerSchemaTool(server);
  registerCommentTool(server);

  return server;
}
