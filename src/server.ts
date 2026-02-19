import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTool } from "./tools/read.js";
import { registerWriteTool } from "./tools/write.js";
import { registerSearchTool } from "./tools/search.js";
import { registerListTool } from "./tools/list.js";
import { registerDeleteTool } from "./tools/delete.js";
import { registerMoveTool } from "./tools/move.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "better-mcp-notion",
    version: "0.1.0",
  });

  registerReadTool(server);
  registerWriteTool(server);
  registerSearchTool(server);
  registerListTool(server);
  registerDeleteTool(server);
  registerMoveTool(server);

  return server;
}
